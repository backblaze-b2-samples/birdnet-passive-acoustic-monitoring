"""Recordings CRUD orchestration over the B2 `recordings/` prefix.

Pure orchestration — no boto3 here. Each recording lives under
`recordings/<id>/`:

    source/<filename>   raw field recording (WAV/FLAC/…)
    meta.json           survey metadata + detection params + status + duration
    detections.json     typed detections (written by service/detection.py)
    detections.csv      BirdNET native CSV output (verbatim)
    clips/<i>_<slug>_<start>-<end>.wav   event-aligned clips
"""

import logging
import re
import secrets
from datetime import UTC, datetime

from app.config import settings
from app.repo import (
    delete_prefix,
    get_json,
    list_prefix,
    put_json,
    put_object_bytes,
)
from app.types import (
    ClipInfo,
    Detection,
    DetectionParams,
    Recording,
    RecordingDetail,
    RecordingUpdate,
    SpeciesSummaryItem,
)
from app.types.formatting import humanize_bytes
from app.types.recordings import (
    LOCALE_OPTIONS,
    MIN_CONF_OPTIONS,
    OVERLAP_OPTIONS,
    SENSITIVITY_OPTIONS,
)

logger = logging.getLogger(__name__)

# Accepted source-audio extensions. BirdNET (via librosa/soundfile) decodes all
# of these; WAV/FLAC are the passive-acoustic norm.
ALLOWED_AUDIO_EXT = {"wav", "flac", "mp3", "ogg"}
_SAFE_FILENAME_RE = re.compile(r"[^\w\-.]")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


class RecordingNotFoundError(Exception):
    def __init__(self, detail: str = "Recording not found"):
        self.detail = detail
        super().__init__(detail)


class RecordingValidationError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


# --- key helpers ---------------------------------------------------------

def _prefix() -> str:
    return settings.recordings_prefix


def recording_prefix(rec_id: str) -> str:
    return f"{_prefix()}{rec_id}/"


def meta_key(rec_id: str) -> str:
    return f"{recording_prefix(rec_id)}meta.json"


def source_key(rec_id: str, filename: str) -> str:
    return f"{recording_prefix(rec_id)}source/{filename}"


def clips_prefix(rec_id: str) -> str:
    return f"{recording_prefix(rec_id)}clips/"


def slugify(value: str) -> str:
    return _SLUG_RE.sub("-", value.lower()).strip("-") or "clip"


def sanitize_filename(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1].replace("\x00", "")
    name = _SAFE_FILENAME_RE.sub("_", name).lstrip(".").strip()
    return name[:200] or "recording"


