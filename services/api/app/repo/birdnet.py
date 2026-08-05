"""BirdNET-Analyzer detection adapter — the ONLY module importing birdnet.

Wraps the official kahst/birdnet-team package (`birdnet-analyzer` on PyPI, import
name `birdnet_analyzer`) — NOT the third-party `birdnetlib` wrapper. Detection
runs fully on-device with the **BirdNET GLOBAL 6K V2.4** model. The model is not
shipped inside the wheel: `birdnet-analyzer` auto-downloads it (~224 MB) from
upstream on the first `analyze()` call and caches it locally inside the package
dir, so the first detection is slower while it downloads/warms up and every run
after reuses the cache. No API key is required (B2 credentials remain the only
secret). The model weights are licensed CC BY-NC-SA 4.0 (non-commercial +
attribution) — see docs/features/detection.md.

Deployment: `local`. BirdNET's TensorFlow/TFLite backend uses a GPU only when a
supported one is present (CUDA); it has no usable Apple MPS backend, so on macOS
arm64 it runs on CPU. CPU is the default everywhere and no GPU is ever required
— nothing here calls a device explicitly, so TensorFlow auto-selects CUDA when
available and falls back to CPU otherwise.

The heavy `birdnet_analyzer` import (pulls in TensorFlow) is deliberately lazy —
inside `analyze_audio` — so importing this module (and the FastAPI app, and the
test suite) never loads TensorFlow. Tests monkeypatch `analyze_audio`.
"""

from __future__ import annotations

import csv
import glob
import inspect
import io
import logging
import os

logger = logging.getLogger(__name__)

# BirdNET sentinel meaning "no location / year-round filter".
_NO_FILTER = -1.0
_NO_WEEK = -1


def _pick(row: dict, *needles: str) -> str:
    """Return the first row value whose header contains any needle (lowercased)."""
    for header, value in row.items():
        if header is None:
            continue
        h = header.strip().lower()
        if any(n in h for n in needles):
            return (value or "").strip()
    return ""


def _parse_csv(text: str) -> list[dict]:
    """Parse BirdNET rtype=csv rows into typed detection dicts."""
    detections: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        try:
            start_s = float(_pick(row, "start"))
            end_s = float(_pick(row, "end"))
            confidence = float(_pick(row, "confidence"))
        except (TypeError, ValueError):
            continue  # skip malformed / header-only rows
        detections.append(
            {
                "scientific_name": _pick(row, "scientific") or "Unknown",
                "common_name": _pick(row, "common") or "Unknown",
                "confidence": confidence,
                "start_s": start_s,
                "end_s": end_s,
            }
        )
    detections.sort(key=lambda d: d["start_s"])
    return detections


def _read_result_csv(output_dir: str) -> str:
    """Return the verbatim text of the BirdNET *results* CSV in `output_dir`.

    BirdNET-Analyzer 2.4.0 writes two CSVs into the output dir: the detections
    file (`<stem>.BirdNET.results.csv`) and a run-parameters file
    (`BirdNET_analysis_params.csv`, no detections). Select the results file —
    plain `sorted()[0]` would return the params file (capital `B` sorts first).

    Returns "" when no CSV was written (e.g. nothing crossed the threshold).
    """
    matches = sorted(glob.glob(os.path.join(output_dir, "**", "*.csv"), recursive=True))
    if not matches:
        return ""
    # Prefer the BirdNET results CSV; never the run-parameters file.
    results = [m for m in matches if os.path.basename(m).endswith(".results.csv")]
    if not results:
        results = [
            m for m in matches
            if os.path.basename(m) != "BirdNET_analysis_params.csv"
        ]
    chosen = results[0] if results else matches[0]
    with open(chosen, encoding="utf-8") as f:
        return f.read()


def analyze_audio(
    audio_path: str,
    output_dir: str,
    *,
    min_conf: float = 0.25,
    sensitivity: float = 1.0,
    overlap: float = 0.0,
    locale: str = "en_us",
    lat: float | None = None,
    lon: float | None = None,
    week: int | None = None,
) -> tuple[list[dict], str]:
    """Run BirdNET-Analyzer over one recording.

    Writes rtype=csv results into `output_dir`, then parses them into typed
    detection dicts. Returns `(detections, raw_csv_text)` where `raw_csv_text`
    is the native CSV kept verbatim for `detections.csv`. Raises RuntimeError on
    engine failure.
    """
    from birdnet_analyzer import analyze  # lazy: pulls in TensorFlow

    kwargs = {
        "audio_input": audio_path,
        "output": output_dir,
        "min_conf": min_conf,
        "sensitivity": sensitivity,
        "overlap": overlap,
        "rtype": "csv",
        "locale": locale,
        "lat": _NO_FILTER if lat is None else float(lat),
        "lon": _NO_FILTER if lon is None else float(lon),
        "week": _NO_WEEK if week is None else int(week),
    }
    # Only pass kwargs the installed birdnet-analyzer actually accepts, so a
    # minor upstream signature change degrades gracefully instead of raising.
    try:
        accepted = set(inspect.signature(analyze).parameters)
        call_kwargs = {k: v for k, v in kwargs.items() if k in accepted}
    except (TypeError, ValueError):
        call_kwargs = kwargs

    logger.info("Running BirdNET on %s (min_conf=%s)", audio_path, min_conf)
    try:
        analyze(**call_kwargs)
    except Exception as e:
        raise RuntimeError(f"BirdNET analysis failed: {e}") from e

    raw_csv = _read_result_csv(output_dir)
    return _parse_csv(raw_csv), raw_csv
