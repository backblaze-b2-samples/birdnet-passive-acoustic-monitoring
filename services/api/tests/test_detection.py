"""Unit tests for the BirdNET CSV parser, the audio adapter, and week mapping.

The audio adapter runs for real against soundfile on a tiny generated WAV; the
BirdNET engine itself is never invoked here (its lazy TensorFlow import is
exercised only by the verify pipeline).
"""

import struct
import wave

from app.repo import audio, birdnet
from app.service.detection import _week_from_date


def _make_wav(path: str, seconds: int = 5, sr: int = 8000) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = b"".join(struct.pack("<h", (i % 200) - 100) for i in range(seconds * sr))
        w.writeframes(frames)


# --- BirdNET CSV parsing -------------------------------------------------

def test_parse_csv_maps_columns_and_sorts():
    csv_text = (
        "Start (s),End (s),Scientific name,Common name,Confidence\n"
        "6.0,9.0,Cardinalis cardinalis,Northern Cardinal,0.65\n"
        "1.0,4.0,Turdus migratorius,American Robin,0.91\n"
    )
    detections = birdnet._parse_csv(csv_text)
    assert [d["start_s"] for d in detections] == [1.0, 6.0]  # sorted by start
    first = detections[0]
    assert first["scientific_name"] == "Turdus migratorius"
    assert first["common_name"] == "American Robin"
    assert first["confidence"] == 0.91


def test_parse_csv_tolerates_empty():
    assert birdnet._parse_csv("") == []


def test_parse_csv_skips_malformed_rows():
    csv_text = (
        "Start (s),End (s),Scientific name,Common name,Confidence\n"
        "not,a,number,row,here\n"
        "2.0,5.0,Poecile atricapillus,Black-capped Chickadee,0.5\n"
    )
    detections = birdnet._parse_csv(csv_text)
    assert len(detections) == 1
    assert detections[0]["common_name"] == "Black-capped Chickadee"


def test_read_result_csv_picks_results_not_params(tmp_path):
    """BirdNET 2.4.0 writes two CSVs; `_read_result_csv` must pick the results
    file (`<stem>.BirdNET.results.csv`), never `BirdNET_analysis_params.csv`.

    `BirdNET_analysis_params.csv` sorts first alphabetically (capital `B`), so a
    naive `sorted()[0]` returns the params file and yields zero detections.
    """
    # Params file (no detections) — must NOT be selected.
    (tmp_path / "BirdNET_analysis_params.csv").write_text(
        "File splitting duration,Overlap,Sensitivity\n3.0,0.0,1.0\n",
        encoding="utf-8",
    )
    # Actual detections file.
    (tmp_path / "soundscape.BirdNET.results.csv").write_text(
        "Start (s),End (s),Scientific name,Common name,Confidence\n"
        "0.0,3.0,Poecile atricapillus,Black-capped Chickadee,0.81\n",
        encoding="utf-8",
    )

    raw = birdnet._read_result_csv(str(tmp_path))
    assert raw.startswith("Start (s),End (s),")
    assert "File splitting duration" not in raw

    detections = birdnet._parse_csv(raw)
    assert len(detections) == 1
    assert detections[0]["common_name"] == "Black-capped Chickadee"
    assert detections[0]["confidence"] == 0.81


# --- audio adapter (real soundfile) --------------------------------------

def test_probe_reads_duration_and_samplerate(tmp_path):
    wav = str(tmp_path / "clip.wav")
    _make_wav(wav, seconds=5, sr=8000)
    duration, sr = audio.probe(wav)
    assert sr == 8000
    assert abs(duration - 5.0) < 0.01


def test_slice_clip_returns_wav_bytes(tmp_path):
    wav = str(tmp_path / "clip.wav")
    _make_wav(wav, seconds=5, sr=8000)
    data = audio.slice_clip(wav, 1.0, 2.0, pad_s=0.0)
    assert data[:4] == b"RIFF"
    assert data[8:12] == b"WAVE"
    assert len(data) > 44  # header + samples


def test_slice_clip_clamps_to_file_bounds(tmp_path):
    wav = str(tmp_path / "clip.wav")
    _make_wav(wav, seconds=2, sr=8000)
    # Window beyond the file end must still return a valid, non-empty WAV.
    data = audio.slice_clip(wav, 1.5, 30.0)
    assert data[:4] == b"RIFF"


def test_probe_raises_on_non_audio(tmp_path):
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"not audio at all")
    try:
        audio.probe(str(bad))
        raise AssertionError("expected RuntimeError")
    except RuntimeError:
        pass


# --- week mapping --------------------------------------------------------

def test_week_from_date():
    assert _week_from_date(None) is None
    assert _week_from_date("not-a-date") is None
    assert _week_from_date("2024-01-01") == 1
    assert _week_from_date("2024-12-31") == 48
