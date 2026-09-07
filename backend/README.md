# Orion AI Copilot — Backend Service

Unified FastAPI backend connecting B&R Industrial PLCs (Orion VFFS packaging machines) with Google Multimodal RAG and Supabase.

---

## 1. Supabase Setup Guide

### A. Run Database Migrations
1. Open your project on [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor**.
3. Copy the entire contents of [`migrations/001_initial_schema.sql`](./migrations/001_initial_schema.sql) and paste into the query window.
4. Click **Run**. This will:
   - Enable the `vector` and `uuid-ossp` extensions.
   - Create tables: `machines`, `telemetry_samples`, `manual_documents`, `manual_pages`, `chat_sessions`, and `chat_messages`.
   - Set up HNSW vector indexing (`vector(1408)` with cosine distance).
   - Create the hybrid search RPC function `match_manual_pages`.
   - Seed default machine records for Orion #1 and #2.

### B. Create Storage Buckets
1. In the Supabase Dashboard, go to **Storage** -> **Buckets**.
2. Create two public buckets (or private with signed URL policies):
   - `manual-documents` (for source PDF manuals)
   - `manual-pages` (for rendered high-res page PNGs)

### C. Environment Configuration
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
Provide:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

---

## 2. Directory Structure

```
backend/
├── app/
│   ├── api/
│   │   └── routes/          # REST & SSE streaming endpoints
│   ├── core/
│   │   ├── config.py        # Pydantic environment configuration
│   │   ├── supabase.py      # Supabase singleton client
│   │   ├── opcua.py         # Async B&R PLC telemetry poller
│   │   ├── ingestion.py     # Multimodal PDF renderer & embedder
│   │   └── agent.py         # Tool-calling diagnostic copilot
│   └── models/
│       └── schemas.py       # Pydantic schemas
├── migrations/
│   └── 001_initial_schema.sql # Complete Supabase DDL migration
├── requirements.txt         # Python dependencies
└── .env.example
```
