-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Orion AI Copilot Database Baseline (v0.5 MVP)
-- Core Invariants:
--   - pgcrypto (gen_random_uuid), pgvector(1536), pg_trgm
--   - Dual 1536-dim embeddings: text_embedding + image_embedding (gemini-embedding-2)
--   - Generated search_tsv for native full-text search
--   - Outbound-only edge collector ledger & telemetry tiering
--   - Raw 5s telemetry samples + 1m rollups + latest + events
--   - Ingestion jobs queue with FOR UPDATE SKIP LOCKED support
--   - App users with role mapping (viewer | operator | admin)
--   - Private storage paths only; RLS default-deny with role-scoped policies
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- Helper: Updated_At Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. App Users (Role mapping for authenticated Supabase users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'operator', 'admin')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Machine Registry & Edge Collector Ledger
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
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One collector can service multiple machine sessions
CREATE TABLE IF NOT EXISTS edge_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotency ledger for outbound-only collector batches
CREATE TABLE IF NOT EXISTS collector_records (
    edge_id UUID NOT NULL REFERENCES edge_devices(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    boot_id UUID NOT NULL,
    sequence BIGINT NOT NULL,
    source_ts TIMESTAMPTZ NOT NULL,
    edge_ts TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (edge_id, boot_id, sequence)
);

-- -----------------------------------------------------------------------------
-- 3. Tiered Telemetry Engine
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

CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    source_ts TIMESTAMPTZ NOT NULL,
    edge_ts TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    quality TEXT NOT NULL DEFAULT 'good' CHECK (quality IN ('good', 'uncertain', 'bad')),
    metrics JSONB NOT NULL,
    CONSTRAINT samples_metrics_is_object CHECK (jsonb_typeof(metrics) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_telemetry_samples_machine_ts 
    ON telemetry_samples(machine_id, source_ts DESC);

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
-- 4. Document Library, Ingestion Jobs & Manual Pages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manual_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_key TEXT NOT NULL,                     -- 'orion_vffs'
    revision TEXT NOT NULL,                       -- 'rev3.1'
    sha256 TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_pages INT NOT NULL DEFAULT 0,
    parser_version TEXT DEFAULT '1.0',
    pdf_storage_path TEXT NOT NULL,              -- Private bucket path
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_manual_documents_updated_at BEFORE UPDATE ON manual_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce exactly one active revision per document family
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_revision_per_family 
    ON manual_documents (family_key) 
    WHERE is_active = true;

-- Background worker queue for PDF ingestion
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES manual_documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempt_count INT NOT NULL DEFAULT 0,
    leased_until TIMESTAMPTZ,                        -- crash recovery: expired lease = retryable
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_ingestion_jobs_updated_at BEFORE UPDATE ON ingestion_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_pending 
    ON ingestion_jobs(status, created_at) 
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS manual_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES manual_documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    storage_path TEXT NOT NULL,                   -- Private path only
    
    page_type TEXT DEFAULT 'unknown',
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
-- 5. Conversations & Evidence-Linked Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
    title TEXT DEFAULT 'Diagnostic Session',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    evidence JSONB DEFAULT '{}'::jsonb,           -- {record_keys: [], event_ids: [], page_ids: [], scores: [], model: "", latency_ms: 0}
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) & Policies
-- -----------------------------------------------------------------------------
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_rollups_1m ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Revoke default public execution & access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;

-- Table-level grants (policies alone grant nothing without these)
GRANT SELECT ON machines, telemetry_latest, telemetry_samples, telemetry_events, telemetry_rollups_1m, manual_documents, manual_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations, messages TO authenticated;
GRANT SELECT ON app_users TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Policy: users read only their own role row (backend resolves roles server-side)

-- Policy: Authenticated users can read machines, telemetry, and manual docs
CREATE POLICY "authenticated_read_machines" ON machines FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_telemetry_latest" ON telemetry_latest FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_telemetry_samples" ON telemetry_samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_telemetry_events" ON telemetry_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_telemetry_rollups" ON telemetry_rollups_1m FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_documents" ON manual_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_pages" ON manual_pages FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_own_app_user" ON app_users FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Policy: Authenticated users manage only their own conversations & messages
CREATE POLICY "user_own_conversations" ON conversations FOR ALL TO authenticated 
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_messages" ON messages FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM conversations WHERE id = messages.conversation_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE id = messages.conversation_id AND user_id = auth.uid()));

-- Policy: Full service-role access for backend ingestion & collector workers
CREATE POLICY "service_role_all_machines" ON machines FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_edge" ON edge_devices FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_collector" ON collector_records FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_latest" ON telemetry_latest FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_samples" ON telemetry_samples FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_events" ON telemetry_events FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_rollups" ON telemetry_rollups_1m FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_docs" ON manual_documents FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_jobs" ON ingestion_jobs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_pages" ON manual_pages FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_conv" ON conversations FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_msg" ON messages FOR ALL TO service_role USING (true);

-- -----------------------------------------------------------------------------
-- 7. Seed Default Machines
-- -----------------------------------------------------------------------------
INSERT INTO machines (machine_key, name, model, manufacturer, is_active)
VALUES 
    ('orion_1', 'Orion VFFS #1', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true),
    ('orion_2', 'Orion VFFS #2', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true)
ON CONFLICT (machine_key) DO NOTHING;
