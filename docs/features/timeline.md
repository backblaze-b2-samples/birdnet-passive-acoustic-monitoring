<!-- last_verified: 2026-08-05 -->
# Feature: Detection Timeline

## Purpose
Show, for one recording, what BirdNET heard and when — a horizontal detection timeline, a per-species summary, and inline playback of each event clip streamed from B2 via short-lived presigned URLs.

## Used By
- UI: `/recordings/[id]` (the recording detail page — the sample's marquee view)
- API: `GET /recordings/{rec_id}` returns `RecordingDetail` (`detections`, `species_summary`, `clips`); clip playback uses `GET /files-by-key/preview?key=<clip_key>` for an inline presigned URL
- Job: none (reads what a detection run wrote; see [BirdNET Detection](detection.md))

## Core Functions
- `apps/web/src/components/recordings/detection-timeline.tsx` — the timeline: one lane per species, markers positioned by `start_s` over the recording duration, marker width by call length, opacity by confidence; a time axis with tick labels.
- `apps/web/src/components/recordings/species-summary.tsx` — "Species heard" table: common + scientific name, detection count, max confidence (built server-side by `_species_summary` in `service/recordings.py`).
- `apps/web/src/components/recordings/clip-list.tsx` — "Event clips" list; each row renders an `<audio controls preload="none">` fed by a presigned URL (`ClipPlayer` → `usePreviewUrl(clip_key, true)`).
- `apps/web/src/app/recordings/[id]/page.tsx` — composes the header/controls, metadata card, timeline, species summary, and clip list; live-polls while a run is in flight.
- `apps/web/src/lib/queries.ts` — `useRecording(id)` (2s poll while `status` is `pending`/`running`, otherwise off) and `usePreviewUrl(key, enabled)`.
- `services/api/app/service/recordings.py` — `get_recording_detail` and `_species_summary`; presigned URLs come from `repo/b2_client.get_presigned_url` via `service/files.get_preview_url` (`disposition="inline"`).

## Canonical Files
- Pattern exemplar (visualization): `apps/web/src/components/recordings/detection-timeline.tsx`
- Pattern exemplar (inline clip playback): `apps/web/src/components/recordings/clip-list.tsx`

## Inputs
- `rec_id` (route param) → `useRecording(id)` → `GET /recordings/{rec_id}` → `RecordingDetail`.
- Timeline scale: `duration_seconds` from `meta.json` (falls back to the max detection `end_s` when duration is unknown).
- Clip playback: each detection's `clip_key`, exchanged for a presigned URL on demand.

## Outputs
- Rendered timeline, species table, and clip players (no writes).
- Side effect: fetching a clip's presigned preview URL does **not** count as a download (the preview route is inline-only, separate from the download route).

## Flow
- The detail page loads `RecordingDetail`. While `status` is `pending`/`running` it re-fetches every 2s to pick up the status badge and the results; polling stops once the run settles. The backend writes `detections.json`/`detections.csv` (and the event clips) exactly once, at completion, so results do not stream in mid-run — while `status === "running"` the content area shows a distinct in-progress panel (`DetectionRunningState`) and the full timeline/species/clips appear together when the run completes.
- The timeline groups detections by species (most-detected lane first), colors each lane from the chart palette, and places each marker by start time with width by call length and opacity scaled by confidence; hovering a marker shows species, confidence %, and the time window.
- The species summary lists each species with its detection count and max confidence.
- Each clip row lazily requests a presigned URL (only when rendered) and plays the WAV inline via `<audio>`. URLs are short-lived (600s presign; the query keeps them ~60s) and served with `Content-Disposition: inline` so the browser plays in place instead of downloading.

## Edge Cases
- No detections yet → timeline and clip list show empty states ("Run BirdNET detection to populate the timeline."); species summary shows its empty state.
- Unknown duration → the timeline scales to the latest detection's `end_s` so markers still lay out sensibly.
- A detection with no `clip_key` (e.g. its slice failed during the run) → excluded from the clip list.
- Presigned URL fetch fails → the row shows "Clip unavailable" instead of a broken player.
- A running recording → the content area shows the `DetectionRunningState` in-progress panel (animated `GeneratingLoader`, honest indeterminate copy — BirdNET exposes no true percentage) instead of the idle "No … yet" empty states, so a >10s wait never reads as an idle or frozen view; the populated timeline/species/clips replace it when the run completes.

## UX States
- Loading: `LoadingNotice` while the detail loads; skeleton in each `ClipPlayer` while its URL resolves.
- In progress: while `status === "running"`, the `DetectionRunningState` panel (animated, indeterminate) replaces the empty states in the detections content area.
- Empty: per-panel empty states for timeline, species summary, and clips (idle `pending`/never-run and zero-detection `completed`).
- Error: `ErrorState` with retry on detail-fetch failure; "Clip unavailable" per clip on URL failure.
- Loaded: populated timeline, species table, and inline clip players.

## Verification
- Test files: `services/api/tests/test_recordings.py` (`test_list_and_detail`, `test_run_detection_writes_detections_and_clips` — asserts detections, species roll-up, and clip keys are present in the detail payload)
- Required cases: detail returns detections + species summary + clips after a run; empty recording returns empty timeline/species/clips; inline preview URL served for a clip key
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green

## Related Docs
- [Recordings](recordings.md)
- [BirdNET Detection](detection.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
