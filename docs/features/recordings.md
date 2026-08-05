<!-- last_verified: 2026-08-05 -->
# Feature: Recordings

## Purpose
Manage the full lifecycle of a **Recording** — the sample's single primary entity: a continuous passive-acoustic field recording (WAV/FLAC) stored on Backblaze B2 under the app-scoped `recordings/` prefix, with survey metadata and BirdNET detection parameters.

## Used By
- UI: `/recordings` (sample-scoped library), `/recordings/new` (create), `/recordings/[id]` (read/detail), `/recordings/[id]/edit` (edit)
- API:
  - `GET /recordings` — list every recording (newest first)
  - `POST /recordings` — create (multipart: audio file + survey metadata + params)
  - `GET /recordings/{rec_id}` — full detail (`RecordingDetail`: timeline detections, species summary, clips)
  - `PATCH /recordings/{rec_id}` — edit survey metadata + detection params (source audio immutable)
  - `DELETE /recordings/{rec_id}` — cascade-delete the whole `recordings/<id>/` subtree from B2
  - `POST /recordings/{rec_id}/run` — run/re-run detection (see [BirdNET Detection](detection.md))
  - `GET /recordings/{rec_id}/detections.csv` — presigned URL for the native BirdNET CSV
- Job: detection runs as a FastAPI `BackgroundTasks` task (`app/service/detection.py`)

## Core Functions
- `services/api/app/runtime/recordings.py` — REST router (sync `def` handlers, blocking B2 I/O offloaded to the Starlette threadpool via `run_in_threadpool`)
- `services/api/app/service/recordings.py` — CRUD orchestration (no boto3): `create_recording`, `list_recordings`, `get_recording`, `get_recording_detail`, `update_recording`, `delete_recording`, plus key helpers (`recording_prefix`, `meta_key`, `source_key`, `clips_prefix`, `slugify`, `new_recording_id`) and `validate_params`
- `services/api/app/repo/b2_recordings.py` — B2 (S3-compatible) data access: `put_object_bytes`, `put_json`, `get_json`, `list_prefix`, `download_to_file`, `delete_prefix` (boto3 confined here; every write/delete invalidates the shared `repo/list_cache.py`)
- `services/api/app/types/recordings.py` — `Recording`, `RecordingDetail`, `RecordingUpdate`, `DetectionParams`, `RecordingRunResponse`, and the finite-option tuples (`MIN_CONF_OPTIONS`, `SENSITIVITY_OPTIONS`, `OVERLAP_OPTIONS`, `LOCALE_OPTIONS`)
- `apps/web/src/components/recordings/recordings-table.tsx` — library list with per-row run / view / edit / delete
- `apps/web/src/components/recordings/recording-form.tsx` — shared create/edit form (react-hook-form + zod + shadcn `Form`/`Select`)
- `apps/web/src/lib/queries.ts` — `useRecordings`, `useRecording`, `useCreateRecording`, `useUpdateRecording`, `useDeleteRecording`, `useRunDetection`, `useRecordingsStats`
- `apps/web/src/lib/api-client.ts` — the `recordings*` routes in `API_CLIENT_ROUTES` plus the streaming `createRecording` upload helper

## Canonical Files
- Pattern exemplar (service): `services/api/app/service/recordings.py`
- Pattern exemplar (router): `services/api/app/runtime/recordings.py`
- Pattern exemplar (form UX): `apps/web/src/components/recordings/recording-form.tsx`

## Inputs
- **create** (`POST /recordings`, multipart form): `file` (WAV/FLAC/MP3/OGG audio — allowed extensions in `ALLOWED_AUDIO_EXT`); `site` (text, required); `latitude`/`longitude` (optional numbers, sent as strings); `recorded_at` (optional ISO date); `min_conf`, `sensitivity`, `overlap`, `locale` (finite-option detection params). The route streams the upload with early size rejection against `settings.max_recording_size` (default 300 MB) so an oversized body can't exhaust memory.
- **edit** (`PATCH /recordings/{rec_id}`, `RecordingUpdate` JSON): `site`, `latitude` (−90..90), `longitude` (−180..180), `recorded_at`, and the four detection params. No file field — source audio is immutable on edit.
- **list / read**: no body.

