# PaceAI Orion — Simple MVP Architecture

**Status:** MVP implementation baseline
**Date:** 2026-09-08
**Deployment:** local Docker Compose or one small VPS, Supabase Cloud, Gemini API

## 1. Product decision

PaceAI joins two inputs:

1. **Machine semantics:** searchable pages from the machine manual. Gemini embeddings and retrieval identify the component, fault, procedure, and terminology relevant to a user's question.
2. **Current machine state:** a small, current snapshot of machine values. For this MVP the snapshot is generated dummy data; later the same shape can come from a read-only PLC adapter.

The user asks one question, for example: “Why is the front heater not reaching temperature?” The server retrieves the relevant manual pages, loads the current snapshot, and asks Gemini for one cited, safety-aware diagnosis grounded in both. There is no autonomous agent loop and no model tool access.

The MVP deliberately uses the existing, understandable stack:

```text
Next.js browser → FastAPI → Supabase Postgres/Auth/private Storage
                         ↘ Gemini embeddings + generation

FastAPI dummy source → current snapshot
```

The real PLC is a future replacement for the dummy source, not an MVP dependency.

## 2. Scope

### 2.1 Build now

- One web application; local demo mode skips login, while deployed mode uses Supabase Auth.
- A machine cockpit showing every plc-dashboard parameter (heaters, drives, OEE, I/O, identity), freshness, and basic events.
- A dummy data source with configurable parameters and reproducible faults.
- Manual PDF upload, page extraction, Gemini page metadata, and Gemini text/image embeddings.
- Supabase Postgres with `pgvector` and full-text search.
- A fixed retrieval flow combining exact terms, FTS, and vector similarity.
- One grounded Gemini diagnostic response with observed facts, hypotheses, next checks, warnings, and citations.
- Private manual storage and Supabase Auth.
- A small worker only for the slow manual-ingestion work.

### 2.2 Explicitly out of scope

- Connecting to a PLC during MVP development.
- OPC UA sessions, subscriptions, certificates, PLC writes, plant networking, or HMI integration.
- Multi-tenant organizations, complex roles, fleet management, or billing.
- A broker, event bus, vector service, cache, agent framework, reranker, OCR system, or separate time-series database.
- Seven-day edge buffering, replay protocols, device provisioning, or production collector security.
- Canonical OEE, advanced alarm logic, automatic root-cause claims, or control recommendations.
- A production evaluation program. A few smoke cases are enough until the product loop works.

### 2.3 MVP invariants

- Gemini receives only the user's question, selected manual evidence, and the selected machine snapshot.
- The model cannot query SQL, call the PLC, browse, execute code, or control the machine.
- No answer may claim a value that is absent, stale, or marked bad.
- Citations must come from pages actually retrieved for that answer.
- The app is read-only with respect to machine data.
- The dummy source and a future PLC source produce the same normalized snapshot shape.

## 3. Technology baseline

| Concern | Choice |
|---|---|
| Web | Next.js and TypeScript |
| API | FastAPI and Pydantic |
| Database | Supabase Postgres, `pgvector`, PostgreSQL FTS |
| Authentication | Supabase Auth |
| Files | Supabase private Storage, short-lived signed URLs |
| Embeddings | Gemini `gemini-embedding-2`, one pinned dimension |
| Generation | Configured Gemini model returning JSON |
| PDF | Existing `pypdfium2`/`pypdf` path |
| Background work | One small Python worker polling `ingestion_jobs` |
| Runtime | Docker Compose: `web`, `api`, and one manual `worker` |

Keep model IDs, embedding dimension, and prompt version in configuration. Do not build a versioning framework around them yet.

## 4. Runtime components

### 4.1 Web

The browser uses Supabase Auth for login and same-origin FastAPI routes for application data. It shows:

- current machine values (full plc-dashboard parameter set) and freshness;
- a small history view;
- recent events;
- uploaded manual pages; and
- the diagnostic chat with citations and safety/freshness warnings.

The browser never receives the Gemini or Supabase service-role key and never talks directly to application tables.

### 4.2 API

FastAPI is the application boundary. It:

- validates the Supabase access token;
- reads and writes the small application schema;
- accepts normalized telemetry snapshots;
- serves current state, history, events, manuals, and signed page URLs;
- performs retrieval;
- builds the single Gemini request;
- validates the JSON response and citation allowlist; and
- streams or returns the completed diagnostic response.

Use the existing route names where possible:

