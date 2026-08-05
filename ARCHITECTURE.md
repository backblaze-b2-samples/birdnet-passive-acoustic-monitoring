<!-- last_verified: 2026-07-30 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - PAM dashboard: recordings, detections, species, audio-hours, clips, storage used
  - **Recordings library** (`/recordings`) — sample-scoped explorer over the
    `recordings/` prefix: create (ingest audio + survey metadata), list, edit, delete,
    and run/re-run detection with live status
  - **Recording detail** (`/recordings/[id]`) — the marquee detection timeline, species
    summary, and inline event-clip players
  - Full-bucket file browser (`/files`) + generic B2 upload (`/upload`) — kept starter scaffolding
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for recordings CRUD + background detection runs, plus file listing/upload
  - B2 S3 integration via boto3 (S3-compatible API only)
  - **On-device BirdNET-Analyzer** detection engine + `soundfile` audio clipping
  - File metadata extraction (images, PDFs); health + Prometheus metrics endpoints
  - Structured JSON logging with request tracing
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API (files + recordings/detections)
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (files + recordings.py: Recording, Detection, …)
    config/                Settings loaded from environment
    repo/                  Data access: b2_client, b2_object, b2_recordings (S3),
                           birdnet.py (BirdNET engine), audio.py (soundfile clipping)
    service/               Business logic: recordings (CRUD), detection (run orchestration),
                           dashboard (PAM stats), upload, files, metadata
    runtime/               FastAPI route handlers (recordings.py, files.py, …)
  tests/                   pytest tests (structural + integration; BirdNET + B2 mocked)
```

The BirdNET engine (`repo/birdnet.py`) is the **only** module importing
`birdnet_analyzer`, and it does so lazily (inside the analyze call) so importing the app
never loads TensorFlow. `repo/audio.py` is the only module using `soundfile`. Both stay
in the `repo/` layer per the "external SDKs only in repo/" invariant.

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway (recommended for the API)** — two services from the same repository: `web`
  builds from the repository root because it consumes `packages/shared`; `api` builds
  from `services/api`. Detection needs a real Python runtime with TensorFlow and does
  long-running, larger-than-serverless work, so a container host is the right home for
  the API. The versioned per-service configs and the human-approved staging/production
  contract live in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — the Next.js `web` app deploys anywhere. The FastAPI Function path
  (`services/api/index.py`) is **not** suitable for this sample's detection or
  large-recording ingest: Vercel Functions cap payloads at 4.5 MB and cannot run the
  BirdNET/TensorFlow workload. It remains viable only for the generic file/upload demo
  surface; see [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API)
  - Sole data store — **no application database.** Each recording's `meta.json` is its
    record of truth (survey metadata, detection params, status, counts, duration).
  - File listing and metadata via S3 `list_objects_v2` / `head_object`

### Passive-acoustic object layout (app-scoped `recordings/` prefix)

```
recordings/<id>/source/<original_filename>   raw field recording (WAV/FLAC)
recordings/<id>/meta.json                     survey metadata + params + status + duration
recordings/<id>/detections.json               [{species, confidence, start_s, end_s, clip_key}]
recordings/<id>/detections.csv                BirdNET rtype=csv output, kept verbatim
recordings/<id>/clips/<i>_<species-slug>_<start>-<end>.wav   event-aligned clips
```

`<id>` is a URL-safe slug (ingest timestamp + short random suffix). The kept full-bucket
File Explorer (`/files`) browses the entire bucket, which is intentionally broader than
this prefix. Detection produces write-amplification: one raw recording fans out into
per-detection JSON/CSV and many small clip WAVs.

### Background detection run

`POST /recordings/{id}/run` queues detection with FastAPI `BackgroundTasks` (Starlette
runs the sync task in a threadpool). `service/detection.py` sets `status="running"` in
`meta.json`, downloads the source from B2, probes duration/samplerate, runs
`repo/birdnet`, slices a clip per detection via `repo/audio`, writes each clip +
`detections.json`/`detections.csv` to B2, and finally sets `status="completed"` (or
`"failed"` with an error). The UI polls `GET /recordings/{id}` every 2s while a run is in
flight, so the timeline and clips appear live.

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Ingest a recording**: Browser -> `POST /recordings` (multipart audio + survey fields)
  -> API streams + size-guards -> `service/recordings.create_recording` writes
  `source/` + `meta.json` (status `pending`) to B2 -> response
- **Run detection**: Browser -> `POST /recordings/{id}/run` -> background task
  `service/detection.run_detection`: B2 download -> `repo/audio.probe` ->
  `repo/birdnet.analyze_audio` -> per-detection `repo/audio.slice_clip` -> B2 puts
  (clips + `detections.json` + `detections.csv`) -> `meta.json` `completed`
- **View detail (live)**: Browser -> `GET /recordings/{id}` (polled while running) ->
  `service/recordings.get_recording_detail` reads `meta.json` + `detections.json` + lists
  clips -> timeline + species summary + clip players
- **Clip playback**: Browser -> `GET /files-by-key/preview?key=recordings/<id>/clips/…`
  -> presigned inline URL -> `<audio>` streams the clip from B2
- **Delete (cascade)**: Browser -> `DELETE /recordings/{id}` -> `repo/b2_recordings.delete_prefix`
  removes the whole `recordings/<id>/` subtree
- **Generic file ops (kept)**: `POST /upload`, `GET /files`, `GET /files/{key}/download`,
  `DELETE /files/{key}` behave as in the starter kit

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Recordings API handler: `services/api/app/runtime/recordings.py`
- Recordings CRUD orchestration: `services/api/app/service/recordings.py`
- Detection orchestration: `services/api/app/service/detection.py`
- PAM dashboard stats: `services/api/app/service/dashboard.py`
- BirdNET engine adapter (only birdnet import): `services/api/app/repo/birdnet.py`
- Audio probe/clip adapter (soundfile): `services/api/app/repo/audio.py`
- Recordings B2 helpers: `services/api/app/repo/b2_recordings.py`
- Base B2 data access: `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`recordings.py`, `files.py`, `upload.py`, `stats.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json` (exporter: `services/api/scripts/export_openapi.py`)
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Recordings UI: `apps/web/src/app/recordings/`, `apps/web/src/components/recordings/`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Recordings](docs/features/recordings.md)
- [BirdNET Detection](docs/features/detection.md)
- [Detection Timeline](docs/features/timeline.md)
- [Dashboard](docs/features/dashboard.md)
- [File Browser](docs/features/file-browser.md)
- [File Upload](docs/features/file-upload.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
