"""Generate voice-over clips for every dialogue line with Piper TTS (offline).

Reads tools/voices/lines.json (from extract-lines.ts), writes public/voices/<key>.mp3
and public/voices/manifest.json. Clips that already exist are reused, so re-running
after editing dialogue only synthesizes the changed lines.

Usage: python tools/voices/gen_voices.py <voices_dir> [ffmpeg]
"""
import hashlib
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parents[2]
LINES = ROOT / "tools" / "voices" / "lines.json"
OUT = ROOT / "public" / "voices"

# Character casting: base Piper model, pitch shift (semitones) and pace (>1 = slower).
CAST = {
    "narrator": ("en_GB-alan-medium", -2.0, 1.08),
    "rico":     ("en_GB-alan-medium", 0.8, 1.0),
    "max":      ("en_GB-alan-medium", -3.2, 1.1),
    "dex":      ("en_GB-alan-medium", 3.0, 0.86),
    "tito":     ("en_GB-alan-medium", 1.8, 0.92),
    "flamingo": ("en_GB-alan-medium", -1.2, 1.15),
    "carla":    ("en_GB-alba-medium", -0.8, 1.0),
    "marisol":  ("en_GB-alba-medium", -2.2, 0.96),
    "lena":     ("en_GB-alba-medium", 0.4, 1.08),
    "priya":    ("en_GB-alba-medium", 2.4, 0.92),
    "amara":    ("en_GB-alba-medium", -1.4, 1.05),
    "nova":     ("en_GB-alba-medium", 3.6, 0.95),
    "kai":      ("en_GB-alan-medium", -2.6, 1.02),
    "jules":    ("en_GB-alan-medium", 2.2, 0.97),
    "lotus":    ("en_GB-alan-medium", -4.0, 1.18),
}
LOCAL_VARIANTS = [
    ("en_GB-alan-medium", 1.2, 0.95), ("en_GB-alba-medium", 1.4, 0.95), ("en_GB-alan-medium", -1.8, 1.02),
    ("en_GB-alba-medium", -1.6, 1.0), ("en_GB-alan-medium", 3.5, 0.9), ("en_GB-alba-medium", 3.2, 0.9),
]


def cast_for(speaker: str, key: str):
    if speaker in CAST:
        return CAST[speaker]
    return LOCAL_VARIANTS[int(hashlib.md5(key.encode()).hexdigest(), 16) % len(LOCAL_VARIANTS)]


def main() -> None:
    voices_dir = Path(sys.argv[1])
    ffmpeg = sys.argv[2] if len(sys.argv) > 2 else "ffmpeg"
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    models: dict = {}
    done = 0
    for line in lines:
        key, speaker, text = line["key"], line["speaker"], line["text"]
        dest = OUT / f"{key}.mp3"
        if dest.exists() and key in manifest:
            continue
        model, semitones, pace = cast_for(speaker, key)
        if model not in models:
            path = voices_dir / f"{model}.onnx"
            if not path.exists():
                raise SystemExit(f"missing Piper model {path}")
            models[model] = PiperVoice.load(str(path))
        voice = models[model]
        chunks = list(voice.synthesize(text, syn_config=SynthesisConfig(length_scale=pace)))
        audio = np.concatenate([c.audio_float_array for c in chunks])
        sr = chunks[0].sample_rate
        peak = float(np.max(np.abs(audio))) or 1.0
        pcm = (audio / peak * 0.9 * 32767).astype(np.int16)
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "line.wav"
            with wave.open(str(wav), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes(pcm.tobytes())
            ratio = 2 ** (semitones / 12)
            # pitch shift without changing duration: resample rate, then compensate tempo
            af = f"asetrate={int(sr * ratio)},aresample={sr},atempo={1 / ratio:.5f},highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=5:release=80"
            subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(wav), "-af", af, "-ac", "1", "-b:a", "48k", str(dest)], check=True)
        manifest[key] = round(len(pcm) / sr, 2)
        done += 1
        if done % 10 == 0:
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            print(f"{done} generated…", flush=True)
    # drop clips for lines that no longer exist
    keep = {l["key"] for l in lines}
    for k in list(manifest):
        if k not in keep:
            manifest.pop(k)
            (OUT / f"{k}.mp3").unlink(missing_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    print(f"done: {done} new clips, {len(manifest)} total")


if __name__ == "__main__":
    main()
