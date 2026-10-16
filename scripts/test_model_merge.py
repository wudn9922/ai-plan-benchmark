"""Regression coverage for merging Free API rows with reviewed public-page scores."""

import unittest

import update_data


class ModelMergeTests(unittest.TestCase):
    def test_api_refresh_preserves_public_benchmarks_and_sources(self):
        public = {
            "id": "shared-config",
            "name": "Model (High)",
            "data_origin": "aa_public_page",
            "source_kind": "official",
            "source_url": "https://artificialanalysis.ai/models/comparisons/model-high",
            "source_updated_at": None,
            "source_checked_at": "2026-10-16",
            "public_page_source_url": "https://artificialanalysis.ai/models/comparisons/model-high",
            "public_page_checked_at": "2026-10-16",
            "benchmarks": [{"benchmark_id": "terminal_bench", "score": 57, "unit": "%", "source_kind": "official"}],
        }
        api = {
            "id": "shared-config",
            "provider": "Provider",
            "name": "Model (High)",
            "version": None,
            "retired": False,
            "indices": {"intelligence": 53},
            "intelligence_cost_per_task_usd": 1.99,
            "intelligence_cost_model_id": "shared-config",
            "intelligence_cost_model_name": "Model (High)",
            "intelligence_cost_model_version": None,
            "intelligence_cost_reasoning": "unknown",
            "intelligence_cost_benchmark_version": "4.3",
            "api_pricing": {"input_per_million_usd": 1, "output_per_million_usd": 2},
            "performance": {"output_tokens_per_second": 10},
            "benchmarks": [],
            "source_url": "https://artificialanalysis.ai/data-api/docs/reference",
            "source_updated_at": None,
            "source_kind": "official",
            "data_origin": "aa_free_api",
        }

        merged = update_data.merge_model_sources([api], [public], "2026-10-17T00:00:00Z")
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["indices"]["intelligence"], 53)
        self.assertEqual(merged[0]["benchmarks"], public["benchmarks"])
        self.assertEqual(merged[0]["data_origin"], "aa_free_api+aa_public_page")
        self.assertEqual(merged[0]["public_page_source_url"], public["source_url"])
        self.assertEqual(merged[0]["public_page_checked_at"], "2026-10-16")

        next_day = update_data.merge_model_sources([api], merged, "2026-10-18T00:00:00Z")
        self.assertEqual(next_day[0]["source_updated_at"], "2026-10-17T00:00:00Z")
        self.assertEqual(next_day[0]["benchmarks"], public["benchmarks"])

    def test_unmatched_public_page_record_remains_in_snapshot(self):
        public = {"id": "page-only", "data_origin": "aa_public_page", "benchmarks": [{"score": 99}]}
        merged = update_data.merge_model_sources([], [public], "2026-10-17T00:00:00Z")
        self.assertEqual(merged, [public])


if __name__ == "__main__":
    unittest.main(verbosity=2)
