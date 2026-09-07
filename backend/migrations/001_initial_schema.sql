-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Unified Database Schema for Orion VFFS Copilot (Supabase / Postgres)
-- Includes:
--   1. Extensions (vector, uuid-ossp)
--   2. Machines & Edge Configuration
--   3. Telemetry Time-Series & Rollup Indexes
--   4. Manual Documents & Multimodal Pages (1408-dim Google Vector)
--   5. Hybrid Vector Retrieval RPC (match_manual_pages)
--   6. Copilot Conversation Sessions & Messages
--   7. Single-Pass Safe Telemetry Aggregation RPC (get_telemetry_summary)
--   8. Default Machine Seed Data
-- =============================================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 2. Registered Machines
-- =============================================================================
CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,                           -- e.g. 'orion_1', 'orion_2'
    name TEXT NOT NULL,                            -- 'Orion VFFS Machine #1'
    opc_url TEXT NOT NULL,                         -- 'opc.tcp://192.168.213.1:4840'
    hmi_url TEXT NOT NULL,                         -- 'http://192.168.213.1:81'
    model TEXT DEFAULT '4PPC80.121E-10A',
    manufacturer TEXT DEFAULT 'B&R Industrial Automation GmbH',
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. Telemetry Samples (Time-Series)
-- =============================================================================
CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    metrics JSONB NOT NULL
);

