from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import source_health


class SourceHealthTests(unittest.TestCase):
    def create_root(self, root: Path) -> None:
        (root / "public/data").mkdir(parents=True)
        (root / "public/data/snapshot.json").write_text(json.dumps({
            "sources": [{"id": "sample", "label": "Official source", "url": "https://artificialanalysis.ai/method", "kind": "official"}]
        }), encoding="utf-8")
        (root / "public/data/status.json").write_text(json.dumps({"aa": {"status": "disabled"}}), encoding="utf-8")

    def test_unchanged_source_does_not_rewrite_status_or_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            state = {"sha256": "same", "etag": "abc", "http_status": 200, "error": None}
            with patch.object(source_health, "request_source", return_value=("ok", None, state)):
                source_health.check_sources(root)
            cache = root / "public/data/source-health-cache.json"
            status = root / "public/data/status.json"
            cache_before, status_before = cache.read_bytes(), status.read_bytes()
            with patch.object(source_health, "request_source", return_value=("ok", None, {**state, "etag": "changed-validator-only"})):
                source_health.check_sources(root)
            self.assertEqual(cache.read_bytes(), cache_before)
            self.assertEqual(status.read_bytes(), status_before)

    def test_content_change_creates_persistent_manual_review_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            with patch.object(source_health, "request_source", return_value=("ok", None, {"sha256": "old", "etag": None, "http_status": 200, "error": None})):
                source_health.check_sources(root)
            with patch.object(source_health, "request_source", return_value=("ok", None, {"sha256": "new", "etag": None, "http_status": 200, "error": None})):
                result = source_health.check_sources(root)
            self.assertEqual(result["pending_warnings"], 1)
            status = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["source_health"]["status"], "warning")
            with patch.object(source_health, "request_source", return_value=("ok", None, {"sha256": "new", "etag": None, "http_status": 200, "error": None})):
                source_health.check_sources(root)
            status_after = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))
            self.assertEqual(status_after["source_health"]["status"], "warning")


if __name__ == "__main__":
    unittest.main(verbosity=2)
