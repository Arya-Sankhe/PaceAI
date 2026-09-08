# PaceAI backend

FastAPI joins the current dummy machine snapshot with manual pages retrieved from Supabase, then asks Gemini for one cited diagnostic response.

## Setup

1. Run `migrations/001_initial_schema.sql` in Supabase.
2. Create private Storage buckets named `manual-documents` and `manual-pages`.
3. Copy the repository `.env.example` to `.env` and set the Supabase and Gemini values.
4. Run `docker compose up --build` from the repository root.

`DEMO_MODE=true` skips login and uses generated machine data. `MOCK_FAULT=hor_front_temp` on `MOCK_FAULT_MACHINE=orion_1` provides the default reproducible fault. Manual upload, retrieval, and Gemini diagnosis still use the configured Supabase and Gemini services.

The current source boundary is `app/machine_source.py`. Replace its `source` object when a real read-only PLC adapter is commissioned; the API, RAG, and UI should not change.
