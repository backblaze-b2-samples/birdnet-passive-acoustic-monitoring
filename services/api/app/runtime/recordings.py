"""Recordings REST API.

Sync `def` handlers (like runtime/files.py) so blocking B2 I/O runs in
Starlette's threadpool instead of the event loop. Detection is kicked off with
FastAPI `BackgroundTasks`; its live status is persisted in `meta.json` and read
back via GET /recordings/{rec_id}.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.service.dashboard import get_recordings_stats
from app.service.detection import run_detection
from app.service.recordings import (
    RecordingNotFoundError,
    RecordingValidationError,
    create_recording,
    delete_recording,
    get_recording,
    get_recording_detail,
    list_recordings,
    update_recording,
)
from app.types import (
    DetectionParams,
    Recording,
    RecordingDetail,
    RecordingRunResponse,
    RecordingsStats,
    RecordingUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like the Files routes, these are intentionally UNAUTHENTICATED and
# bucket-wide (single-tenant demo stance — see docs/SECURITY.md).


def _parse_optional_float(value: str | None, field: str) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{field} must be a number") from None


@router.get("/recordings", response_model=list[Recording])
def list_recordings_endpoint():
    return list_recordings()


# Declared before the /recordings/{rec_id} routes so "stats" is matched as a
# static path, never captured as a recording id.
@router.get("/recordings/stats", response_model=RecordingsStats)
def recordings_stats_endpoint():
    return get_recordings_stats()


@router.post("/recordings", response_model=Recording)
async def create_recording_endpoint(
    request: Request,
    file: UploadFile,
    site: str = Form(...),
    latitude: str | None = Form(None),
    longitude: str | None = Form(None),
    recorded_at: str | None = Form(None),
    min_conf: float = Form(0.25),
    sensitivity: float = Form(1.0),
    overlap: float = Form(0.0),
    locale: str = Form("en_us"),
):
    # Stream the upload with early size rejection so a huge body can't exhaust
    # memory before validation runs.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_recording_size:
            raise HTTPException(status_code=413, detail="Recording too large")
        chunks.append(chunk)
    file_data = b"".join(chunks)

    params = DetectionParams(
        min_conf=min_conf, sensitivity=sensitivity, overlap=overlap, locale=locale
    )
    try:
        return await run_in_threadpool(
            create_recording,
            file_data=file_data,
            filename=file.filename or "",
            content_type=file.content_type or "application/octet-stream",
            site=site,
            latitude=_parse_optional_float(latitude, "latitude"),
            longitude=_parse_optional_float(longitude, "longitude"),
            recorded_at=recorded_at or None,
            params=params,
        )
    except RecordingValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.get("/recordings/{rec_id}/detections.csv")
def download_detections_csv_endpoint(rec_id: str):
    """Presigned URL for the recording's native BirdNET CSV output."""
    from app.repo import get_presigned_url
    from app.service.recordings import recording_prefix

    try:
        get_recording(rec_id)  # 404 if the recording is gone
    except RecordingNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    url = get_presigned_url(f"{recording_prefix(rec_id)}detections.csv")
    return {"url": url}


@router.post("/recordings/{rec_id}/run", response_model=RecordingRunResponse)
def run_detection_endpoint(rec_id: str, background_tasks: BackgroundTasks):
    try:
        get_recording(rec_id)
    except RecordingNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    background_tasks.add_task(run_detection, rec_id)
    logger.info("Detection run queued: id=%s", rec_id)
    return RecordingRunResponse(id=rec_id, status="running")


@router.get("/recordings/{rec_id}", response_model=RecordingDetail)
def get_recording_endpoint(rec_id: str):
    try:
        return get_recording_detail(rec_id)
    except RecordingNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None


@router.patch("/recordings/{rec_id}", response_model=Recording)
def update_recording_endpoint(rec_id: str, update: RecordingUpdate):
    try:
        return update_recording(rec_id, update)
    except RecordingNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RecordingValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None


@router.delete("/recordings/{rec_id}")
def delete_recording_endpoint(rec_id: str):
    try:
        delete_recording(rec_id)
    except RecordingNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    return {"deleted": True, "id": rec_id}
