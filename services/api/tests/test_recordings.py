"""Recordings CRUD, dashboard stats, and router tests.

All B2 access is replaced with an in-memory fake so the suite is offline and
credential-free (the real BirdNET + B2 path is exercised by the verify
pipeline, not `pnpm verify`).
"""

import json
from datetime import UTC, datetime

import pytest

from app.service import dashboard as dashboard_service
from app.service import detection as detection_service
from app.service import recordings as rec_service
from app.service.recordings import RecordingValidationError, validate_params
from app.types import DetectionParams


class FakeB2:
    """Minimal in-memory stand-in for the recordings B2 repo helpers."""

    def __init__(self):
        self.store: dict[str, bytes] = {}

    def put_object_bytes(self, key, data, content_type):
        self.store[key] = data

    def put_json(self, key, obj):
        self.store[key] = json.dumps(obj, default=str).encode("utf-8")

    def get_json(self, key):
        raw = self.store.get(key)
        return json.loads(raw) if raw is not None else None

    def list_prefix(self, prefix):
        return [
            {"key": k, "size": len(v), "last_modified": datetime.now(UTC)}
            for k, v in self.store.items()
            if k.startswith(prefix)
        ]

    def delete_prefix(self, prefix):
        keys = [k for k in self.store if k.startswith(prefix)]
        for k in keys:
            del self.store[k]
        return len(keys)

    def download_to_file(self, key, dest_path):
        with open(dest_path, "wb") as f:
            f.write(self.store[key])


@pytest.fixture
def fake_b2(monkeypatch):
    b2 = FakeB2()
    # recordings service
    for name in ("put_object_bytes", "put_json", "get_json", "list_prefix", "delete_prefix"):
        monkeypatch.setattr(rec_service, name, getattr(b2, name))
    # dashboard service
    monkeypatch.setattr(dashboard_service, "get_json", b2.get_json)
    monkeypatch.setattr(dashboard_service, "list_prefix", b2.list_prefix)
    # detection service
    for name in ("put_object_bytes", "put_json", "get_json", "download_to_file"):
        monkeypatch.setattr(detection_service, name, getattr(b2, name))
    # detection engine + audio (deterministic, offline)
    monkeypatch.setattr(
        detection_service.audio, "probe", lambda path: (12.0, 48000)
    )
    monkeypatch.setattr(
        detection_service.audio, "slice_clip", lambda path, s, e, **k: b"RIFFfakeWAVE"
    )
    monkeypatch.setattr(
        detection_service.birdnet,
        "analyze_audio",
        lambda *a, **k: (
            [
                {"scientific_name": "Turdus migratorius", "common_name": "American Robin",
                 "confidence": 0.91, "start_s": 1.0, "end_s": 4.0},
                {"scientific_name": "Turdus migratorius", "common_name": "American Robin",
                 "confidence": 0.72, "start_s": 6.0, "end_s": 9.0},
                {"scientific_name": "Cardinalis cardinalis", "common_name": "Northern Cardinal",
                 "confidence": 0.65, "start_s": 8.0, "end_s": 11.0},
            ],
            "Start (s),End (s),Scientific name,Common name,Confidence\n1.0,4.0,Turdus migratorius,American Robin,0.91\n",
        ),
    )
    return b2


def _create(b2_site="Site A — North Ridge"):
    return rec_service.create_recording(
        file_data=b"RIFFfakeWAVEdata",
        filename="dawn-chorus.wav",
        content_type="audio/wav",
        site=b2_site,
        latitude=45.5,
        longitude=-122.6,
        recorded_at="2024-05-01",
        params=DetectionParams(min_conf=0.25, sensitivity=1.0, overlap=0.0, locale="en_us"),
    )


# --- validation ----------------------------------------------------------

def test_validate_params_snaps_to_allowed_sets():
    snapped = validate_params(
        DetectionParams(min_conf=0.3, sensitivity=1.1, overlap=0.4, locale="en_us")
    )
    assert snapped.min_conf == 0.25
    assert snapped.sensitivity == 1.0
    assert snapped.overlap == 0.0


def test_validate_params_rejects_bad_locale():
    with pytest.raises(RecordingValidationError):
        validate_params(DetectionParams(locale="xx"))


def test_create_rejects_unsupported_extension(fake_b2):
    with pytest.raises(RecordingValidationError) as exc:
        rec_service.create_recording(
            file_data=b"data", filename="notes.txt", content_type="text/plain",
            site="Site A", latitude=None, longitude=None, recorded_at=None,
            params=DetectionParams(),
        )
    assert exc.value.status_code == 415


