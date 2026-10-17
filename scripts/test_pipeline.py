#!/usr/bin/env python3
"""Offline regression tests for public-data validation and the AA connector."""

from __future__ import annotations

import copy
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from typing import Any
from unittest.mock import patch

import import_coding_agents
import update_data
import validate_data


def aa_model(model_id: str = "fixture-model", name: str = "Fixture Model") -> dict[str, Any]:
    return {
        "id": model_id,
        "name": name,
        "model_creator": {"name": "Fixture Provider"},
        "release_date": "2026-10-01",
        "intelligence_index": 81.0,
        "coding_index": 75.0,
        "agentic_index": 72.0,
        "finance_accounting_index": 68.0,
        "strategy_ops_index": 70.0,
        "legal_index": 65.0,
        "healthcare_medical_index": 67.0,
        "engineering_index": 74.0,
        "economics_index": 69.0,
        "pricing": {
            "price_1m_input_tokens": 1.2,
            "price_1m_output_tokens": 4.8,
            "price_1m_cached_input_tokens": 0.3,
            "price_1m_cache_write_tokens": 1.5,
        },
        "performance": {"median_output_tokens_per_second": 42.0, "time_to_first_token_ms": 310.0},
        "artificial_analysis_intelligence_index_cost": {"cost_per_task": {"total_cost": 0.037}},
    }


def api_page(models: list[dict[str, Any]], page: int = 1, pages: int = 1) -> dict[str, Any]:
    return {
        "intelligence_index_version": "4.3",
        "data": models,
        "pagination": {"page": page, "total_pages": pages},
    }


class BytesResponse(io.BytesIO):
    def __init__(self, payload: object, status: int = 200, headers: dict[str, str] | None = None):
        super().__init__(json.dumps(payload).encode("utf-8"))
        self.status = status
        self.headers = headers or {}