## Outputs
- `Recording` (list/summary) and `RecordingDetail` (adds `detections`, `species_summary`, `clips`) Pydantic models.
- Side effects (B2 objects under `recordings/<id>/`):
  - `source/<filename>` — raw field recording (written once on create)
  - `meta.json` — survey metadata + detection params + run status + duration/sample-rate + counts
  - `detections.json`, `detections.csv`, `clips/*.wav` — produced by a detection run (see [BirdNET Detection](detection.md))
- Every write/delete invalidates the shared full-bucket list cache, so `/files` and the dashboard reflect the change immediately.

## Flow
- **Create**: `/recordings/new` posts the audio + metadata → route streams + size-checks the body → `create_recording` sanitizes the filename, validates the extension and site, snaps params to their allowed sets (`validate_params`), mints a URL-safe `rec_id` (`new_recording_id` = upload timestamp + short random suffix), writes `source/<filename>` and `meta.json` with `status="pending"`, then redirects to the detail page.
- **List**: `list_recordings` lists the `recordings/` prefix, reads each `.../meta.json`, and returns the recordings newest-first. Powers the `/recordings` table and the dashboard's recent/chart panels.
- **Read (detail)**: `get_recording_detail` reads `meta.json`, `detections.json`, and lists `clips/` to build `RecordingDetail` (timeline detections, `species_summary` roll-up, clip list).
- **Edit**: `/recordings/[id]/edit` opens the form pre-filled from the recording's real values; `update_recording` re-validates params and rewrites `meta.json` (source untouched). The user re-runs detection to apply new params.
- **Run**: `POST /recordings/{rec_id}/run` 404s if the recording is gone, otherwise queues `run_detection` as a background task and returns `{id, status:"running"}` (see [BirdNET Detection](detection.md)).
- **Delete**: `delete_recording` → `delete_prefix(recording_prefix(id))` batches DeleteObjects over the whole subtree (source + meta + detections + every clip) and raises `RecordingNotFoundError` if nothing was there.

## Edge Cases
- Unsupported audio extension → `415`; empty site → `400`; empty file → `400`; body over `max_recording_size` → `413` (rejected mid-stream in the route, and again in `create_recording`).
- Out-of-range param smuggled past the UI → `validate_params` snaps numeric params to the nearest allowed value and rejects an unknown `locale` (`RecordingValidationError`).
- `GET`/`PATCH`/`DELETE`/`run` on a missing id → `404` (`RecordingNotFoundError`).
- `detections.csv` requested before a run → the recording resolves but the CSV object may be absent; the presigned URL 404s at B2, and the detail page's CSV button is disabled while `detection_count === 0`.
- A just-created recording is visible immediately: `list_prefix` reads B2 directly (not the cache) and writes invalidate the cache.

## UX States
- Loading: skeleton rows in the library table; `LoadingNotice` on the detail/edit pages.
- Empty: "No recordings yet" empty state with a prompt to ingest one.
- Error: `ErrorState` with retry on list/detail fetch failure; toasts on failed create/edit/delete/run.
- Loaded: populated library table with per-row status badge and run / view / edit / delete actions.

## Verification
- Test files: `services/api/tests/test_recordings.py` (CRUD + cascade + params + dashboard stats), `services/api/tests/test_detection.py` (run/clip/CSV parsing)
- Required cases: create writes source + meta, list + detail, update, cascade delete, delete-missing raises, param snapping/rejection, unsupported extension, empty site
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green (the suite mocks `birdnet_analyzer` + B2, so it stays credential-free and offline)

## Related Docs
- [BirdNET Detection](detection.md)
- [Detection Timeline](timeline.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
