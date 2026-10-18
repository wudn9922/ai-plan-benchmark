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

        # Argon has separate Antigravity access and does not inherit the Gemini Apps mapping.
        self.assertEqual(app_models["Gemini 4 Argon"]["mapping"], "approximate")
        self.assertEqual(app_models["Gemini 4 Argon"]["reasoning_modes"], [])
        self.assertIn("Gemini 4 Argon (High)", antigravity_models)
        self.assertEqual(antigravity_models["Gemini 4 Argon (High)"]["mapping"], "unmapped")
        self.assertIn("不適用於 Antigravity IDE", antigravity_models["Gemini 4 Argon (High)"]["note"])
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
                        self.assertNotIn(phrase, model.get("note") or "")

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

    def test_google_plus_community_quota_is_quantified_and_kept_separate_from_official_limit(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        sources = {source["id"]: source for source in curated["sources"]}
        quotas = {quota["id"]: quota for quota in curated["quotas"]}
        plan = next(plan for plan in curated["plans"] if plan["id"] == "google-ai-plus")
        observation = quotas["google-plus-chat-community-4-prompts"]

        self.assertEqual(observation["category"], "chat")
        self.assertEqual((observation["value"], observation["unit"], observation["sample_size"]), (4, "則提示", 1))
        self.assertEqual(observation["confidence"], "low")
        self.assertEqual(observation["source_ids"], ["reddit-gemini-plus-4-prompts"])
        self.assertIn("歷史觀察", observation["note"])
        self.assertIn("現行 AI Plus 方案未列此模型", observation["note"])
        self.assertEqual(sources[observation["source_ids"][0]]["kind"], "community")
        self.assertIn(observation["id"], plan["quota_ids"])
        gemini = next(product for product in plan["products"] if product["product"] == "Gemini Apps")
        self.assertIn(observation["id"], gemini["quota_ids"])

    def test_xai_super_and_ultra_are_reference_plans_above_the_primary_price_cap(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        plans = {plan["id"]: plan for plan in curated["plans"]}
        for plan_id, price in (("xai-super", 100), ("xai-ultra", 200)):
            plan = plans[plan_id]
            self.assertEqual(plan["tier"], "reference")
            self.assertEqual(plan["monthly_price"], price)
            self.assertIsNone(plan["annual_billed_total"])
            self.assertEqual(plan["quota_ids"], [])
            self.assertIn("xai-pricing-web", plan["source_ids"])


    def test_jules_model_names_do_not_masquerade_as_reasoning_modes(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        for plan in curated["plans"]:
            for product in plan["products"]:
                if product["product"] == "Jules":
                    self.assertEqual(product["model_access"][0]["reasoning_modes"], [])

    def test_current_model_access_is_explicit_and_chat_agent_are_separate(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        plans = {plan["id"]: plan for plan in curated["plans"]}
        quotas = {quota["id"]: quota for quota in curated["quotas"]}
        for plan in curated["plans"]:
            serialized = json.dumps(plan, ensure_ascii=False)
            self.assertNotIn("依帳號當前", serialized)
            self.assertNotIn("依帳號介面", serialized)

        def product(plan_id: str, name: str) -> dict:
            return next(item for item in plans[plan_id]["products"] if item["product"] == name)

        self.assertFalse(product("openai-plus", "ChatGPT Agent mode")["included"])
        self.assertFalse(product("openai-free", "ChatGPT Agent mode")["included"])
        self.assertEqual(product("openai-free", "ChatGPT Agent mode")["rollout"], "discontinued")
        self.assertIn("取代", product("openai-plus", "ChatGPT Agent mode")["note"])
        self.assertEqual(product("openai-free", "ChatGPT")["model_access"][0]["model"], "GPT-6 Luna")
        self.assertEqual(product("openai-go", "ChatGPT")["model_access"][0]["model"], "GPT-6 Luna")
        self.assertNotIn("GPT-6 Astra", [item["model"] for item in product("openai-plus", "ChatGPT")["model_access"]])
        self.assertIn("GPT-6 Astra", [item["model"] for item in product("openai-plus", "ChatGPT Work")["model_access"]])
        self.assertIn("GPT-5.6 Terra", [item["model"] for item in product("openai-free", "ChatGPT Work")["model_access"]])
        self.assertFalse(product("openai-free", "Codex Cloud")["included"])
        self.assertNotIn("openai-plus-agent-mode-40", quotas)
        self.assertEqual(product("xai-premium", "Grok")["model_access"][0]["model"], "Grok 4.7")
        self.assertEqual(product("anthropic-free", "Claude Chat")["model_access"][0]["model"], "Claude Sonnet 5.5")

    def test_community_quota_samples_are_typed_separately_and_attached_to_plans(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        sources = {source["id"]: source for source in curated["sources"]}
        plans = {plan["id"]: plan for plan in curated["plans"]}
        quotas = {quota["id"]: quota for quota in curated["quotas"]}
        for quota_id in (
            "claude-free-chat-community", "claude-pro-chat-community", "claude-pro-code-community",
            "google-pro-chat-community", "google-plus-chat-community-4-prompts", "google-free-research-community", "openai-plus-codex-community",
            "openai-plus-work-community-37pct-2026-09-27", "openai-codex-gpt61-community-40min-2026-10-17",
        ):
            quota = quotas[quota_id]
            self.assertEqual(sources[quota["source_ids"][0]]["kind"], "community")
            self.assertIn(quota_id, plans[quota["plan_id"]]["quota_ids"])
            if quota["value_type"] == "range":
                self.assertIsNotNone(quota["estimate_range"]["sample_size"])
            else:
                self.assertEqual(quota["sample_size"], 1)
        self.assertEqual(quotas["openai-plus-work-community-37pct-2026-09-27"]["category"], "agent")
        self.assertEqual(quotas["openai-plus-work-community-37pct-2026-09-27"]["value"], 37)
        self.assertEqual(quotas["openai-plus-work-community-37pct-2026-09-27"]["sample_size"], 1)
        self.assertEqual(quotas["openai-codex-gpt61-community-40min-2026-10-17"]["category"], "coding_agent")
        self.assertEqual(quotas["oa-free-chat"]["value_type"], "unlimited")
        self.assertEqual(quotas["oa-go-chat"]["value_type"], "unlimited")
        self.assertEqual(quotas["openai-plus-codex-community"]["category"], "coding_agent")
        self.assertEqual(quotas["openai-plus-codex-community"]["sampled_at"], "2026-09-22")
        self.assertEqual(quotas["openai-plus-codex-community"]["product"], "Codex（執行環境未明）")
        plus_codex_local = next(item for item in plans["openai-plus"]["products"] if item["product"] == "Codex Local")
        self.assertNotIn("openai-plus-codex-community", plus_codex_local["quota_ids"])
        self.assertNotIn("歷史觀察", quotas["openai-plus-codex-community"]["note"])

    def test_new_community_quota_observations_match_current_plan_and_product(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        sources = {source["id"]: source for source in curated["sources"]}
        plans = {plan["id"]: plan for plan in curated["plans"]}
        quotas = {quota["id"]: quota for quota in curated["quotas"]}

        expected = {
            "openai-plus-chat-community-1-2-prompts-2026-09-18": ("openai-plus", "chat", "ChatGPT", "range"),
            "google-ai-pro-flash-community-4-6pct-2026-10-18": ("google-ai-pro", "chat", "Gemini Apps", "range"),
            "xai-premium-agent-community-100pct-2026-10-15": ("xai-premium", "agent", "Grok Bot / 雲端電腦", "exact"),
            "claude-pro-code-20min-community-2026-10-11": ("anthropic-pro", "coding_agent", "Claude Code", "exact"),
            "claude-pro-code-weekly-23pct-community-2026-10-14": ("anthropic-pro", "coding_agent", "Claude Code", "exact"),
            "google-pro-antigravity-weekly-46pct-community-2026-10-05": ("google-ai-pro", "coding_agent", "Antigravity Desktop", "exact"),
        }
        for quota_id, (plan_id, category, product_name, value_type) in expected.items():
            quota = quotas[quota_id]
            self.assertEqual((quota["plan_id"], quota["category"], quota["product"], quota["value_type"]), (plan_id, category, product_name, value_type))
            self.assertEqual(quota["confidence"], "low")
            self.assertEqual(quota["sample_size"], 1)
            self.assertEqual(len(quota["source_ids"]), 1)
            self.assertEqual(sources[quota["source_ids"][0]]["kind"], "community")
            self.assertIn(quota_id, plans[plan_id]["quota_ids"])
            linked_product = next(item for item in plans[plan_id]["products"] if item["product"] == product_name)
            self.assertTrue(linked_product["included"])
            self.assertIn(quota_id, linked_product["quota_ids"])

        self.assertEqual(quotas["xai-premium-agent-community-100pct-2026-10-15"]["value"], 100)
        self.assertNotIn("xai-premium-chat-community-33-messages-17pct-2026-07-04", quotas)
        self.assertIn("前後不一致", quotas["claude-pro-code-weekly-23pct-community-2026-10-14"]["note"])

        for quota_id in (
            "openai-plus-codex-11min-community-2026-10-09",
            "openai-plus-codex-weekly-18pct-community-2026-10-09",
        ):
            quota = quotas[quota_id]
            self.assertEqual((quota["plan_id"], quota["category"], quota["product"], quota["confidence"]), ("openai-plus", "coding_agent", "Codex（執行環境未明）", "low"))
            self.assertEqual(quota["sample_size"], 1)
            self.assertIn(quota_id, plans["openai-plus"]["quota_ids"])
            self.assertFalse(any(quota_id in item["quota_ids"] for item in plans["openai-plus"]["products"]))
            self.assertEqual(sources[quota["source_ids"][0]]["kind"], "community")
            self.assertEqual(quota["sampled_at"], "2026-10-08")

    def test_ambiguous_chatgpt_community_report_is_not_misclassified_as_chat_or_agent_quota(self) -> None:
        root = Path(__file__).resolve().parents[1]
        curated = json.loads((root / "data/curated.json").read_text(encoding="utf-8"))
        sources = {source["id"]: source for source in curated["sources"]}
        quotas = curated["quotas"]
        source_id = "reddit-openai-plus-5h-weekly-usage-2026-10-13"

        self.assertEqual(sources[source_id]["kind"], "community")
        self.assertIn("n=2", sources[source_id]["notes"])
        self.assertIn("無法判定為 Chat、Work 或 Codex", sources[source_id]["notes"])
        self.assertFalse(any(source_id in quota["source_ids"] for quota in quotas))
        historical = next(q for q in quotas if q["id"] == "openai-plus-chat-community-1-2-prompts-2026-09-18")
        self.assertIn("歷史觀察", historical["note"])
        self.assertIn("不列入現行精簡表", historical["note"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
