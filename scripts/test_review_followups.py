#!/usr/bin/env python3
"""Regression checks for Coding Agent provider/version and benchmark comparability reviews."""

from __future__ import annotations

import copy
import json
import unittest

import import_coding_agents
import validate_data


class ReviewFollowupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.snapshot = json.loads((validate_data.ROOT / "public/data/snapshot.json").read_text(encoding="utf-8"))
        cls.import_data = json.loads((validate_data.ROOT / "public/data/imports/coding-agents-v1.5-2026-10-17.json").read_text(encoding="utf-8"))

    def test_coding_agent_import_requires_record_version_to_match_index_version(self) -> None:
        mismatched = copy.deepcopy(self.import_data)
        mismatched["records"][0]["benchmark_version"] = "v1.4"
        errors = import_coding_agents.validate_import(mismatched)
        self.assertTrue(any("must match import index_version" in error for error in errors))

    def test_snapshot_rejects_cross_model_claim_without_version_or_established_unit(self) -> None:
        no_version = copy.deepcopy(self.snapshot)
        no_version["models"][0]["benchmarks"].append({
            "benchmark_id": "fixture_unversioned",
            "score": 75.0,
            "unit": "completion rate %",
            "version": None,
            "updated_at": None,
            "method_url": "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
            "higher_is_better": True,
            "included_in_index": True,
            "cross_model_comparable": True,
            "source_kind": "official",
        })
        self.assertTrue(any("established version and unit" in error for error in validate_data.validate(no_version)))

        unclear_unit = copy.deepcopy(self.snapshot)
        unclear_unit["models"][0]["benchmarks"].append({
            "benchmark_id": "fixture_unclear_unit",
            "score": 75.0,
            "unit": "unit not established",
            "version": "v1",
            "updated_at": None,
            "method_url": "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
            "higher_is_better": True,
            "included_in_index": True,
            "cross_model_comparable": True,
            "source_kind": "official",
        })
        self.assertTrue(any("established version and unit" in error for error in validate_data.validate(unclear_unit)))

    def test_snapshot_requires_supported_provider_for_coding_agents(self) -> None:
        invalid_provider = copy.deepcopy(self.snapshot)
        invalid_provider["coding_agents"][0]["provider"] = "unknown-provider"
        self.assertTrue(any("provider must be one of" in error for error in validate_data.validate(invalid_provider)))

    def test_legacy_import_records_infer_provider_only_from_recognized_harness(self) -> None:
        record = {"agent": "Codex", "harness": "OpenAI Codex", "model": "GPT test"}
        self.assertEqual(import_coding_agents.infer_provider(record), "openai")
        self.assertIsNone(import_coding_agents.infer_provider({"agent": "Unknown", "harness": "Unknown"}))

    def test_import_schema_covers_current_provider_aware_records(self) -> None:
        schema = json.loads((validate_data.ROOT / "schemas/coding-agent-import.schema.json").read_text(encoding="utf-8"))
        record_schema = schema["properties"]["records"]["items"]
        properties = record_schema["properties"]
        required = record_schema["required"]
        providers = properties["provider"]["enum"]
        self.assertFalse(record_schema["additionalProperties"])
        self.assertNotIn("provider", required, "provider remains optional for recognized legacy imports")
        self.assertIn("cache_hit_percent", properties)
        self.assertIn("source_checked_at", properties)
        for record in self.import_data["records"]:
            self.assertFalse(set(record) - set(properties), "schema must define every checked-in import property")
            self.assertIn(record["provider"], providers)


if __name__ == "__main__":
    unittest.main(verbosity=2)