```text
GET  /api/v1/machines
GET  /api/v1/machines/{key}/latest
GET  /api/v1/machines/{key}/history
GET  /api/v1/machines/{key}/events
POST /api/v1/machines/{key}/chat

POST /api/v1/documents/upload
GET  /api/v1/documents
GET  /api/v1/documents/{id}/pages/{number}/signed-url
POST /api/v1/documents/{id}/activate

GET  /health/live
GET  /health/ready
```

### 4.3 Dummy source and future source seam

Keep one small source boundary, for example:

```python
class MachineSource:
    async def snapshot(self) -> dict[str, dict]: ...
```

`DummySource` is the only required implementation now. It generates snapshots inside the API process. Later, replace the configured source with `OpcUaSource`; do not spread PLC assumptions through the API, database, RAG, or UI.

### 4.4 Worker

The worker exists only because PDF rendering and Gemini calls are slow. It claims one pending `ingestion_jobs` row, processes pages, upserts page rows, and marks the document ready or failed. A restart may retry a job. No general-purpose queue, lease protocol, rollup service, or maintenance scheduler is required for the MVP.

## 5. Normalized dummy machine data

The source emits one JSON snapshot per machine. Numeric PLC tags stay in `values` as floats (bools as `0.0`/`1.0`). String identity and axis error text live in `info`. OEE downtime labels live in `titles` because the PLC sorts those arrays by count.

```json
{
  "machine_key": "orion_1",
  "source_ts": "2026-09-08T10:00:00Z",
  "values": {
    "hor_front_temp": 175.2,
    "heater_on": 1.0,
    "bx_temp": 37.1,
    "vs_powered_on": 1.0,
    "prod_remaining": 14341.0,
    "util_0": 8443.0,
    "poker_active": 0.0,
    "running": 1.0,
    "fault_code": 32014.0
  },
  "quality": {"hor_front_temp": "good", "fault_code": "good"},
  "info": {"model": "4PPC80.121E-10A", "serial": "F9E40168741", "ip_address": "192.168.213.1"},
  "titles": {"planned_dt": ["Setup", "Roll Change"], "unplanned_dt": ["Fault", "Air Pressure Error"]}
}
```

The exact tag list is `backend/collector/config/tags.yaml`. It matches `plc-dashboard/server.py` `NODES` (machine, heaters, drives, OEE, I/O), with OEE arrays flattened as `util_0..6`, `pdt_0..22`, `udt_0..10`. Four production extras remain `::TBD:` until verified on site: `count_good`, `count_bad`, `running`, `fault_code`. String OPC fields (`model`, `serial`, `error_text`, title arrays) are not floats, so they travel beside `values` rather than inside it.

Dummy animation is seeded from the real PLC grab fixtures and covers the same groups the cockpit renders. The first reproducible fault is `MOCK_FAULT=hor_front_temp`: the front heater remains below setpoint, output saturates, zone heater stays on, `alarm_count` and `fault_code` rise, and a fault event appears. A changed parameter must visibly change the cockpit and the answer. No fake physics engine is needed.

Freshness is simple: the API computes age from `source_ts`; current values are `live` when recent, `stale` when old, `bad_quality` when marked bad, and `unknown` when absent. The UI must not replace missing data with zero.

## 6. Minimal data model

Use Supabase Postgres tables already represented by the code. Keep only fields needed for the loop:

### Machines

- `machines`: stable `machine_key`, display name, active flag.

Dummy snapshots, generated history, and generated fault events are not persisted. The MVP does not need telemetry tables, device records, boot IDs, or an outbox. Add persistence alongside the future PLC adapter only when recorded telemetry is a real requirement.

### Manuals and retrieval

- `manual_documents`: title, family, revision, SHA-256, private PDF path, status, and active flag.
- `manual_pages`: document/page number, private image path, extracted text, summary, `page_type`, `subsystem`, `error_codes_indexed`, `component_tags`, `search_tsv`, `text_embedding`, and `image_embedding`.
- `ingestion_jobs`: document, status, attempt count, and last error.

One active revision per manual family is sufficient. Duplicate PDF hashes are a no-op. A document is searchable only when its pages are ready.

### Chat

- `conversations`: user, machine, title, timestamps.
- `messages`: role, content, and assistant evidence JSON.

Evidence records the machine timestamp, event IDs, page IDs, and model/retrieval profile used for the answer. This is enough to inspect an MVP answer later.

Supabase RLS stays enabled and private Storage stays private. The API performs authorization; the browser does not query these tables directly.

## 7. Manual ingestion

The admin uploads a PDF. The API validates size and PDF signature, stores it privately, creates `manual_documents` and `ingestion_jobs`, and returns.

