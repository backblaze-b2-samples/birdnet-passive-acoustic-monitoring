"""PAM dashboard aggregation over the B2 `recordings/` prefix.

Pure orchestration (no boto3). Derives storage/clip counts from a single
full-prefix listing, then reads each recording's `meta.json` (and, for
completed recordings, `detections.json`) to roll up detections, distinct
species, and audio-hours.
"""

from app.config import settings
from app.repo import get_json, list_prefix
from app.service.recordings import recording_prefix
from app.types import RecordingsStats
from app.types.formatting import humanize_bytes


def get_recordings_stats() -> RecordingsStats:
    prefix = settings.recordings_prefix
    objects = list_prefix(prefix)

    storage_bytes = sum(o["size"] for o in objects)
    clips_written = sum(1 for o in objects if "/clips/" in o["key"])
    meta_keys = [o["key"] for o in objects if o["key"].endswith("/meta.json")]

    total_detections = 0
    audio_seconds = 0.0
    distinct_species: set[str] = set()

    for key in meta_keys:
        meta = get_json(key)
        if not meta:
            continue
        total_detections += int(meta.get("detection_count") or 0)
        audio_seconds += float(meta.get("duration_seconds") or 0.0)
        if meta.get("detection_count"):
            rec_id = meta["id"]
            detections = get_json(f"{recording_prefix(rec_id)}detections.json") or []
            distinct_species.update(
                d.get("scientific_name", "") for d in detections if d.get("scientific_name")
            )

    return RecordingsStats(
        recordings_ingested=len(meta_keys),
        total_detections=total_detections,
        distinct_species=len(distinct_species),
        audio_hours=round(audio_seconds / 3600.0, 2),
        clips_written=clips_written,
        storage_bytes=storage_bytes,
        storage_human=humanize_bytes(storage_bytes),
    )
