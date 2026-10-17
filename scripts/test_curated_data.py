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

    def test_google_jules_and_antigravity_limits_are_separate_and_typed(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        plans = {plan["id"]: plan for plan in curated["plans"]}
        quotas = {quota["id"]: quota for quota in curated["quotas"]}

        for plan_id, daily_limit, concurrency_limit in (
            ("google-ai-free", 15, 3),
            ("google-ai-plus", 15, 3),
            ("google-ai-pro", 100, 15),
        ):
            plan = plans[plan_id]
            jules = next(product for product in plan["products"] if product["product"] == "Jules")
            self.assertEqual(jules["model_access"][0]["reasoning_modes"], [])
            self.assertIn("google-free" if "free" in plan_id else "google-plus" if "plus" in plan_id else "google-pro", jules["quota_ids"][0])
            task_quota, concurrency_quota = (quotas[quota_id] for quota_id in jules["quota_ids"])
            self.assertEqual((task_quota["value"], task_quota["window"]), (daily_limit, "滾動 24 小時"))
            self.assertEqual((concurrency_quota["value"], concurrency_quota["metric"]), (concurrency_limit, "同時執行上限"))
            self.assertEqual(task_quota["category"], "coding_agent")
            self.assertEqual(concurrency_quota["category"], "coding_agent")

        for plan_id, quota_id in (
            ("google-ai-free", "google-free-antigravity"),
            ("google-ai-plus", "google-plus-antigravity"),
        ):
            quota = quotas[quota_id]
            self.assertIsNone(quota["value"])
            self.assertEqual(quota["value_type"], "variable")
            self.assertIn("每週", quota["window"])
            self.assertEqual(quota["category"], "coding_agent")
            antigravity = next(product for product in plans[plan_id]["products"] if product["product"] == "Antigravity Desktop")
            self.assertIn(quota_id, antigravity["quota_ids"])

        pro_quota = quotas["google-pro-antigravity"]
        self.assertIsNone(pro_quota["value"])
        self.assertEqual(pro_quota["value_type"], "variable")
        self.assertIn("5 小時", pro_quota["window"])
        self.assertIn("每週", pro_quota["window"])

    def test_google_flow_credits_are_not_chat_or_agent_task_quotas(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        for plan in curated["plans"]:
            if not plan["id"].startswith("google-ai-"):
                continue
            products = {product["product"]: product for product in plan["products"]}
            flow = products["Google Flow"]
            self.assertEqual(flow["quota_ids"], [])
            if plan["id"] == "google-ai-free":
                self.assertIn("有限使用", flow["note"])
            else:
                self.assertIn("Flow Credits", flow["note"])
            gemini = products["Gemini Apps"]
            self.assertNotIn("Gemini Omni Flash", [model["model"] for model in gemini["model_access"]])

    def test_google_antigravity_model_mapping_is_scoped_to_its_own_surface(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        plans = {plan["id"]: plan for plan in curated["plans"]}
        pro = {product["product"]: product for product in plans["google-ai-pro"]["products"]}
        app_models = {item["model"]: item for item in pro["Gemini Apps"]["model_access"]}
        antigravity = pro["Antigravity Desktop"]
        antigravity_models = {item["model"]: item for item in antigravity["model_access"]}

        # Argon access in Gemini Apps does not establish access in Antigravity IDE.
        self.assertEqual(app_models["Gemini 4 Argon"]["mapping"], "approximate")
        self.assertEqual(app_models["Gemini 4 Argon"]["reasoning_modes"], [])
        self.assertNotIn("Gemini 4 Argon (High)", antigravity_models)
        self.assertIn("不代表 Antigravity IDE 可用", antigravity["note"])
        self.assertEqual(antigravity_models["Gemini 3.8 Flash (Medium)"]["mapping"], "exact")

        english_phrases = (
            "Official Antigravity", "AA free API", "AA publishes", "Paid Google AI Pro", "This exact model score",
        )
        for plan in plans.values():
            if plan["id"] not in {"google-ai-free", "google-ai-plus", "google-ai-pro"}:
                continue
            for product in plan["products"]:
                if product["product"] != "Antigravity Desktop":
                    continue
                for model in product["model_access"]:
                    for phrase in english_phrases:
                        self.assertNotIn(phrase, model["note"])

    def test_google_flow_sources_and_monthly_credits_are_explicit(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        for plan_id, credits in (("google-ai-plus", 200), ("google-ai-pro", 1000)):
            plan = next(plan for plan in curated["plans"] if plan["id"] == plan_id)
            flow = next(product for product in plan["products"] if product["product"] == "Google Flow")
            self.assertIn("google-plans", flow["source_ids"])
            self.assertIn(f"每月 {credits:,}", flow["note"])
            self.assertEqual(flow["quota_ids"], [])
            self.assertIn("創作工作室點數", flow["note"])

    def test_google_plans_do_not_retain_unlinked_legacy_agent_quotas(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        obsolete_ids = {"google-free-agent", "google-plus-agent", "google-pro-agent"}
        self.assertFalse(obsolete_ids.intersection(quota["id"] for quota in curated["quotas"]))
        for plan in curated["plans"]:
            if plan["id"] not in {"google-ai-free", "google-ai-plus", "google-ai-pro"}:
                continue
            self.assertFalse(obsolete_ids.intersection(plan["quota_ids"]))
            for product in plan["products"]:
                self.assertFalse(obsolete_ids.intersection(product.get("quota_ids", [])))


    def test_jules_model_names_do_not_masquerade_as_reasoning_modes(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        for plan in curated["plans"]:
            for product in plan["products"]:
                if product["product"] == "Jules":
                    self.assertEqual(product["model_access"][0]["reasoning_modes"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
