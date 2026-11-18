import json
import math
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONVERT = ROOT / "scripts" / "convert_audio.py"
CHECK = ROOT / "scripts" / "check_assets.py"
PYTHON = sys.executable


def make_wav(path, seconds=0.6, freq=440.0):
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 16000
    frames = bytearray()
    for i in range(int(rate * seconds)):
        value = int(0.25 * 32767 * math.sin(2 * math.pi * freq * i / rate))
        frames += struct.pack("<h", value)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(bytes(frames))


class AudioToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir()
        people = json.loads((ROOT / "data" / "people.json").read_text(encoding="utf-8"))
        (self.root / "data" / "people.json").write_text(
            json.dumps(people, ensure_ascii=False), encoding="utf-8"
        )
        (self.root / "audio-src").mkdir()
        for index, person in enumerate(people):
            make_wav(self.root / "audio-src" / f"{person['name']}.wav", 0.6, 300 + index * 10)

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, script, *args):
        return subprocess.run(
            [PYTHON, str(script), "--root", str(self.root), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )

    def test_convert_creates_manifest_and_audio(self):
        result = self.run_script(CONVERT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        manifest_path = self.root / "data" / "audio-manifest.json"
        self.assertTrue(manifest_path.exists())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        people = json.loads((self.root / "data" / "people.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest), len(people))

        for entry in manifest.values():
            audio_path = self.root / entry["file"]
            self.assertTrue(audio_path.exists())
            self.assertGreater(audio_path.stat().st_size, 0)
            self.assertGreater(entry["duration"], 0.3)

    def test_check_assets_passes_after_conversion(self):
        conversion = self.run_script(CONVERT)
        self.assertEqual(conversion.returncode, 0, conversion.stdout + conversion.stderr)

        result = self.run_script(CHECK, "--strict")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_check_assets_fails_when_audio_missing(self):
        result = self.run_script(CHECK, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("audio-manifest.json", result.stdout)


if __name__ == "__main__":
    unittest.main()
