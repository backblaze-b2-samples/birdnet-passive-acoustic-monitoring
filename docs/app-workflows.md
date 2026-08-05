<!-- last_verified: 2026-08-05 -->
# App Workflows

User journeys inside the application.

## Ingest a Recording

- User clicks "New recording" (on `/`, `/recordings`, or navigates to `/recordings/new`)
- Chooses a continuous field recording (WAV / FLAC / MP3 / OGG) and fills in survey metadata: site name (text), optional latitude / longitude (numbers), and an optional recorded-on date
- Sets the BirdNET detection parameters through selectors (never free text): minimum confidence, sensitivity, segment overlap, and common-name language. On the create form these carry safe-default hints (e.g. "0.25 recommended for a balanced first pass", "Leave blank to scan globally"); the source audio field notes that audio is immutable once ingested
- On submit, the browser streams the upload (with a live percentage) to `POST /recordings`; the API rejects an oversized body mid-stream (max 300 MB → `413`) and an unsupported extension (`415`)
- The recording is written to `recordings/<id>/source/<filename>` plus a `meta.json` (status `pending`); a success toast fires and the app redirects to the recording's detail page
- The generic `/upload` page still exists for plain B2 uploads, but recording ingest is this dedicated flow — it captures survey metadata and detection params the generic uploader does not
- See: [Recordings](features/recordings.md)

## Run Detection

- On a recording's detail page (`/recordings/[id]`) or the recordings library (`/recordings`), the user clicks "Run detection" (or "Re-run detection" once it has run before)
- `POST /recordings/{rec_id}/run` queues an on-device BirdNET-Analyzer run as a background task and returns immediately; the recording's status flips to "Detecting…"
- The engine (BirdNET GLOBAL 6K V2.4, CPU by default, auto-downloaded ~224 MB once on the first detection then cached locally, no API key) scans the audio; for each detection it slices a padded event clip and writes it back to B2, then writes `detections.json`, the verbatim `detections.csv`, and an updated `meta.json`
- The detail page polls every 2s while the run is in flight, so the timeline, species summary, clips, and status badge fill in live; on completion the status badge reads "Completed" with detection/species counts
- Editing a recording (`/recordings/[id]/edit`) changes its parameters (lat/lon/week/min_conf/sensitivity/locale) — re-running detection applies them; the source audio is immutable
- If the engine fails, the status becomes "Failed" and the detail page shows the error; the run never crashes the request
- See: [BirdNET Detection](features/detection.md)

## View Detection Timeline & Clips

- User opens a recording at `/recordings/[id]`
- A metadata card shows recorded-on date, location (or "Global (no range filter)"), duration, sample rate, detection/species counts, params, and last-run time
- The **detection timeline** lays out detections horizontally: one lane per species, markers positioned by start time over the recording duration, width by call length, and opacity by confidence; hovering a marker shows the species, confidence %, and time window
- A **species summary** table rolls up each species with its detection count and max confidence
- The **event clips** list plays each detection inline via an `<audio>` player fed by a short-lived B2 presigned URL (`Content-Disposition: inline`, so it plays in place and does not count as a download)
- The native BirdNET CSV is downloadable via the "CSV" button (a presigned URL); the button is disabled until a run has produced detections
- Delete removes the recording's entire `recordings/<id>/` subtree (source, meta, detections, and every clip) from B2 after a confirmation dialog
- See: [Detection Timeline](features/timeline.md)

## Upload Files

- User navigates to `/upload`
- Drops or selects files in the dropzone
- Client validates file size (max 100MB) and type
- A determinate progress bar tracks the bytes leaving the browser; once they are all sent the row switches to "Storing in B2..." with an *indeterminate* sweeping bar for the server-side phase (put_object + checksums + metadata). That phase has no percentage to report — measured at 25s on a 54MB file — and a bar parked at a full 100% read as finished-but-stuck
- On success: toast notification, green checkmark, and a "View in Files" link through to the browser
- On failure: red status icon with error message
- User can clear completed uploads
- The queue lives in an app-wide provider: navigating to another page keeps the upload running, shows an "Uploading N files" indicator in the header, and keeps the duplicate-upload guard armed
- Reloading or closing mid-upload asks for confirmation first; if the upload dies anyway, the next load says which file didn't finish
- See: [File Upload](features/file-upload.md)

