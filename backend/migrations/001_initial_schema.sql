-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Orion AI Copilot Database Baseline (v0.5 MVP)
-- Core Invariants:
--   - pgcrypto (gen_random_uuid), pgvector(1536), pg_trgm
--   - Dual 1536-dim embeddings: text_embedding + image_embedding (gemini-embedding-2)
--   - Generated search_tsv for native full-text search
--   - Outbound-only edge collector ledger: edge_devices, collector_records
--   - Tiered telemetry: telemetry_latest, telemetry_events, telemetry_rollups_1m
--   - Private storage only: storage_path (no public image_url)
--   - Row Level Security (RLS) ENABLED with default-deny on all tables
--   - Zero plant/OT network addresses stored in cloud DB
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- 1. Machine Registry & Edge Collector Ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_key TEXT UNIQUE NOT NULL,             -- e.g. 'orion_1', 'orion_2'
    name TEXT NOT NULL,                           -- 'Orion VFFS Machine #1'
    model TEXT DEFAULT '4PPC80.121E-10A',
    manufacturer TEXT DEFAULT 'B&R Industrial Automation GmbH',
    timezone TEXT DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edge_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotency ledger for outbound-only collector batches
CREATE TABLE IF NOT EXISTS collector_records (
    edge_id UUID NOT NULL REFERENCES edge_devices(id) ON DELETE CASCADE,
    boot_id UUID NOT NULL,
    sequence BIGINT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (edge_id, boot_id, sequence)
);

-- -----------------------------------------------------------------------------
-- 2. Tiered Telemetry Engine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry_latest (
    machine_id UUID PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
    source_ts TIMESTAMPTZ NOT NULL,
    edge_ts TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    quality TEXT NOT NULL DEFAULT 'good' CHECK (quality IN ('good', 'uncertain', 'bad')),
    metrics JSONB NOT NULL,
    CONSTRAINT metrics_is_object CHECK (jsonb_typeof(metrics) = 'object')
);

CREATE TABLE IF NOT EXISTS telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,                     -- 'fault', 'alarm', 'state_change'
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error', 'critical')),
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_machine_ts 
    ON telemetry_events(machine_id, ts DESC);

CREATE TABLE IF NOT EXISTS telemetry_rollups_1m (
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    bucket TIMESTAMPTZ NOT NULL,
    metric_key TEXT NOT NULL,
    min_val NUMERIC,
    max_val NUMERIC,
    avg_val NUMERIC,
    sample_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (machine_id, bucket, metric_key)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_rollups_1m_query 
    ON telemetry_rollups_1m(machine_id, metric_key, bucket DESC);

-- -----------------------------------------------------------------------------
-- 3. Document Library & Dual 1536-d Manual Pages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_key TEXT NOT NULL,                     -- 'orion_vffs'
    revision TEXT NOT NULL,                       -- 'rev3.1'
    sha256 TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_pages INT NOT NULL DEFAULT 0,
    pdf_storage_path TEXT NOT NULL,              -- Private bucket path
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES manual_documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    storage_path TEXT NOT NULL,                   -- Private path only (signed URLs minted at request time)
    
    page_type TEXT DEFAULT 'unknown',             -- Non-blocking on enrichment failures
    subsystem TEXT DEFAULT 'unknown',
    error_codes_indexed TEXT[] DEFAULT '{}',
    component_tags TEXT[] DEFAULT '{}',
    summary TEXT,
    extracted_text TEXT NOT NULL DEFAULT '',
    
    -- Dual Gemini Embedding 2 vectors (1536-dim)
    text_embedding vector(1536),
    image_embedding vector(1536),
    embedding_profile TEXT NOT NULL DEFAULT 'gemini-embedding-2',
    
    -- Full-text search tsvector (generated & stored)
    search_tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(summary, '') || ' ' || extracted_text)
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_manual_pages_doc_num UNIQUE (document_id, page_number)
);

-- Search Indexes
CREATE INDEX IF NOT EXISTS idx_manual_pages_text_hnsw 
    ON manual_pages USING hnsw (text_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_manual_pages_image_hnsw 
    ON manual_pages USING hnsw (image_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_manual_pages_tsv 
    ON manual_pages USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_manual_pages_error_codes 
    ON manual_pages USING gin (error_codes_indexed);

CREATE INDEX IF NOT EXISTS idx_manual_pages_components 
    ON manual_pages USING gin (component_tags);

-- -----------------------------------------------------------------------------
-- 4. Conversations & Evidence-Linked Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                                 -- References auth.users(id)
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    title TEXT DEFAULT 'Diagnostic Session',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    evidence JSONB DEFAULT '{}'::jsonb,           -- {record_keys: [], event_ids: [], page_ids: [], scores: []}
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) — Default Deny on all application tables
-- -----------------------------------------------------------------------------
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_rollups_1m ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Revoke default public execution & access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Seed default machines (keys only, no IPs)
INSERT INTO machines (machine_key, name, model, manufacturer, is_active)
VALUES 
    ('orion_1', 'Orion VFFS #1', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true),
    ('orion_2', 'Orion VFFS #2', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true)
ON CONFLICT (machine_key) DO NOTHING;