-- Composite index for high-speed historical telemetry range queries
CREATE INDEX IF NOT EXISTS idx_telemetry_machine_ts 
    ON telemetry_samples(machine_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_metrics_gin 
    ON telemetry_samples USING gin (metrics);

-- =============================================================================
-- 4. Manual Documents (PDF Engineering Specifications & Schematics)
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,                           -- e.g. 'Orion VFFS Operating & Maintenance Manual'
    filename TEXT NOT NULL,                        -- e.g. 'Orion_VFFS_Manual_Rev3.pdf'
    version TEXT DEFAULT '1.0',
    total_pages INT NOT NULL DEFAULT 0,
    pdf_storage_path TEXT NOT NULL,              -- Storage bucket path: 'manuals/{id}/source.pdf'
    status TEXT DEFAULT 'pending',                -- 'pending', 'processing', 'completed', 'failed'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 5. Manual Pages (High-Res Images, Multimodal Vectors & Semantic Roles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES manual_documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    image_storage_path TEXT NOT NULL,              -- 'manual-pages/{doc_id}/page_{n}.png'
    image_url TEXT NOT NULL,                       -- Public CDN or signed URL
    
    -- Semantic classification (extracted by Gemini 2.5 Flash)
    page_type TEXT NOT NULL,                       -- 'electrical_schematic', 'troubleshooting', 'procedure', 'parts_catalog', 'parameter_table'
    subsystem TEXT NOT NULL,                       -- 'Cross Seal', 'Heater Zones', 'Film Feed', 'Poker', 'Unwind', 'Box Forming', 'Safety & I/O'
    error_codes_indexed TEXT[] DEFAULT '{}',       -- ['32014', '32015']
    component_tags TEXT[] DEFAULT '{}',            -- ['SSR 2', 'Thermocouple T1', 'Axis_CS Servo']
    summary TEXT,
    extracted_text TEXT,
    
    -- Google Multimodal 1408-dimensional dense vector
    embedding vector(1408),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Compound index for fast sequential document browsing
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_pages_doc_page 
    ON manual_pages(document_id, page_number);

-- B-tree indexes for fast relational metadata pre-filtering
CREATE INDEX IF NOT EXISTS idx_manual_pages_subsystem 
    ON manual_pages(subsystem);

CREATE INDEX IF NOT EXISTS idx_manual_pages_page_type 
    ON manual_pages(page_type);

-- GIN indexes for array containment lookups (e.g. error code = '32014')
CREATE INDEX IF NOT EXISTS idx_manual_pages_error_codes 
    ON manual_pages USING gin(error_codes_indexed);

CREATE INDEX IF NOT EXISTS idx_manual_pages_components 
    ON manual_pages USING gin(component_tags);

-- HNSW Vector index for sub-15ms approximate nearest neighbor cosine search
CREATE INDEX IF NOT EXISTS idx_manual_pages_embedding_hnsw 
    ON manual_pages 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 6. Hybrid Search RPC Function (Vector Cosine + Metadata Filter)
-- =============================================================================
CREATE OR REPLACE FUNCTION match_manual_pages (
    query_embedding vector(1408),
    filter_subsystem TEXT DEFAULT NULL,
    filter_page_type TEXT DEFAULT NULL,
    filter_error_code TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.50,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    page_number INT,
    image_url TEXT,
    page_type TEXT,
    subsystem TEXT,
    summary TEXT,
    extracted_text TEXT,
    error_codes_indexed TEXT[],
    component_tags TEXT[],
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT 
        p.id,
        p.document_id,
        p.page_number,
        p.image_url,
        p.page_type,
        p.subsystem,
        p.summary,
        p.extracted_text,
        p.error_codes_indexed,
        p.component_tags,
        (1 - (p.embedding <=> query_embedding))::FLOAT AS similarity
    FROM manual_pages p
    JOIN manual_documents d ON d.id = p.document_id
    WHERE 
        d.status = 'completed'
        AND (NULLIF(filter_subsystem, '') IS NULL OR p.subsystem = filter_subsystem)
        AND (NULLIF(filter_page_type, '') IS NULL OR p.page_type = filter_page_type)
        AND (NULLIF(filter_error_code, '') IS NULL OR p.error_codes_indexed @> ARRAY[filter_error_code])
        AND p.embedding IS NOT NULL
        AND (p.embedding <=> query_embedding) < (1.0 - match_threshold)
    ORDER BY p.embedding <=> query_embedding
    LIMIT COALESCE(match_count, 5);
$$;

-- =============================================================================
-- 7. Telemetry Aggregations RPC (Single-Pass Safe Summary)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_telemetry_summary (
    target_machine_id TEXT,
    metric_keys TEXT[],
    lookback_interval INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Null-safety check on metric_keys array
    IF metric_keys IS NULL OR array_length(metric_keys, 1) IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    -- Single-pass aggregation with regex check to safely cast numeric metrics
    SELECT COALESCE(
        jsonb_object_agg(
            m.key,
            json_build_object(
                'min', ROUND(MIN(m.val::numeric), 2),
                'max', ROUND(MAX(m.val::numeric), 2),
                'avg', ROUND(AVG(m.val::numeric), 2)
            )
        ),
        '{}'::jsonb
    )
    INTO result
    FROM (
        SELECT kv.key, kv.value AS val
        FROM telemetry_samples t,
             jsonb_each_text(t.metrics) kv
        WHERE t.machine_id = target_machine_id
          AND t.ts >= now() - COALESCE(lookback_interval, INTERVAL '24 hours')
          AND kv.key = ANY(metric_keys)
          AND kv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    ) m;

    RETURN result;
END;
$$;

-- =============================================================================
-- 8. Diagnostic Copilot Conversation History
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_id TEXT REFERENCES machines(id) ON DELETE SET NULL,
    title TEXT DEFAULT 'Diagnostic Session',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,              -- Cited manual page references
    telemetry_snapshot JSONB DEFAULT NULL,          -- Live machine state captured at message time
    tokens_used JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session 
    ON chat_messages(session_id, created_at ASC);

-- =============================================================================
-- 9. Seed Registered Orion Machines
-- =============================================================================
INSERT INTO machines (id, name, opc_url, hmi_url, model, manufacturer, is_active)
VALUES 
    ('orion_1', 'Orion VFFS #1', 'opc.tcp://192.168.213.1:4840', 'http://192.168.213.1:81', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true),
    ('orion_2', 'Orion VFFS #2', 'opc.tcp://192.168.213.2:4840', 'http://192.168.213.2:81', '4PPC80.121E-10A', 'B&R Industrial Automation GmbH', true)
ON CONFLICT (id) DO UPDATE SET
    opc_url = EXCLUDED.opc_url,
    hmi_url = EXCLUDED.hmi_url,
    updated_at = now();
