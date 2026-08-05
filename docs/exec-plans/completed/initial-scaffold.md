# Build plan — `birdnet-passive-acoustic-monitoring`

Scaffold a B2 sample from `vibe-coding-starter-kit` that runs **BirdNET-Analyzer**
(kahst / birdnet-team) over continuous field recordings, writes detections +
event-clips back to B2, and shows a detection **timeline**.

Source of truth (the ONLY valid starter tree):
`.claude/scratch/vcsk-0dbeb990-aa17-415c-8d10-fab5c4e0a926/`

---

## 1. Purpose

Ecologists, conservation teams, and acoustic-survey researchers upload continuous
passive-acoustic **field recordings** (WAV/FLAC) to Backblaze B2, run
**BirdNET-Analyzer** to detect and classify bird species and sound events, and
write the detections (confidence scores) plus event-aligned audio **clips** back
to B2 — then browse a per-recording **timeline** of what was heard and when. It
demonstrates B2 as the single storage layer for a passive-acoustic-monitoring
(PAM) pipeline: sustained raw-audio ingest plus write-amplification from each raw
recording into per-detection JSON/CSV and many small clipped-event WAVs. Detection
runs entirely **on-device** (BirdNET's bundled TFLite/TensorFlow model, CPU by
default) — B2 credentials are the only secret; there is no second API key.

## 2. Architecture delta from `vibe-coding-starter-kit`

The starter kit is the ceiling. Strip what PAM doesn't need; keep the reusable
B2-backed scaffolding; add the recording→detect→clip→timeline domain.

### KEEP (as-is — starter contract in `AGENTS.md §2`, do not strip/rename)
- **UI kit / design system**: `apps/web/src/components/ui/**`, tokens in
  `apps/web/src/app/globals.css`, `/design` page + components. Build every new
  screen from these primitives; restyle only through tokens.
- **Full-bucket File Explorer** — `/files` route, `apps/web/src/app/files/`,
  `apps/web/src/components/files/`, and its Files sidebar entry. **NON-NEGOTIABLE
  keep** (skill rule + starter contract). It browses the *entire* bucket, which is
  broader than the sample's own `recordings/` prefix — that's intentional; keep it.
- **Generic Upload** — `/upload` route + `apps/web/src/components/upload/**` and
  its sidebar entry (starter contract). *Tension note:* PAM's real ingest is the
  Recording **create** flow under `/recordings` (audio + survey metadata written to
  `recordings/<id>/`). The generic `/upload` stays as the starter's plain B2
  uploader; it is NOT the domain ingest. Keeping both is deliberate per the skill's
  "keep the explorer/upload even if the sample seems not to need it" rule.
- **Backend scaffold & invariants** — layered `types→config→repo→service→runtime`,
  boto3 confined to `repo/`, TanStack-Query-only data fetching, OpenAPI contract
  gate, structural tests, rate limiting, the shared full-bucket **list cache**
  (`repo/list_cache.py`) that powers `/files` + stats. Keep `service/metadata.py`
  (image/PDF detail panel) — it backs the kept Files detail panel; leave it alone.
- **Settings / Design pages**, health banner, command palette, theme system.

### TRIM (remove from the starter)
- **Dashboard defaults** — `components/dashboard/*` (generic upload stats/chart/
  recent-uploads table) get **rewritten** to PAM metrics (§ below), not deleted.
- Nothing else is deleted. (Do NOT delete Files, Upload, metadata, or UI kit.)
- Starter marketing copy / "OSS Starter Kit" identity strings → replaced via the
  rename table (§6). `PRODUCT.md` gets rewritten to the PAM product; keep the file.

### ADD (new for this sample)
- **Recordings Library** `/recordings` — the **sample-specific asset explorer**,
  scoped to the app's own `recordings/` prefix (satisfies the skill's mandatory
  "add a sample-scoped explorer alongside the kept full-bucket explorer"). Lists
  each Recording with site, duration, status, #detections, #species; row actions
  run / view / edit / delete; a "New Recording" create entry.
- **Recording detail** `/recordings/[id]` — the marquee UI: a **detection
  timeline** (horizontal, markers positioned by start-time over the recording
  duration, grouped/colored by species, sized/opacity by confidence), a species
  summary, and **event-clip players** (`<audio>` fed by B2 presigned URLs). Live
  status polling while a run is in progress. Run / edit / delete controls.
