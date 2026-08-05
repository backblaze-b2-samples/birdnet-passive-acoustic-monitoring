<!-- last_verified: 2026-08-05 -->
# Feature: BirdNET Detection

## Purpose
Run on-device bird-species detection over a stored recording with the official **BirdNET-Analyzer** engine, then write the detections (JSON + native CSV) and one event-clip WAV per detection back to Backblaze B2.

## Used By
- UI: the "Run detection" / "Re-run detection" button on `/recordings/[id]` (and the per-row Run action on `/recordings`); live status via `run-status.tsx`
- API: `POST /recordings/{rec_id}/run` — queues the run; status is polled back through `GET /recordings/{rec_id}`
- Job: `run_detection(rec_id)` executes as a FastAPI `BackgroundTasks` task and never raises (failures are persisted, not thrown)

## Core Functions
- `services/api/app/repo/birdnet.py` — the **only** module importing `birdnet_analyzer`. `analyze_audio(...)` wraps the official `analyze()`, writes `rtype="csv"` results to a temp dir, and parses them into typed detection dicts (`_parse_csv`, `_read_result_csv`). The heavy import (pulls in TensorFlow) is deliberately lazy inside `analyze_audio`, so importing the module / app / test suite never loads TensorFlow.
- `services/api/app/repo/audio.py` — `soundfile`-backed `probe(path)` (duration, sample rate) and `slice_clip(path, start_s, end_s, pad_s)` (16-bit PCM WAV bytes, window padded and clamped to file bounds).
- `services/api/app/service/detection.py` — `run_detection(rec_id)` orchestration (no boto3): download source → probe → BirdNET → slice + upload a clip per detection → persist `detections.json` / `detections.csv` / updated `meta.json`. Helpers: `_week_from_date`, `_clip_key`, `_set_status`.
- `services/api/app/repo/b2_recordings.py` — `download_to_file`, `put_object_bytes`, `put_json`, `get_json` used by the run.

## Canonical Files
- Pattern exemplar (engine adapter): `services/api/app/repo/birdnet.py`
- Pattern exemplar (orchestration): `services/api/app/service/detection.py`