def test_create_rejects_empty_site(fake_b2):
    with pytest.raises(RecordingValidationError):
        rec_service.create_recording(
            file_data=b"data", filename="a.wav", content_type="audio/wav",
            site="  ", latitude=None, longitude=None, recorded_at=None,
            params=DetectionParams(),
        )


# --- CRUD ---------------------------------------------------------------

def test_create_writes_source_and_meta(fake_b2):
    rec = _create()
    assert rec.status == "pending"
    assert rec.site == "Site A — North Ridge"
    assert rec.source_key in fake_b2.store
    assert rec_service.meta_key(rec.id) in fake_b2.store
    assert rec.detection_count == 0


def test_list_and_detail(fake_b2):
    rec = _create()
    listed = rec_service.list_recordings()
    assert [r.id for r in listed] == [rec.id]
    detail = rec_service.get_recording_detail(rec.id)
    assert detail.id == rec.id
    assert detail.detections == []


def test_update_recording(fake_b2):
    rec = _create()
    from app.types import RecordingUpdate

    updated = rec_service.update_recording(
        rec.id,
        RecordingUpdate(site="Renamed Site", latitude=10.0, longitude=20.0,
                        recorded_at="2024-06-01", min_conf=0.5, sensitivity=1.25,
                        overlap=1.0, locale="de"),
    )
    assert updated.site == "Renamed Site"
    assert updated.params.min_conf == 0.5
    assert updated.params.locale == "de"


def test_delete_cascade(fake_b2):
    rec = _create()
    prefix = rec_service.recording_prefix(rec.id)
    assert any(k.startswith(prefix) for k in fake_b2.store)
    rec_service.delete_recording(rec.id)
    assert not any(k.startswith(prefix) for k in fake_b2.store)


def test_delete_missing_raises(fake_b2):
    with pytest.raises(rec_service.RecordingNotFoundError):
        rec_service.delete_recording("does-not-exist")


# --- detection end-to-end (mocked engine) --------------------------------

def test_run_detection_writes_detections_and_clips(fake_b2):
    rec = _create()
    detection_service.run_detection(rec.id)

    detail = rec_service.get_recording_detail(rec.id)
    assert detail.status == "completed"
    assert detail.detection_count == 3
    assert detail.species_count == 2
    assert len(detail.detections) == 3
    assert all(d.clip_key for d in detail.detections)
    assert len(detail.clips) == 3
    # native CSV kept verbatim
    csv_key = f"{rec_service.recording_prefix(rec.id)}detections.csv"
    assert csv_key in fake_b2.store
    # species summary rolls up per-species
    top = detail.species_summary[0]
    assert top.scientific_name == "Turdus migratorius"
    assert top.detections == 2


def test_run_detection_marks_failed_on_engine_error(fake_b2, monkeypatch):
    rec = _create()

    def boom(*a, **k):
        raise RuntimeError("engine exploded")

    monkeypatch.setattr(detection_service.birdnet, "analyze_audio", boom)
    detection_service.run_detection(rec.id)
    detail = rec_service.get_recording_detail(rec.id)
    assert detail.status == "failed"
    assert "engine exploded" in (detail.error or "")


# --- dashboard stats -----------------------------------------------------

def test_dashboard_stats(fake_b2):
    rec = _create()
    detection_service.run_detection(rec.id)
    stats = dashboard_service.get_recordings_stats()
    assert stats.recordings_ingested == 1
    assert stats.total_detections == 3
    assert stats.distinct_species == 2
    assert stats.clips_written == 3
    assert stats.audio_hours == round(12.0 / 3600, 2)


# --- router --------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_endpoint(client, fake_b2):
    resp = await client.post(
        "/recordings",
        data={"site": "Marsh Edge", "latitude": "44.1", "longitude": "-121.3",
              "recorded_at": "2024-05-10", "min_conf": "0.25"},
        files={"file": ("dawn.wav", b"RIFFfakeWAVE", "audio/wav")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["site"] == "Marsh Edge"
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_run_endpoint_404(client, fake_b2):
    resp = await client.post("/recordings/missing/run")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_detail_404(client, fake_b2):
    resp = await client.get("/recordings/missing")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stats_endpoint(client, fake_b2):
    resp = await client.get("/recordings/stats")
    assert resp.status_code == 200
    assert resp.json()["recordings_ingested"] == 0