- **BirdNET detection engine** `services/api/app/repo/birdnet.py` — the ONLY module
  importing `birdnet_analyzer`. Adapter around the official `analyze()` (see §4).
- **Audio clipping** `services/api/app/repo/audio.py` — `soundfile`-based: probe
  duration/samplerate, slice `[start,end]` → WAV bytes for each event clip.
- **Detection orchestration** `services/api/app/service/detection.py` — download
  audio from B2 → run `repo/birdnet` → for each detection slice a clip via
  `repo/audio` → write `detections.json` + `detections.csv` + `clips/*.wav` +
  updated `meta.json` to B2. Pure orchestration, no boto3.
- **Recordings CRUD** `services/api/app/service/recordings.py` — create / list /
  get-detail / update-meta / delete-cascade over the `recordings/` prefix.
- **Router** `services/api/app/runtime/recordings.py` — REST endpoints (§ B2/API),
  detection run via FastAPI `BackgroundTasks` with status persisted in `meta.json`.
- **Types** `services/api/app/types/recordings.py` — Pydantic `Recording`,
  `Detection`, `RecordingDetail`, `DetectionRunStatus`, request models.
- **Frontend**: `app/recordings/page.tsx`, `app/recordings/[id]/page.tsx`,
  `components/recordings/*` (recording-form, recordings-table, detection-timeline,
  species-summary, clip-list, run-status), recordings hooks in `lib/queries.ts`,
  routes in `lib/api-client.ts`, Recordings nav item in `app-sidebar.tsx`.
- **Seed helper** — a script/README step that ingests one short public-domain demo
  recording so a fresh clone has something to run (see §4, Seeding).

## 3. B2 surface (S3-compatible only — no b2-native)

All access via the S3 API through the existing `repo/b2_client.py` boto3 client,
with a **custom user-agent** and the **standard `B2_*` env vars** (§6). No
b2-native (`b2sdk`) calls anywhere.

Object layout under the bucket (app-scoped prefix `recordings/`):
```
recordings/<recording_id>/source/<original_filename>   # raw field recording (WAV/FLAC)
recordings/<recording_id>/meta.json                    # survey metadata + params + status + duration
recordings/<recording_id>/detections.json             # [{species, scientific, common, confidence, start_s, end_s}]
recordings/<recording_id>/detections.csv              # BirdNET rtype=csv output (native format, kept verbatim)
recordings/<recording_id>/clips/<i>_<species-slug>_<start>-<end>.wav   # event-aligned clips
```
`recording_id` = short slug (upload timestamp + short random/hash suffix), URL-safe.