## Browse and Manage Files

- User navigates to `/files`
- Page loads the 100 most recent objects from the API (sorted most recent first). While it loads, the page says so on screen and escalates the wording if the wait runs long — a full bucket listing measured 2.8s-21s cold
- If that limit was hit, a notice states how many objects the bucket actually holds — the page never claims to show everything
- Files displayed in tree view with folders and type-specific icons
- Folders auto-expand on load until the *majority* of the listed files are reachable without clicking, so the page's own "click a file" instruction is always actionable. Stopping at the first visible file was not enough: one stray top-level object left the other 99 sealed in collapsed folders while the page claimed to show 100
- Clicking a file row opens its preview; the per-row actions menu (preview / download / delete) is always visible, on every viewport
- Arriving at `/files?preview=<key>` expands that file's folders and opens its preview directly. This is how the ⌘K palette and the dashboard's recent-uploads rows hand off a *specific* file; the param is consumed on arrival so it doesn't re-fire later
- **Preview**: opens dialog with image/PDF preview + metadata panel, and the file's Download / Delete actions — the advertised "click a file" path offers everything the row menu does. The loading state holds until the media paints; a failure offers "Open in a new tab". The preview URL is signed with `Content-Disposition: inline` so PDFs render in place
- **Download**: shows a pending state on the row plus a toast while the presigned URL is fetched, then starts the download via an anchor click (which, unlike a popup, still works if the click's user activation expired during a slow presign). Failures are reported; the click can never silently do nothing
- **Delete**: the confirmation dialog stays open showing "Deleting..." until the request settles, then the row disappears with the toast (optimistic cache update) and the list reconciles with the server. The dialog is held deliberately — Radix closes on action click by default, which dismissed the only pending state and left the row looking untouched while the delete was still in flight
- Empty bucket shows "No files found" with upload prompt
- See: [File Browser](features/file-browser.md)

## View Dashboard

- User navigates to `/` (home)
- Two API calls load: passive-acoustic stats (`GET /recordings/stats`) and the recordings list (`GET /recordings`), aggregated over the `recordings/` prefix
- While stats load, the page states it in words above the cards rather than showing silent skeletons
- Six stat cards show: recordings ingested, total detections, distinct species, audio hours, event clips written, and storage used
- A detections chart plots detection counts for the most recent recordings by site
- A recent-recordings table shows the last 6 recordings with a run-status badge and detection/species counts; each site links to `/recordings/[id]`, and a "New recording" button leads into the ingest flow
- Empty state: "No recordings yet" messages in the chart and table
- See: [Dashboard](features/dashboard.md)

## Change Preferences

- User navigates to `/settings`
- A banner at the top states that the page is mostly a demonstration: only Theme is wired up for real, the rest showcases what a settings page can look like when you adapt the kit
- **Theme** (real): editing it and saving applies it immediately and persists it (`next-themes`), and the header's theme toggle drives the same state
- **Profile and preference fields** (demo): Display name, Bio, Default file view (Tree/List/Grid), Email me on every upload, Warn me when approaching quota + threshold. Each is labelled "Demo field", persists to `localStorage` only, and drives no behaviour — there is no account system, mailer, quota banner, activity log, or List/Grid view behind them yet
- Saving reports honestly: a success toast that separates the real theme change from the locally-stored demo values, or a warning toast if the browser blocked storage (theme still changes). It never claims a save that did not happen — the original page toasted "Settings saved" for fields that changed nothing
- Danger Zone actions are a demo — no real delete runs
- See: [Settings](features/settings.md)
