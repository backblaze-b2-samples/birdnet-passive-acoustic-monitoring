"""Detection orchestration: download → BirdNET → clip → write back to B2.

Pure orchestration (no boto3). Runs as a FastAPI background task. Reads the
recording's source audio from B2, runs the on-device BirdNET engine
(`repo/birdnet`), slices an event clip per detection (`repo/audio`), and writes
`detections.json`, `detections.csv`, `clips/*.wav`, and an updated `meta.json`
back to B2. Status is persisted in `meta.json` throughout so the UI can poll a
live run.
"""

import logging
import os
import tempfile
from datetime import UTC, date, datetime

from app.repo import (
    audio,
    birdnet,
    download_to_file,
    get_json,
    put_json,
    put_object_bytes,
)
from app.service.recordings import (
    clips_prefix,
    meta_key,
    recording_prefix,
    slugify,
)

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _week_from_date(recorded_at: str | None) -> int | None:
    """Map an ISO date to a BirdNET week bucket (1-48; 4 per month)."""
    if not recorded_at:
        return None
    try:
        d = date.fromisoformat(recorded_at)
    except ValueError:
        return None
    return (d.month - 1) * 4 + min((d.day - 1) // 7, 3) + 1


def _set_status(meta: dict, rec_id: str, status: str, **fields) -> dict:
    meta.update(status=status, updated_at=_now_iso(), **fields)
    put_json(meta_key(rec_id), meta)
    return meta


def _clip_key(rec_id: str, index: int, det: dict) -> str:
    slug = slugify(det.get("common_name") or det.get("scientific_name") or "clip")
    start = f"{det['start_s']:.1f}"
    end = f"{det['end_s']:.1f}"
    return f"{clips_prefix(rec_id)}{index:03d}_{slug}_{start}-{end}.wav"


def run_detection(rec_id: str) -> None:
    """Run (or re-run) BirdNET detection for one recording. Never raises."""
    meta = get_json(meta_key(rec_id))
    if not meta:
        logger.warning("Detection run skipped: recording %s not found", rec_id)
        return

    _set_status(meta, rec_id, "running", error=None)
    params = meta.get("params", {})

    tmp_dir = tempfile.mkdtemp(prefix=f"birdnet-{rec_id}-")
    try:
        # 1) Pull the source audio down from B2.
        source_key = meta["source_key"]
        ext = source_key.rsplit(".", 1)[-1] if "." in source_key else "wav"
        local_audio = os.path.join(tmp_dir, f"source.{ext}")
        download_to_file(source_key, local_audio)

        # 2) Probe duration/samplerate for the timeline scale.
        duration, sample_rate = audio.probe(local_audio)
        meta = _set_status(
            meta, rec_id, "running",
            duration_seconds=duration, sample_rate=sample_rate,
        )

        # 3) Run the on-device BirdNET engine.
        out_dir = os.path.join(tmp_dir, "out")
        os.makedirs(out_dir, exist_ok=True)
        detections, raw_csv = birdnet.analyze_audio(
            local_audio,
            out_dir,
            min_conf=params.get("min_conf", 0.25),
            sensitivity=params.get("sensitivity", 1.0),
            overlap=params.get("overlap", 0.0),
            locale=params.get("locale", "en_us"),
            lat=meta.get("latitude"),
            lon=meta.get("longitude"),
            week=_week_from_date(meta.get("recorded_at")),
        )

        # 4) Slice + upload an event clip per detection (write-amplification).
        for i, det in enumerate(detections):
            try:
                clip_bytes = audio.slice_clip(local_audio, det["start_s"], det["end_s"])
            except RuntimeError as e:
                logger.warning("Clip slice failed for %s #%d: %s", rec_id, i, e)
                continue
            key = _clip_key(rec_id, i, det)
            put_object_bytes(key, clip_bytes, "audio/wav")
            det["clip_key"] = key

        # 5) Persist detections (json for the UI, csv verbatim from BirdNET).
        put_json(f"{recording_prefix(rec_id)}detections.json", detections)
        put_object_bytes(
            f"{recording_prefix(rec_id)}detections.csv",
            raw_csv.encode("utf-8"),
            "text/csv",
        )

        species = {d["scientific_name"] for d in detections}
        _set_status(
            meta, rec_id, "completed",
            detection_count=len(detections),
            species_count=len(species),
            last_run_at=_now_iso(),
            error=None,
        )
        logger.info(
            "Detection complete: id=%s detections=%d species=%d",
            rec_id, len(detections), len(species),
        )
    except Exception as e:
        logger.error("Detection failed for %s: %s", rec_id, e, exc_info=True)
        _set_status(meta, rec_id, "failed", error=str(e))
    finally:
        _cleanup(tmp_dir)


def _cleanup(tmp_dir: str) -> None:
    import shutil

    shutil.rmtree(tmp_dir, ignore_errors=True)
