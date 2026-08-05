"""Typed models for passive-acoustic recordings and BirdNET detections.

A **Recording** is the single primary entity: a continuous field recording
(WAV/FLAC) uploaded to B2 under `recordings/<id>/`, with survey metadata and
BirdNET detection parameters. Detection produces a list of **Detection** rows
plus one event-clip WAV per detection.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Finite-option detection parameters. The create/edit forms present these as
# selectors (never free text); the API re-validates the allowed set so a
# hand-crafted request can't smuggle an out-of-range value into BirdNET.
MIN_CONF_OPTIONS = (0.1, 0.25, 0.5, 0.75)
SENSITIVITY_OPTIONS = (0.75, 1.0, 1.25, 1.5)
OVERLAP_OPTIONS = (0.0, 1.0, 2.0)
LOCALE_OPTIONS = ("en_us", "en_uk", "de", "es", "fr")

DetectionRunStatus = Literal["pending", "running", "completed", "failed"]


class DetectionParams(BaseModel):
    """BirdNET detection knobs stored per recording (see meta.json)."""

    min_conf: float = 0.25
    sensitivity: float = 1.0
    overlap: float = 0.0
    locale: str = "en_us"


class Detection(BaseModel):
    """One BirdNET detection: a species heard in a `[start_s, end_s]` window."""

    scientific_name: str
    common_name: str
    confidence: float
    start_s: float
    end_s: float
    # Object key of the extracted event clip in B2 (set once detection runs).
    clip_key: str | None = None


class SpeciesSummaryItem(BaseModel):
    """Per-species roll-up for the detail view's species summary."""

    scientific_name: str
    common_name: str
    detections: int
    max_confidence: float


class ClipInfo(BaseModel):
    """An event-clip WAV stored under `recordings/<id>/clips/`."""

    key: str
    filename: str
    size_bytes: int
    size_human: str


class Recording(BaseModel):
    """List/summary view of a recording."""

    id: str
    site: str
    latitude: float | None = None
    longitude: float | None = None
    recorded_at: str | None = None  # ISO date (YYYY-MM-DD)
    source_filename: str
    source_key: str
    size_bytes: int
    size_human: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    status: DetectionRunStatus
    error: str | None = None
    params: DetectionParams
    detection_count: int = 0
    species_count: int = 0
    created_at: datetime
    updated_at: datetime
    last_run_at: datetime | None = None


class RecordingDetail(Recording):
    """Full detail: the marquee timeline + species summary + clip players."""

    detections: list[Detection] = Field(default_factory=list)
    species_summary: list[SpeciesSummaryItem] = Field(default_factory=list)
    clips: list[ClipInfo] = Field(default_factory=list)


class RecordingUpdate(BaseModel):
    """Editable survey metadata + detection params (source audio is immutable)."""

    site: str = Field(min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    recorded_at: str | None = None  # ISO date (YYYY-MM-DD) or null
    min_conf: float = 0.25
    sensitivity: float = 1.0
    overlap: float = 0.0
    locale: str = "en_us"


class RecordingRunResponse(BaseModel):
    """Returned when a detection run is accepted (kicked off in the background)."""

    id: str
    status: DetectionRunStatus


class RecordingsStats(BaseModel):
    """PAM dashboard roll-up across every recording in the `recordings/` prefix."""

    recordings_ingested: int
    total_detections: int
    distinct_species: int
    audio_hours: float
    clips_written: int
    storage_bytes: int
    storage_human: str
