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
            state = {"sha256": "same", "reviewed_sha256": "same", "etag": "abc", "http_status": 200, "availability": "available", "error": None, "label": "Official source", "url": "https://artificialanalysis.ai/method", "last_success_at": "2026-10-17T00:00:00Z", "state_changed_at": "2026-10-17T00:00:00Z"}
            cache_path = root / "public/data/source-health-cache.json"
            cache_path.write_text(json.dumps({"sources": {"sample": state}, "pending_warnings": {}}), encoding="utf-8")
            with patch.object(source_health, "request_source", return_value=("ok", None, dict(state))):
                source_health.check_sources(root)
            status = root / "public/data/status.json"
            cache_before, status_before = cache_path.read_bytes(), status.read_bytes()
            with patch.object(source_health, "request_source", return_value=("ok", None, {**state, "etag": "changed-validator-only"})):
                source_health.check_sources(root)
            self.assertEqual(cache_path.read_bytes(), cache_before)
            self.assertEqual(status.read_bytes(), status_before)

    def test_content_change_waits_for_review_and_is_persistent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            old = {"sha256": "old", "reviewed_sha256": "old", "http_status": 200, "availability": "available", "error": None, "label": "Official source", "url": "https://artificialanalysis.ai/method"}
            (root / "public/data/source-health-cache.json").write_text(json.dumps({"sources": {"sample": old}, "pending_warnings": {}}), encoding="utf-8")
            with patch.object(source_health, "request_source", return_value=("ok", None, {**old, "sha256": "new"})):
                result = source_health.check_sources(root)
            self.assertEqual(result["pending_warnings"], 1)
            self.assertEqual(result["unavailable_sources"], 0)
            status = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["source_health"]["status"], "warning")
            with patch.object(source_health, "request_source", return_value=("ok", None, {**old, "sha256": "new"})):
                source_health.check_sources(root)
            status_after = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))
            self.assertEqual(len(status_after["source_health"]["warnings"]), 1)

    def test_403_is_reported_as_fetch_block_not_content_change(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            old = {"sha256": "last-good", "reviewed_sha256": "last-good", "http_status": 200, "availability": "available", "error": None, "label": "Official source", "url": "https://artificialanalysis.ai/method"}
            cache_path = root / "public/data/source-health-cache.json"
            cache_path.write_text(json.dumps({"sources": {"sample": old}, "pending_warnings": {}}), encoding="utf-8")
            result_state = {**old, "availability": "blocked", "http_status": 403, "error": "HTTP 403: forbidden"}
            with patch.object(source_health, "request_source", return_value=("blocked", "HTTP 403: forbidden", result_state)):
                result = source_health.check_sources(root)
            self.assertEqual(result["pending_warnings"], 0)
            self.assertEqual(result["unavailable_sources"], 1)
            persisted = json.loads(cache_path.read_text(encoding="utf-8"))["sources"]["sample"]
            self.assertEqual(persisted["sha256"], "last-good")
            self.assertEqual(persisted["reviewed_sha256"], "last-good")
            self.assertEqual(persisted["availability"], "blocked")
            status = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["source_health"]["status"], "ok")
            self.assertEqual(status["source_health"]["unavailable"][0]["category"], "blocked")

    def test_404_is_not_interpreted_as_a_retired_product_or_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            snapshot_path = root / "public/data/snapshot.json"
            snapshot_before = snapshot_path.read_bytes()
            old = {"sha256": "last-good", "reviewed_sha256": "last-good", "http_status": 200, "availability": "available", "error": None, "label": "Official source", "url": "https://artificialanalysis.ai/method"}
            (root / "public/data/source-health-cache.json").write_text(json.dumps({"sources": {"sample": old}, "pending_warnings": {}}), encoding="utf-8")
            result_state = {**old, "availability": "not_found", "http_status": 404, "error": "HTTP 404: not found"}
            with patch.object(source_health, "request_source", return_value=("not_found", "HTTP 404: not found", result_state)):
                result = source_health.check_sources(root)
            self.assertEqual(result["pending_warnings"], 0)
            self.assertEqual(result["unavailable_sources"], 1)
            self.assertEqual(snapshot_path.read_bytes(), snapshot_before)
            report = json.loads((root / "public/data/status.json").read_text(encoding="utf-8"))["source_health"]
            self.assertIn("不能單憑 404 判定方案已停止", source_health._http_failure(404, old)[1])
            self.assertEqual(report["unavailable"][0]["category"], "not_found")

    def test_acknowledgement_moves_review_baseline_forward(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            changed = {"sha256": "new", "reviewed_sha256": "old", "http_status": 200, "availability": "available", "error": None, "label": "Official source", "url": "https://artificialanalysis.ai/method"}
            cache = {"sources": {"sample": changed}, "pending_warnings": {"change:sample": {"source_id": "sample", "label": "Official source", "url": changed["url"], "message": "changed"}}}
            cache_path = root / "public/data/source-health-cache.json"
            cache_path.write_text(json.dumps(cache), encoding="utf-8")
            removed = source_health.acknowledge_source(root, "sample")
            self.assertEqual(removed, 1)
            persisted = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["sources"]["sample"]["reviewed_sha256"], "new")
            self.assertEqual(persisted["pending_warnings"], {})

    def test_removed_source_does_not_keep_a_stale_content_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.create_root(root)
            cache_path = root / "public/data/source-health-cache.json"
            cache_path.write_text(json.dumps({
                "sources": {"sample": {"availability": "available", "sha256": "same"}},
                "pending_warnings": {
                    "change:removed": {"source_id": "removed", "label": "Removed source", "url": "https://example.com", "message": "stale"}
                },
            }), encoding="utf-8")
            with patch.object(source_health, "request_source", return_value=("ok", None, {"availability": "available", "sha256": "same"})):
                result = source_health.check_sources(root)
            self.assertEqual(result["pending_warnings"], 0)
            persisted = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["pending_warnings"], {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
