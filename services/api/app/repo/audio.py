"""Audio probing + event-clip extraction, backed by `soundfile`.

Wraps libsndfile (via `soundfile`) so the rest of the app never touches an
audio SDK directly. Used by the detection service to (a) read a recording's
duration/samplerate for the timeline scale and (b) slice each detected
`[start_s, end_s]` window into a small WAV clip written back to B2 — the
write-amplification the sample demonstrates.

`soundfile` is imported lazily inside each function (mirrors the lazy Pillow
import in `service/metadata.py`) so importing this module never requires the
native library to be present — tests can mock it.
"""

import io

# A small symmetric pad around each detection so a clip doesn't clip the call.
DEFAULT_PAD_SECONDS = 0.5


def probe(path: str) -> tuple[float, int]:
    """Return (duration_seconds, sample_rate) for an audio file.

    Raises RuntimeError if the file can't be read as audio.
    """
    try:
        import soundfile as sf

        info = sf.info(path)
        return float(info.duration), int(info.samplerate)
    except Exception as e:  # soundfile raises RuntimeError/LibsndfileError
        raise RuntimeError(f"Could not read audio file '{path}': {e}") from e


def slice_clip(
    path: str,
    start_s: float,
    end_s: float,
    pad_s: float = DEFAULT_PAD_SECONDS,
) -> bytes:
    """Slice `[start_s - pad, end_s + pad]` from an audio file to WAV bytes.

    The window is clamped to the file bounds. Returns 16-bit PCM WAV bytes
    suitable for direct upload to B2 and inline `<audio>` playback. Raises
    RuntimeError on any read/write failure.
    """
    try:
        import soundfile as sf

        info = sf.info(path)
        sr = int(info.samplerate)
        start_frame = max(0, int((start_s - pad_s) * sr))
        stop_frame = min(info.frames, int((end_s + pad_s) * sr))
        if stop_frame <= start_frame:
            stop_frame = min(info.frames, start_frame + sr)  # fall back to ~1s
        data, _ = sf.read(
            path, start=start_frame, stop=stop_frame, dtype="int16", always_2d=False
        )
        buf = io.BytesIO()
        sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except Exception as e:
        raise RuntimeError(
            f"Could not slice clip [{start_s}, {end_s}] from '{path}': {e}"
        ) from e