class PipelineTests(unittest.TestCase):
    def test_normalizer_keeps_nine_indices_and_exact_task_cost_path(self) -> None:
        result = update_data.normalize_model(aa_model(), "2026-10-16T00:00:00Z", "4.3")
        self.assertEqual(len(result["indices"]), 9)
        self.assertEqual(result["indices"]["intelligence"], 81.0)
        self.assertEqual(result["intelligence_cost_per_task_usd"], 0.037)
        self.assertEqual(result["intelligence_cost_benchmark_version"], "4.3")
        self.assertEqual(result["api_pricing"]["input_per_million_usd"], 1.2)
        self.assertEqual(result["benchmarks"], [])

    def test_normalizer_maps_official_evaluation_keys_for_all_nine_indices(self) -> None:
        model = aa_model()
        for key in (
            "intelligence_index", "coding_index", "agentic_index", "finance_accounting_index",
            "strategy_ops_index", "legal_index", "healthcare_medical_index", "engineering_index", "economics_index",
        ):
            model.pop(key)
        model["evaluations"] = {
            "artificial_analysis_intelligence_index": 81.0,
            "artificial_analysis_coding_index": 75.0,
            "artificial_analysis_agentic_index": 72.0,
            "artificial_analysis_finance_and_accounting_index": 68.0,
            "artificial_analysis_strategy_and_ops_index": 70.0,
            "artificial_analysis_legal_index": 65.0,
            "artificial_analysis_healthcare_and_medical_index": 67.0,
            "artificial_analysis_engineering_index": 74.0,
            "artificial_analysis_economics_index": 69.0,
        }

        result = update_data.normalize_model(model, "2026-10-17T14:08:58Z", "4.3")
        self.assertEqual(result["indices"], {
            "intelligence": 81.0,
            "coding": 75.0,
            "agentic": 72.0,
            "finance_accounting": 68.0,
            "strategy_ops": 70.0,
            "legal": 65.0,
            "healthcare_medical": 67.0,
            "engineering": 74.0,
            "economics": 69.0,
        })

    def test_api_response_requires_data_and_pagination_schema(self) -> None:
        models, pagination, version = update_data.validate_page(api_page([aa_model()]))
        self.assertEqual(len(models), 1)
        self.assertEqual(pagination["total_pages"], 1)
        self.assertEqual(version, "4.3")
        with self.assertRaises(ValueError):
            update_data.validate_page({"data": []})

    def test_fetcher_reads_every_page_and_checks_version_consistency(self) -> None:
        pages = [api_page([aa_model("one")], 1, 2), api_page([aa_model("two")], 2, 2)]
        calls: list[str] = []

        def opener(request, timeout=40):
            calls.append(request.full_url)
            return BytesResponse(pages[len(calls) - 1])

        with tempfile.TemporaryDirectory() as tmp:
            models, version, _, _ = update_data.fetch_all_models("fixture-key", Path(tmp) / "cache.json", opener)
        self.assertEqual([model["id"] for model in models], ["one", "two"])
        self.assertEqual(version, "4.3")
        self.assertEqual(len(calls), 2)

    def test_auth_rate_limit_and_server_errors_preserve_snapshot(self) -> None:
        for code in (401, 403, 404, 429, 500):
            with self.subTest(status=code), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                snapshot_path = root / "public/data/snapshot.json"
                status_path = root / "public/data/status.json"
                snapshot_path.parent.mkdir(parents=True)
                original = {"schema_version": "1.0.0", "models": [{"id": "last-good"}], "index_versions": {"intelligence_api": "4.3"}}
                original_bytes = (json.dumps(original, indent=2) + "\n").encode()
                snapshot_path.write_bytes(original_bytes)

                def fail(_request, timeout=40, status=code):
                    raise urllib.error.HTTPError("https://artificialanalysis.ai/api", status, "fixture", {}, io.BytesIO(b""))

                outcome = update_data.run_update(root, {"AA_API_KEY": "fixture-key"}, fail)
                self.assertEqual(snapshot_path.read_bytes(), original_bytes)
                self.assertEqual(outcome["aa"]["http_status"], code)
                self.assertEqual(outcome["aa"]["status"], "stale")
                self.assertTrue(status_path.exists())

    def test_unchanged_success_refreshes_check_time_without_changing_data_time(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "public/data/snapshot.json"
            status_path = root / "public/data/status.json"
            raw_path = root / "public/data/aa-raw.json"
            snapshot_path.parent.mkdir(parents=True)
            first_fetch = "2026-10-16T20:00:00Z"
            latest_check = "2026-10-17T19:28:00Z"
            api_model = update_data.normalize_model(aa_model(), first_fetch, "4.3")
            existing_model = update_data.merge_model_sources([api_model], [], first_fetch)[0]
            snapshot_path.write_text(json.dumps({
                "schema_version": "1.0.0",
                "models": [existing_model],
                "index_versions": {"intelligence_api": "4.3", "intelligence_methodology": "v4.3.2"},
            }), encoding="utf-8")
            raw_path.write_text(json.dumps({"retrieved_at": first_fetch, "pages": []}), encoding="utf-8")
            previous_status = {
                "aa": {
                    "configured": True,
                    "status": "ready",
                    "checked_at": first_fetch,
                    "last_successful_snapshot_at": first_fetch,
                    "data_updated_at": "2026-10-17T18:00:00Z",
                    "stale_days": 0,
                    "models_count": 1,
                    "endpoint": update_data.ENDPOINT,
                    "message": "Artificial Analysis 免費 API 資料已成功更新。",
                }
            }
            status_path.write_text(json.dumps(previous_status), encoding="utf-8")

            with patch.object(update_data, "fetch_all_models", return_value=([api_model], "4.3", latest_check, [])):
                outcome = update_data.run_update(root, {"AA_API_KEY": "fixture-key"})

            self.assertEqual(outcome["aa"]["checked_at"], latest_check)
            self.assertEqual(outcome["aa"]["last_successful_snapshot_at"], latest_check)
            self.assertEqual(outcome["aa"]["data_updated_at"], first_fetch)
            self.assertEqual(json.loads(snapshot_path.read_text(encoding="utf-8"))["models"], [existing_model])

    def test_repeated_api_failure_refreshes_check_time_but_preserves_good_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "public/data/snapshot.json"
            status_path = root / "public/data/status.json"
            snapshot_path.parent.mkdir(parents=True)
            original = {"schema_version": "1.0.0", "models": [{"id": "last-good"}], "index_versions": {"intelligence_api": "4.3"}}
            original_bytes = (json.dumps(original, indent=2) + "\n").encode()
            snapshot_path.write_bytes(original_bytes)
            last_successful = "2026-10-16T20:00:00Z"
            status_path.write_text(json.dumps({
                "aa": {
                    "configured": True,
                    "status": "stale",
                    "checked_at": last_successful,
                    "last_successful_snapshot_at": last_successful,
                    "data_updated_at": last_successful,
                    "last_error": "Artificial Analysis API returned HTTP 403",
                    "http_status": 403,
                }
            }), encoding="utf-8")
            latest_check = "2026-10-17T19:28:00Z"

            def forbidden(_request, timeout=40):
                raise urllib.error.HTTPError("https://artificialanalysis.ai/api", 403, "forbidden", {}, io.BytesIO(b""))

            with patch.object(update_data, "now_iso", return_value=latest_check):
                outcome = update_data.run_update(root, {"AA_API_KEY": "fixture-key"}, forbidden)

            self.assertEqual(snapshot_path.read_bytes(), original_bytes)
            self.assertEqual(outcome["aa"]["checked_at"], latest_check)
            self.assertEqual(outcome["aa"]["last_successful_snapshot_at"], last_successful)
            self.assertEqual(outcome["aa"]["http_status"], 403)

    def test_api_404_keeps_last_good_model_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "public/data/snapshot.json"
            snapshot_path.parent.mkdir(parents=True)
            original = {"schema_version": "1.0.0", "models": [{"id": "last-good"}], "index_versions": {"intelligence_api": "4.3"}}
            original_bytes = (json.dumps(original, indent=2) + "\n").encode()
            snapshot_path.write_bytes(original_bytes)

            def missing_endpoint(_request, timeout=40):
                raise urllib.error.HTTPError("https://artificialanalysis.ai/api", 404, "not found", {}, io.BytesIO(b""))

            outcome = update_data.run_update(root, {"AA_API_KEY": "fixture-key"}, missing_endpoint)
            self.assertEqual(snapshot_path.read_bytes(), original_bytes)
            self.assertEqual(outcome["aa"]["http_status"], 404)
            self.assertEqual(outcome["aa"]["status"], "stale")
            self.assertIn("保留最後一次合法儲存的資料", outcome["aa"]["message"])

    def test_missing_key_preserves_snapshot_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "public/data/snapshot.json"
            status_path = root / "public/data/status.json"
            raw_path = root / "public/data/aa-raw.json"
            snapshot_path.parent.mkdir(parents=True)
            original = b'{"schema_version":"1.0.0","models":[]}\n'
            snapshot_path.write_bytes(original)
            raw_updated_at = "2026-10-16T14:08:58Z"
            raw_path.write_text(json.dumps({"retrieved_at": raw_updated_at, "pages": []}), encoding="utf-8")
            status_path.write_text(json.dumps({"aa": {
                "status": "ready",
                "checked_at": "2026-10-17T19:06:10Z",
                "last_successful_snapshot_at": "2026-10-17T19:06:10Z",
                "data_updated_at": "2026-10-17T19:06:10Z",
            }}), encoding="utf-8")

            def should_not_run(*_args, **_kwargs):
                self.fail("network opener should not run without an API key")

            result = update_data.run_update(root, {}, should_not_run)
            self.assertEqual(snapshot_path.read_bytes(), original)
            self.assertEqual(result["aa"]["status"], "disabled")
            self.assertEqual(result["aa"]["data_updated_at"], raw_updated_at)

    def test_coding_agent_import_rejects_nonfinite_numbers_and_untrusted_source(self) -> None:
        record = {
            "id": "official-codex-fixture",
            "agent": "Codex",
            "harness": "OpenAI Codex",
            "model": "Fixture Model",
            "reasoning_effort": "high",
            "coding_agent_index": 75.0,
            "scores": [{
                "benchmark_id": "deepswe",
                "score": 76.0,
                "unit": "official index score",
                "higher_is_better": True,
                "version": "v1.1",
                "updated_at": "2026-10-16",
                "method_url": "https://artificialanalysis.ai/methodology/coding-agents-benchmarking",
                "included_in_index": True,
                "cross_model_comparable": False,
                "source_kind": "official",
            }],
            "average_task_tokens": 30000,
            "input_tokens": 20000,
            "cached_tokens": 5000,
            "output_tokens": 5000,
            "average_task_seconds": 300.0,
            "cost_per_task_usd": 0.2,
            "cost_kind": "official",
            "benchmark_version": "v1.5",
            "source_url": "https://artificialanalysis.ai/agents/coding-agents",
            "source_updated_at": "2026-10-16",
            "note": "Official public fixture.",
        }
        template = {
            "schema_version": "1.0.0",
            "index_version": "v1.5",
            "checked_at": "2026-10-16",
            "region": "Global",
            "source_url": "https://artificialanalysis.ai/agents/coding-agents",
            "method_url": "https://artificialanalysis.ai/methodology/coding-agents-benchmarking",
            "evidence_kind": "official",
            "records": [record],
        }
        bad_number = copy.deepcopy(template)
        bad_number["records"][0]["cost_per_task_usd"] = float("nan")
        errors = import_coding_agents.validate_import(bad_number)
        self.assertTrue(errors, "NaN must not pass import validation")

        bad_source = copy.deepcopy(template)
        bad_source["records"][0]["source_url"] = "https://example.org/fake"
        self.assertTrue(import_coding_agents.validate_import(bad_source))

        missing_model = copy.deepcopy(template)
        missing_model["records"][0]["model"] = None
        self.assertTrue(import_coding_agents.validate_import(missing_model))

    def test_snapshot_validator_inspects_coding_agent_records(self) -> None:
        snapshot = json.loads((validate_data.ROOT / "public/data/snapshot.json").read_text(encoding="utf-8"))
        snapshot["coding_agents"] = [{"id": "bad", "coding_agent_index": float("inf")}]
        self.assertTrue(validate_data.validate(snapshot), "invalid coding-agent data must fail snapshot validation")


if __name__ == "__main__":
    unittest.main(verbosity=2)