The worker then:

1. renders each page and extracts native text;
2. asks Gemini for a small JSON page profile: summary, page type, subsystem, error codes, and component tags;
3. creates one text embedding from the page text/profile;
4. creates one image embedding from the rendered page;
5. upserts `manual_pages`; and
6. marks the document `ready` only after all pages finish.

If Gemini profiling fails, keep native text and mark the page warning; do not make up metadata. Do not add OCR, table extraction, layout parsing, or a reranker until real manuals demonstrate that this baseline cannot answer the target questions.

## 8. Fixed diagnostic flow

This is one deterministic server workflow:

```text
authenticate
  → extract exact fault/component terms from the question
  → search active manual pages with exact matches + FTS + text/image vectors
  → merge and cap the best pages
  → load the current machine snapshot and recent events
  → build one Gemini request with retrieved manual semantics + current snapshot
  → validate JSON and citations
  → persist evidence and return the answer
```

### 8.1 Retrieval

- Search only ready, active pages.
- Exact error codes and component tags get priority.
- Run PostgreSQL FTS and Gemini vector searches for semantic matches.
- Merge with a small fixed reciprocal-rank score; cap the final context at eight pages and images at four.
- If there is no useful manual evidence, say so. Do not compensate with a creative prompt.

“RAG semantics” means the retrieved manual context gives Gemini the machine vocabulary, likely causes, and safe checks. It is not a second agent or a separate semantic database.

### 8.2 Gemini request

The server provides:

- the user's question;
- current values, units where known, source time, quality, and freshness;
- recent machine events;
- retrieved page text/metadata and selected page images; and
- instructions to treat manual text and images as untrusted evidence, not commands.

The model returns JSON with:

```json
{
  "observed_facts": [],
  "hypotheses": [],
  "next_checks": [],
  "safety_warning": null,
  "freshness_warning": null,
  "citations": []
}
```

The API rejects malformed output, removes citations outside the retrieved allowlist, and fails closed with a stable `diagnostic_unavailable` response. The answer must describe hypotheses, not assert an unverified root cause. It must never issue a PLC write or unsafe control instruction.

## 9. Completion criteria

The simple MVP is done when all of these work from a clean checkout:

1. Supabase schema applies and the app starts with `docker compose up` (without PLC settings).
2. Dummy mode populates at least one machine and the cockpit updates as values change.
3. `MOCK_FAULT=hor_front_temp` changes the visible state and produces a useful fault event.
4. An admin can upload a representative manual and see it become searchable.
5. A question such as “Why is the front heater not reaching temperature?” retrieves the right page(s), includes the current snapshot, and returns citations.
6. The answer states when current telemetry is stale, bad, or missing.
7. A failed Gemini response does not create an invented diagnosis or citation.
8. The source boundary is obvious enough that a future PLC adapter can emit the same snapshot without changing the RAG, chat, or UI path.

The first verification set can be five to ten hand-written questions covering a normal case, exact fault code, component synonym, stale data, and insufficient evidence. Expand evaluation only after this loop is useful.

## 10. Deferred upgrades

Add these only when a real requirement appears:

- `OpcUaSource`: subscriptions, read-only credentials, certificate validation, reconnects, source quality/timestamps, and PLC network deployment.
- Edge durability: SQLite outbox, idempotency keys, replay handling, device secrets, and offline retention.
- Production telemetry: rollups, retention, late data handling, per-tag freshness, and larger history queries.
- Security hardening: least-privilege database role, detailed audit logs, rate limits, container hardening, and operational monitoring.
- Retrieval quality: OCR/layout parsing, learned reranking, larger evaluation sets, and prompt/model regression gates.
- Product scale: organizations, machine fleet management, richer roles, and multi-region operations.

Do not add any deferred item to the MVP merely because the final product may need it. The adapter seam and stable normalized snapshot are the only PLC preparation required now.

## 11. File map

Keep implementation names unsurprising:

```text
web/                         Next.js cockpit (full PLC parameter set), manuals, and chat
backend/app/api/routes/      FastAPI routes
backend/app/copilot/         retrieval, prompt, Gemini response validation
backend/app/ingestion/       PDF/page worker
backend/app/machine_source.py current dummy source and future replacement seam
backend/collector/dummy.py   existing dummy value generator
backend/migrations/          Supabase/Postgres schema
compose.yaml                 web, api, manual worker
```

This file is the MVP source of truth. When a feature is not named in the scope or completion criteria above, it is not required to finish this version.