S3 operations exercised: **PutObject** (audio, meta, detections json+csv, each
clip), **GetObject** (download audio for analysis; serve clips/source via
presigned GET), **ListObjectsV2** (recordings list = list `recordings/` and read
each `meta.json`; per-recording clip listing; full-bucket via kept list cache),
**HeadObject** (existence/size), **DeleteObject / DeleteObjects** (cascade-delete a
recording's whole `recordings/<id>/` subtree). Presigned URLs for in-browser audio
playback + downloads (reuse `get_presigned_url`, `disposition="inline"` for the
`<audio>` players). No b2-native use — nothing to justify.

## 4. Key features

1. **Continuous field-recording ingest** — upload WAV/FLAC + survey metadata (site,
   lat/lon, recorded-at date) to `recordings/<id>/`. Represents sustained,
   never-ending audio landing in B2. `deployment: n/a (B2 only)`.
2. **On-device BirdNET species detection** — official **BirdNET-Analyzer** engine
   (`birdnet-analyzer` PyPI, kahst/birdnet-team) scans each recording for bird
   species/sound events with confidence, start, end. Vendor fidelity: use kahst's
   OWN package — **not** the third-party `birdnetlib` wrapper.
   - **External API provider:** none (fully local OSS).
   - **`deployment: local`** — on-device TensorFlow/TFLite, **CPU by default**.
     GPU autodetect order per the hard rule is CUDA → Apple MPS → CPU; BirdNET's
     TFLite/TF path has **no usable MPS backend**, so on macOS arm64 it runs on CPU
     (CUDA used only where a supported NVIDIA GPU exists). This is a purely-local
     feature and inherits the CPU-default / GPU-autodetect rule with that MPS caveat
     recorded here.
   - **Model:** BirdNET GLOBAL 6K V2.4 — **bundled** with the package (no download,
     no key). Weights are **CC BY-NC-SA 4.0** (non-commercial + attribution) — note
     this in README/docs and the detection feature doc.
   - **Est. cost / full demo run:** **$0** (local CPU). **Env var for key:** none.
   - **Integration contract (repo/birdnet.py):**
     ```python
     from birdnet_analyzer import analyze
     analyze(audio_input=<local_path>, output=<tmp_dir>, min_conf=0.25,
             lat=<opt>, lon=<opt>, week=<opt 1-48 from recorded_at>,
             sensitivity=1.0, overlap=0, rtype="csv", locale="en_us")
     ```
     `analyze()` writes result files (rtype `csv`) into `output`; the adapter runs
     it against a temp dir, parses the CSV rows into typed `Detection` dicts
     (start_s, end_s, scientific_name, common_name, confidence), and returns them.
     Pin `birdnet-analyzer==2.4.0`; ensure the `tensorflow` (not `tflite-runtime`)
     backend so it installs on macOS arm64 + linux; Python 3.11 (matches starter
     lock). Heavy deps (tensorflow, librosa, resampy, soundfile) — record in
     requirements + note the ~first-run model warm-up in docs.
3. **Event-clip extraction (write-amplification)** — for each detection above the
   threshold, slice the aligned `[start,end]` (± small pad) window from the source
   audio and write a clip WAV to `recordings/<id>/clips/`. One raw recording → many
   small clips + JSON/CSV, demonstrating write-amplification into B2.
4. **Detection timeline & clip playback** — per-recording timeline view of
   detections over time, species summary, and inline clip players from B2 presigned
   URLs. `deployment: n/a`.
5. **Recordings Library (sample-scoped explorer) + PAM dashboard** — library scoped
   to `recordings/`; dashboard aggregates recordings ingested, total detections,
   distinct species, audio-hours stored, clips written, B2 storage used.

**Provider orchestration via Genblaze:** NOT applicable — the description is
"local OSS, no second API key," there are no external AI-provider calls, so no
Genblaze routing. Recorded explicitly.

**Primary-entity lifecycle (mandatory UI completeness).** Single primary entity:
**Recording**. All five lifecycle verbs are user-accessible in the UI — nothing is
omitted (`omitted_ui_verbs` = []):
- **create** — "New Recording" in `/recordings`: upload audio + survey metadata →
  writes `source/` + `meta.json`.
- **read** — Recordings Library list + `/recordings/[id]` detail (timeline, species,
  clips).
- **edit** — edit a recording's survey metadata + detection params (pre-filled
  form); genuinely user-meaningful because lat/lon/week/min_conf/sensitivity change
  what a re-run detects.
- **delete** — cascade-delete the recording's whole `recordings/<id>/` subtree from
  B2 (source + meta + detections + clips).
- **run** — run/re-run BirdNET detection on the recording (background task; live
  status).

**Form UX conventions** (model on `components/settings/settings-form.tsx` —
react-hook-form + zod + shadcn `Form`/`Select`/`RadioGroup`). Applies to the
create AND edit Recording forms:
- **Finite-value fields → selectors (never free text):**
  - `min_conf` → `Select`: 0.1 / 0.25 / 0.5 / 0.75 (default 0.25)
  - `sensitivity` → `Select`: 0.75 / 1.0 / 1.25 / 1.5 (default 1.0)
  - `overlap` (s) → `Select`: 0 / 1.0 / 2.0 (default 0)
  - `locale` → `Select`: en_us / (a couple common locales) (default en_us)
- **Free text / typed inputs:** site name (text), latitude (number), longitude
  (number), recorded-at (date picker), audio file (upload — **create only**;
  source is immutable on edit).
- **CREATE-only default hints** (placeholder / `FormDescription`, guidance only —
  never an autofill button): site "e.g. Site A — North Ridge"; lat/lon "Leave blank
  to scan globally (no range filter)"; recorded-at "Used with lat/lon to narrow
  species by season"; min_conf "0.25 recommended for a balanced first pass".
- **EDIT form** opens pre-filled with the recording's real values; no default hints;
  no file field.