## Engine, model, and license
- **Engine:** the official kahst / birdnet-team package — PyPI `birdnet-analyzer` (import name `birdnet_analyzer`), pinned `birdnet-analyzer==2.4.0`. This is deliberately **not** the third-party `birdnetlib` wrapper (vendor fidelity — use the upstream project's own engine).
- **Model:** **BirdNET GLOBAL 6K V2.4**. `birdnet-analyzer` auto-downloads it (~224 MB) from upstream on the first `analyze()` call and caches it locally inside the installed package dir; every run after reuses the cache. No API key is needed — B2 credentials are the only secret; there is no second provider key.
- **License:** the BirdNET model weights are **CC BY-NC-SA 4.0** (non-commercial + attribution + share-alike). Any use of this sample's detection output must respect that license — attribute BirdNET and keep it non-commercial.
- **Cost:** `$0` per run (local CPU inference).

## Device selection (CPU by default, GPU autodetect)
- `deployment: local` — inference runs on-device. CPU is the default everywhere.
- The GPU-autodetect order per the project rule is CUDA → Apple MPS → CPU. BirdNET's TensorFlow/TFLite path has **no usable Apple MPS backend**, so on macOS arm64 it runs on **CPU**; CUDA is used only where a supported NVIDIA GPU is present. `repo/birdnet.py` never calls a device explicitly, so TensorFlow auto-selects CUDA when available and falls back to CPU — no GPU is ever required.
- The first detection is slower: `birdnet-analyzer` downloads the model (~224 MB) once and caches it, then TensorFlow and the model warm up. Subsequent runs reuse the cached model.

## Inputs
- `rec_id` (from the run request) → the recording's `meta.json` supplies `source_key` and the per-recording params.
- Detection params (finite-option, stored in `meta.json.params`, re-validated on write):
  - `min_conf` — 0.1 / 0.25 / 0.5 / 0.75 (default 0.25)
  - `sensitivity` — 0.75 / 1.0 / 1.25 / 1.5 (default 1.0)
  - `overlap` (s) — 0 / 1.0 / 2.0 (default 0)
  - `locale` — en_us / en_uk / de / es / fr (default en_us), for reported common names
- Location/season filters (from survey metadata): `lat`, `lon` (omitted → BirdNET sentinel `-1.0`, i.e. no range filter), and `week` (1–48) derived from `recorded_at` by `_week_from_date` (omitted → `-1`).
- Only kwargs the installed `analyze()` signature accepts are passed, so a minor upstream signature change degrades gracefully instead of raising.

## Outputs
Written to B2 under `recordings/<id>/`:
- `detections.json` — `[{scientific_name, common_name, confidence, start_s, end_s, clip_key}]`, sorted by start time (drives the timeline, species summary, and clip players).
- `detections.csv` — the **native BirdNET `rtype=csv` output, kept verbatim** (downloadable via the presigned CSV URL).
- `clips/<i>_<species-slug>_<start>-<end>.wav` — one padded event clip per detection (the write-amplification the sample demonstrates: one raw recording → many small clips + JSON/CSV).
- Updated `meta.json` — `status`, `duration_seconds`, `sample_rate`, `detection_count`, `species_count`, `last_run_at`, `error`.

## Flow
1. `run_detection` loads `meta.json`; if the recording is gone it logs and returns. It sets `status="running"` (persisted so the UI poll sees it live).
2. Downloads `source_key` to a temp file (`download_to_file`).
3. `audio.probe` records duration + sample rate into `meta.json`.
4. `birdnet.analyze_audio` runs the engine into a temp output dir and parses the CSV into typed detections.
5. For each detection, `audio.slice_clip` cuts a padded `[start,end]` WAV and `put_object_bytes` uploads it to `clips/`; the clip's key is stored on the detection (a failed slice is logged and skipped, not fatal).
6. `detections.json` (for the UI) and `detections.csv` (verbatim) are written.
7. `status="completed"` with counts is persisted. Any exception sets `status="failed"` with the error message; the temp dir is always cleaned up.

## Edge Cases
- Nothing crosses the confidence threshold → BirdNET writes no CSV; `_read_result_csv` returns `""`, `detections.json` is `[]`, no clips are written, status still `completed`.
- Engine failure → `RuntimeError` from `analyze_audio` → status `failed` with the message surfaced on the detail page.
- Malformed/header-only CSV rows → skipped by `_parse_csv`.
- Missing `lat`/`lon`/`recorded_at` → global/year-round scan (sentinels), not an error.
- Individual clip slice failure → logged and skipped; the rest of the run continues.

## UX States
- Running: status badge "Detecting…" (spinner); the detail page polls every 2s and the timeline/clips/species panels fill in live.
- Completed: "Completed" badge, populated timeline, species summary, and clip players; CSV download enabled.
- Failed: destructive "Failed" badge and an alert with the error message; Re-run available.

## Verification
- Test files: `services/api/tests/test_detection.py` (CSV parsing/sorting, empty + malformed rows, `probe`, `slice_clip` bounds/clamp, `_week_from_date`), `services/api/tests/test_recordings.py` (`test_run_detection_writes_detections_and_clips`, `test_run_detection_marks_failed_on_engine_error`)
- Required cases: happy-path run writes detections + clips + CSV; engine error marks the recording failed; CSV parse maps columns and sorts; clip slicing clamps to file bounds
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green. The suite monkeypatches `birdnet_analyzer` (`analyze_audio`) and B2, so it never loads TensorFlow and needs no credentials; real BirdNET is exercised by the later verify pipeline step, not `pnpm verify`.

## Related Docs
- [Recordings](recordings.md)
- [Detection Timeline](timeline.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
