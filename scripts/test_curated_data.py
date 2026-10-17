from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from apply_curated_data import apply_curated_data


def fixture_curated() -> dict:
    return {
        "schema_version": "1.0.0",
        "region": "US",
        "currency": "USD",
        "index_versions": {"intelligence_methodology": "v4.3.2", "coding": None, "coding_agent": "v1.5"},
        "sources": [],
        "plans": [{"id": "reviewed-plan"}],
        "quotas": [],
        "coding_agents": [],
        "index_methodology": {},
        "benchmark_catalog": [],
        "notes": [],
    }


class CuratedDataTests(unittest.TestCase):
    def create_root(self, root: Path, curated: dict | None = None) -> None:
        (root / "data").mkdir(parents=True)
        (root / "public/data").mkdir(parents=True)
        (root / "data/curated.json").write_text(json.dumps(curated or fixture_curated()), encoding="utf-8")
        (root / "public/data/snapshot.json").write_text(json.dumps({
            "schema_version": "1.0.0",
            "as_of": "2026-10-17",
            "index_versions": {"intelligence_api": "4.3", "intelligence_methodology": "old"},
            "models": [{"id": "keep-this-api-model"}],
            "plans": [],
        }), encoding="utf-8")

    def test_overlay_updates_curated_fields_and_preserves_api_models_and_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            result = apply_curated_data(root)
            snapshot = json.loads((root / "public/data/snapshot.json").read_text(encoding="utf-8"))
            self.assertTrue(result["changed"])
            self.assertEqual(snapshot["plans"], [{"id": "reviewed-plan"}])
            self.assertEqual(snapshot["models"], [{"id": "keep-this-api-model"}])
            self.assertEqual(snapshot["as_of"], "2026-10-17")
            self.assertEqual(snapshot["index_versions"]["intelligence_api"], "4.3")
            self.assertEqual(snapshot["index_versions"]["intelligence_methodology"], "v4.3.2")

    def test_curated_data_cannot_replace_dynamic_models_or_api_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            curated = fixture_curated()
            curated["models"] = []
            self.create_root(root, curated)
            original = (root / "public/data/snapshot.json").read_bytes()
            with self.assertRaises(ValueError):
                apply_curated_data(root)
            self.assertEqual((root / "public/data/snapshot.json").read_bytes(), original)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            curated = fixture_curated()
            curated["index_versions"]["intelligence_api"] = "fake"
            self.create_root(root, curated)
            with self.assertRaises(ValueError):
                apply_curated_data(root)

    def test_identical_curated_data_does_not_rewrite_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            curated = fixture_curated()
            self.create_root(root, curated)
            snapshot_path = root / "public/data/snapshot.json"
            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            for key, value in curated.items():
                if key == "index_versions":
                    snapshot[key].update(value)
                else:
                    snapshot[key] = value
            snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            original = snapshot_path.read_bytes()
            result = apply_curated_data(root)
            self.assertFalse(result["changed"])
            self.assertEqual(snapshot_path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