## 5. Doc transforms (`docs/`)
- **Rewrite:** `docs/features/dashboard.md` → PAM metrics. `PRODUCT.md`,
  `README.md`, `ARCHITECTURE.md` (add `recordings/` layout, birdnet/audio repo
  adapters, detection service, background run model), `docs/app-workflows.md`
  (ingest→detect→clip→timeline journey), `.env.example` (standard `B2_*`).
- **Keep (kept features):** `docs/features/file-browser.md`,
  `docs/features/file-upload.md`, `docs/features/metadata-extraction.md`,
  `docs/features/settings.md` (light identity edits only).
- **Add stubs (from feature list, seed `docs/features/_template.md`):**
  `docs/features/recordings.md` (Recording lifecycle + library explorer),
  `docs/features/detection.md` (BirdNET engine, model + CC-BY-NC-SA license,
  params, CPU/GPU, JSON/CSV outputs), `docs/features/timeline.md` (timeline view +
  clip playback). Update `AGENTS.md §9/§10` doc maps + register any new agent-doc
  requirements so `pnpm check:agent-docs` stays green.

## 6. Rename table

| Kind | from → to |
|------|-----------|
| kebab / repo / dir | `vibe-coding-starter-kit` → `birdnet-passive-acoustic-monitoring` |
| snake (internal ids) | `vibe_coding_starter_kit` → `birdnet_passive_acoustic_monitoring` |
| Title Case (`APP_NAME`) | `OSS Starter Kit` → `BirdNET Passive Acoustic Monitoring` |
| `APP_DESCRIPTION` | → `Detect and clip bird vocalizations in field recordings, stored on Backblaze B2` |
| package.json name(s) / workspace scope | `vibe-coding-starter-kit`, `@vcsk/*` → `birdnet-passive-acoustic-monitoring`, `@birdnet-pam/*` |
| Docker / Railway / Vercel project + image tags | `vcsk-*` / `oss-start*` → `birdnet-pam-*` |
| CI workflow slugs / job names referencing the app | → `birdnet-passive-acoustic-monitoring` |
| Sidebar footer UTM `utm_content` | `b2ai-oss-start` → `b2ai-birdnet-pam` |
| S3 `user_agent_extra` (Standard #2) | `b2ai-oss-start` → `birdnet-passive-acoustic-monitoring` |

**B2 env-var standardization (Standard #3 — parent `CLAUDE.md`).** The starter is
behind; the new sample MUST use the standard names:
| starter | → standard |
|---------|-----------|
| `B2_KEY_ID` | `B2_APPLICATION_KEY_ID` |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (unchanged) |
| (none) | `B2_REGION` (e.g. `us-west-004`) — add |
| `B2_PUBLIC_URL` | `B2_PUBLIC_URL_BASE` |
| `B2_ENDPOINT` | keep as optional override; if unset, derive `https://s3.<B2_REGION>.backblazeb2.com` |
Pass `region_name=<B2_REGION>` to the boto3 client. Update `config/settings.py`,
`.env.example`, README, and every doc that names the vars. `B2_REGION` required;
`B2_PUBLIC_URL_BASE` optional (don't hard-block if unset — it has a safe absent
path).

## Seeding (for a runnable fresh clone)
Provide a small seed path (README step or `scripts` helper) that ingests ONE short
(~30–120 s) public-domain / CC0 bird recording into `recordings/` and runs
detection, so the timeline/clips demo has content without the user hunting for
audio. Do NOT commit large binary audio into the repo; fetch or document a CC0
source (e.g. a short xeno-canto CC0 clip or BirdNET's bundled example soundscape).
Building/committing binary assets is out of scope for this phase — leave a
documented seed step + code path, not committed media.

## Verification bar (builder must leave green)
`pnpm run setup` then `pnpm verify` green: `check:agent-docs`, backend lint/tests/
structure (boto3-only-in-repo, no backward imports, files < 300 lines, layers
exist), frontend lint/unit/typecheck+build, OpenAPI contract export
(`pnpm contract:export`) matching `API_CLIENT_ROUTES`. Detection/audio tests mock
`birdnet_analyzer` + B2 so the suite stays credential-free and offline (real
BirdNET is exercised by the later verify pipeline step, not `pnpm verify`).
