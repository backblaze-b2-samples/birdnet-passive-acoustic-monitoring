<!-- last_verified: 2026-08-05 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the passive-acoustic-monitoring pipeline across the `recordings/` prefix on Backblaze B2: how much audio has been ingested, what BirdNET has detected, and how much storage the raw + derived artifacts use.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /recordings/stats`, `GET /recordings`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 6 stat cards, plus the on-screen loading notice while the prefix scan runs
- `apps/web/src/components/dashboard/detections-chart.tsx` — bar chart of detections per recording (most recent recordings)
- `apps/web/src/components/dashboard/recent-recordings-table.tsx` — last 6 recordings with site, status, detections, species (links through to each recording)
- `apps/web/src/lib/queries.ts` — `useRecordingsStats()`, `useRecordings()`
- `apps/web/src/lib/api-client.ts` — `getRecordingsStats()`, `getRecordings()`
- `services/api/app/runtime/recordings.py` — `GET /recordings/stats` handler (declared before `/recordings/{rec_id}` so "stats" is matched as a static path, never captured as a recording id)
- `services/api/app/service/dashboard.py` — `get_recordings_stats()` aggregation
- `services/api/app/repo/b2_recordings.py` — `list_prefix()`, `get_json()` data access over the `recordings/` prefix
- `apps/web/src/components/common/loading-notice.tsx` — visible, escalating wait copy

## Canonical Files
- Dashboard page layout: `apps/web/src/app/page.tsx`
- Stats service logic: `services/api/app/service/dashboard.py`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /recordings/stats` → `RecordingsStats` (`recordings_ingested`, `total_detections`, `distinct_species`, `audio_hours`, `clips_written`, `storage_bytes`, `storage_human`)
- `GET /recordings` → `Recording[]` (newest-first); the chart uses the 8 most recent and the recent-recordings table the 6 most recent

## Flow
- Page loads → two API calls: recordings stats and the recordings list.
- `get_recordings_stats` derives storage bytes and clip count from a single full listing of the `recordings/` prefix, then reads each `meta.json` (and, for recordings with detections, `detections.json`) to roll up total detections, distinct species (by scientific name), and audio-hours (summed `duration_seconds ÷ 3600`).
- Six stat cards display: recordings ingested, total detections, distinct species, audio hours, event clips written, and storage used.
- The detections chart plots detection counts for the most recent recordings by site.
- The recent-recordings table lists the last 6 recordings with a run-status badge and detection/species counts; each site links to `/recordings/[id]`. A "View all" link and a header "New recording" button lead into the recordings flow.

## Edge Cases
- API unavailable → stat cards render an inline `ErrorState` with retry (never silent zeros that would lie about bucket state); chart and table show their own error/retry.
- No recordings ingested → empty chart and empty table messages; stat cards read 0 / "0 B".
- A recording without a completed run contributes to storage/clip/ingest counts but adds 0 detections/species until it finishes.
- Bucket changed by something other than this app → numbers can lag by up to the list-cache TTL for `/files`; the stats read the `recordings/` prefix directly via `list_prefix`, and the app's own writes/deletes invalidate the shared cache.

## UX States
- Loading: a `LoadingNotice` above the cards plus skeletons for cards, chart, and table.
- Empty: "No recordings yet" in the chart and table; zeroed stat cards.
- Loaded: populated cards, chart, and table.

## Verification
- Test files: `services/api/tests/test_recordings.py` (`test_dashboard_stats` — roll-up of ingested/detections/species/audio-hours/clips/storage across recordings)
- Required cases: stats with recordings + detections, empty prefix, API error fallback in the cards
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Dev Workflows](../dev-workflows.md#commands) are available
- Pass criteria: focused tests and `pnpm verify` green

## Related Docs
- [Recordings](recordings.md)
- [BirdNET Detection](detection.md)
- [Detection Timeline](timeline.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