def new_recording_id() -> str:
    """URL-safe id: upload timestamp + short random suffix (collision-safe)."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    return f"{stamp}-{secrets.token_hex(3)}"


# --- validation ----------------------------------------------------------

def _closest(value: float, options: tuple[float, ...]) -> float:
    return min(options, key=lambda o: abs(o - value))


def validate_params(params: DetectionParams) -> DetectionParams:
    """Snap params to their allowed finite sets (defence in depth vs. the UI)."""
    if params.locale not in LOCALE_OPTIONS:
        raise RecordingValidationError(f"Unsupported locale '{params.locale}'")
    return DetectionParams(
        min_conf=_closest(params.min_conf, MIN_CONF_OPTIONS),
        sensitivity=_closest(params.sensitivity, SENSITIVITY_OPTIONS),
        overlap=_closest(params.overlap, OVERLAP_OPTIONS),
        locale=params.locale,
    )


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# --- mapping -------------------------------------------------------------

def _recording_from_meta(meta: dict) -> Recording:
    return Recording(**meta)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# --- commands ------------------------------------------------------------

def create_recording(
    *,
    file_data: bytes,
    filename: str,
    content_type: str,
    site: str,
    latitude: float | None,
    longitude: float | None,
    recorded_at: str | None,
    params: DetectionParams,
) -> Recording:
    """Ingest a field recording: write source/ + meta.json to B2."""
    if not site or not site.strip():
        raise RecordingValidationError("Site name is required")
    if len(file_data) == 0:
        raise RecordingValidationError("Empty audio file")
    if len(file_data) > settings.max_recording_size:
        raise RecordingValidationError(
            f"Recording too large. Max: {humanize_bytes(settings.max_recording_size)}",
            status_code=413,
        )
    safe_name = sanitize_filename(filename)
    if _extension(safe_name) not in ALLOWED_AUDIO_EXT:
        raise RecordingValidationError(
            f"Unsupported audio type. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXT))}",
            status_code=415,
        )
    params = validate_params(params)

    rec_id = new_recording_id()
    src_key = source_key(rec_id, safe_name)
    put_object_bytes(src_key, file_data, content_type or "application/octet-stream")

    now = _now_iso()
    meta = {
        "id": rec_id,
        "site": site.strip(),
        "latitude": latitude,
        "longitude": longitude,
        "recorded_at": recorded_at or None,
        "source_filename": safe_name,
        "source_key": src_key,
        "size_bytes": len(file_data),
        "size_human": humanize_bytes(len(file_data)),
        "duration_seconds": None,
        "sample_rate": None,
        "status": "pending",
        "error": None,
        "params": params.model_dump(),
        "detection_count": 0,
        "species_count": 0,
        "created_at": now,
        "updated_at": now,
        "last_run_at": None,
    }
    put_json(meta_key(rec_id), meta)
    logger.info("Recording created: id=%s site=%s", rec_id, site)
    return _recording_from_meta(meta)


def list_recordings() -> list[Recording]:
    """List every recording (newest first) by reading each meta.json."""
    recordings: list[Recording] = []
    for obj in list_prefix(_prefix()):
        if not obj["key"].endswith("/meta.json"):
            continue
        meta = get_json(obj["key"])
        if meta:
            recordings.append(_recording_from_meta(meta))
    recordings.sort(key=lambda r: r.created_at, reverse=True)
    return recordings


def get_recording(rec_id: str) -> Recording:
    meta = get_json(meta_key(rec_id))
    if not meta:
        raise RecordingNotFoundError()
    return _recording_from_meta(meta)


def _species_summary(detections: list[Detection]) -> list[SpeciesSummaryItem]:
    by_species: dict[str, SpeciesSummaryItem] = {}
    for d in detections:
        item = by_species.get(d.scientific_name)
        if item is None:
            by_species[d.scientific_name] = SpeciesSummaryItem(
                scientific_name=d.scientific_name,
                common_name=d.common_name,
                detections=1,
                max_confidence=d.confidence,
            )
        else:
            item.detections += 1
            item.max_confidence = max(item.max_confidence, d.confidence)
    return sorted(by_species.values(), key=lambda s: s.detections, reverse=True)


def get_recording_detail(rec_id: str) -> RecordingDetail:
    meta = get_json(meta_key(rec_id))
    if not meta:
        raise RecordingNotFoundError()
    raw = get_json(f"{recording_prefix(rec_id)}detections.json") or []
    detections = [Detection(**d) for d in raw]
    clips = [
        ClipInfo(
            key=obj["key"],
            filename=obj["key"].rsplit("/", 1)[-1],
            size_bytes=obj["size"],
            size_human=humanize_bytes(obj["size"]),
        )
        for obj in list_prefix(clips_prefix(rec_id))
    ]
    return RecordingDetail(
        **meta,
        detections=detections,
        species_summary=_species_summary(detections),
        clips=clips,
    )


def update_recording(rec_id: str, update: RecordingUpdate) -> Recording:
    meta = get_json(meta_key(rec_id))
    if not meta:
        raise RecordingNotFoundError()
    params = validate_params(
        DetectionParams(
            min_conf=update.min_conf,
            sensitivity=update.sensitivity,
            overlap=update.overlap,
            locale=update.locale,
        )
    )
    meta.update(
        site=update.site.strip(),
        latitude=update.latitude,
        longitude=update.longitude,
        recorded_at=update.recorded_at or None,
        params=params.model_dump(),
        updated_at=_now_iso(),
    )
    put_json(meta_key(rec_id), meta)
    logger.info("Recording updated: id=%s", rec_id)
    return _recording_from_meta(meta)


def delete_recording(rec_id: str) -> None:
    """Cascade-delete the whole recordings/<id>/ subtree from B2."""
    deleted = delete_prefix(recording_prefix(rec_id))
    if deleted == 0:
        raise RecordingNotFoundError()
    logger.info("Recording deleted: id=%s objects=%d", rec_id, deleted)
