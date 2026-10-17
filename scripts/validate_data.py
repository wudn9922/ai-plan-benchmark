#!/usr/bin/env python3
"""Validate the public snapshot and reject ambiguous or misleading values."""

from __future__ import annotations

import json
import math
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
INDEXES = {
    "intelligence", "coding", "agentic", "finance_accounting", "strategy_ops",
    "legal", "healthcare_medical", "engineering", "economics",
}
QUOTA_CATEGORIES = {"chat", "agent", "coding_agent"}
CONFIDENCES = {"high", "medium", "low", "unknown"}
EVIDENCE = {"official", "community", "measured", "estimate"}
PROVIDERS = {"openai", "anthropic", "google", "xai", "other"}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def is_official_aa_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme == "https" and parsed.hostname == "artificialanalysis.ai"


def valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        import datetime as dt
        dt.date.fromisoformat(value[:10])
        return True
    except ValueError:
        return False


def established_benchmark_scale(score: dict[str, Any]) -> bool:
    version = score.get("version")
    unit = score.get("unit")
    if not isinstance(version, str) or not version.strip() or not isinstance(unit, str) or not unit.strip():
        return False
    ambiguous = re.compile(r"not\s+(?:shown|published|established|labeled|stated)|unknown|unpublished|未公布|未知|未標示", re.IGNORECASE)
    return not ambiguous.search(version) and not ambiguous.search(unit)


def reject_json_constant(value: str) -> None:
    raise ValueError(f"Invalid JSON numeric constant: {value}")


def validate(snapshot: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("schema_version", "region", "currency", "as_of", "sources", "plans", "quotas", "models", "coding_agents", "benchmark_catalog", "index_methodology"):
        if key not in snapshot:
            fail(errors, f"Missing top-level field: {key}")

    sources = snapshot.get("sources", [])
    if not isinstance(sources, list):
        fail(errors, "sources must be an array")
        sources = []
    source_ids: set[str] = set()
    for i, source in enumerate(sources):
        if not isinstance(source, dict):
            fail(errors, f"sources[{i}] must be an object")
            continue
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id:
            fail(errors, f"sources[{i}] must have id")
        elif source_id in source_ids:
            fail(errors, f"Duplicate source id: {source_id}")
        else:
            source_ids.add(source_id)
        url = source.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            fail(errors, f"source {source_id!r} must have an HTTPS URL")
        if not source.get("checked_at"):
            fail(errors, f"source {source_id!r} must have checked_at")
        if source.get("kind") not in EVIDENCE:
            fail(errors, f"source {source_id!r} has unsupported evidence kind")

    quotas = snapshot.get("quotas", [])
    if not isinstance(quotas, list):
        fail(errors, "quotas must be an array")
        quotas = []
    quota_ids: set[str] = set()
    for i, quota in enumerate(quotas):
        label = f"quotas[{i}]"
        if not isinstance(quota, dict):
            fail(errors, f"{label} must be an object")
            continue
        quota_id = quota.get("id")
        if not isinstance(quota_id, str) or not quota_id:
            fail(errors, f"{label} must have id")
        elif quota_id in quota_ids:
            fail(errors, f"Duplicate quota id: {quota_id}")
        else:
            quota_ids.add(quota_id)
        if quota.get("category") not in QUOTA_CATEGORIES:
            fail(errors, f"{label} has invalid category; keep Chat, Agent, and Coding Agent separate")
        if not isinstance(quota.get("sampled_at"), str) or not quota.get("sampled_at"):
            fail(errors, f"{label} must have sampled_at")
        if not isinstance(quota.get("region"), str) or not quota.get("region"):
            fail(errors, f"{label} must have a region")
        if not isinstance(quota.get("window"), str) or not quota.get("window"):
            fail(errors, f"{label} must state its usage window or say it varies")
        if not isinstance(quota.get("unit"), str) or not quota.get("unit"):
            fail(errors, f"{label} must have a unit")
        if quota.get("confidence") not in CONFIDENCES:
            fail(errors, f"{label} must state confidence")
        if not isinstance(quota.get("note"), str) or not quota.get("note"):
            fail(errors, f"{label} must disclose limitations")
        value = quota.get("value")
        value_type = quota.get("value_type")
        if value is not None and not is_number(value):
            fail(errors, f"{label}.value must be a finite number or null")
        if value_type == "exact" and value is None:
            fail(errors, f"{label} is marked exact but its value is missing")
        if value_type == "range":
            bounds = quota.get("estimate_range")
            if value is not None or not isinstance(bounds, dict):
                fail(errors, f"{label} range must use null value and estimate_range bounds")
            elif not is_number(bounds.get("min")) or not is_number(bounds.get("max")) or bounds["min"] > bounds["max"]:
                fail(errors, f"{label} has invalid estimate bounds")
            elif not bounds.get("workload"):
                fail(errors, f"{label} estimate must describe its workload")
        elif value_type not in {"exact", "variable", "not_published"}:
            fail(errors, f"{label} has invalid value_type")
        for source_id in quota.get("source_ids", []):
            if source_id not in source_ids:
                fail(errors, f"{label} references missing source {source_id}")

    plans = snapshot.get("plans", [])
    if not isinstance(plans, list):
        fail(errors, "plans must be an array")
        plans = []
    plan_ids: set[str] = set()
    for i, plan in enumerate(plans):
        label = f"plans[{i}]"
        if not isinstance(plan, dict):
            fail(errors, f"{label} must be an object")
            continue
        plan_id = plan.get("id")
        if not isinstance(plan_id, str) or not plan_id:
            fail(errors, f"{label} must have id")
        elif plan_id in plan_ids:
            fail(errors, f"Duplicate plan id: {plan_id}")
        else:
            plan_ids.add(plan_id)
        if not isinstance(plan.get("currency"), str) or not plan.get("currency"):
            fail(errors, f"{label} must include a currency")
        for price_field in ("monthly_price", "annual_monthly_price", "annual_billed_total"):
            price = plan.get(price_field)
            if price is not None and (not is_number(price) or price < 0):
                fail(errors, f"{label}.{price_field} must be a non-negative number or null")
        if plan.get("tax") not in {"included", "extra", "varies", "unknown"}:
            fail(errors, f"{label} must state tax handling")
        if not plan.get("checked_at") or not plan.get("region"):
            fail(errors, f"{label} must include verification date and region")
        for source_id in plan.get("source_ids", []):
            if source_id not in source_ids:
                fail(errors, f"{label} references missing source {source_id}")
        for quota_id in plan.get("quota_ids", []):
            if quota_id not in quota_ids:
                fail(errors, f"{label} references missing quota {quota_id}")
        products = plan.get("products", [])
        if not isinstance(products, list):
            fail(errors, f"{label}.products must be an array")
            continue
        for product in products:
            if not isinstance(product, dict):
                fail(errors, f"{label} product entry must be an object")
                continue
            if product.get("included") not in {True, False, None}:
                fail(errors, f"{label} product must explicitly map included true/false/unknown")
            for source_id in product.get("source_ids", []):
                if source_id not in source_ids:
                    fail(errors, f"{label} product references missing source {source_id}")
            for quota_id in product.get("quota_ids", []):
                if quota_id not in quota_ids:
                    fail(errors, f"{label} product references missing quota {quota_id}")

    models = snapshot.get("models", [])
    if not isinstance(models, list):
        fail(errors, "models must be an array")
        models = []
    model_ids: set[str] = set()
    for i, model in enumerate(models):
        label = f"models[{i}]"
        if not isinstance(model, dict):
            fail(errors, f"{label} must be an object")
            continue
        model_id = model.get("id")
        if not isinstance(model_id, str) or not model_id:
            fail(errors, f"{label} must have id")
        elif model_id in model_ids:
            fail(errors, f"Duplicate model id {model_id}")
        else:
            model_ids.add(model_id)
        indices = model.get("indices", {})
        if set(indices) != INDEXES:
            fail(errors, f"{label} must include all 9 index keys; use null for missing scores")
        else:
            for name, score in indices.items():
                if score is not None and not is_number(score):
                    fail(errors, f"{label}.indices.{name} must be a number or null")
        cost = model.get("intelligence_cost_per_task_usd")
        if cost is not None and (not is_number(cost) or cost < 0):
            fail(errors, f"{label} API cost per task must be non-negative USD or null")
        if model.get("source_kind") not in EVIDENCE:
            fail(errors, f"{label} must state source kind")
        if not is_official_aa_url(model.get("source_url")):
            fail(errors, f"{label}.source_url must use the official Artificial Analysis HTTPS host")
        if model.get("data_origin") not in {None, "aa_free_api", "aa_public_page", "aa_free_api+aa_public_page"}:
            fail(errors, f"{label}.data_origin has an unsupported value")
        if model.get("public_page_source_url") is not None and not is_official_aa_url(model.get("public_page_source_url")):
            fail(errors, f"{label}.public_page_source_url must use the official Artificial Analysis HTTPS host")
        if model.get("public_page_checked_at") is not None and not valid_date(model.get("public_page_checked_at")):
            fail(errors, f"{label}.public_page_checked_at must be a date")
        if model.get("source_updated_at") is not None and not valid_date(model.get("source_updated_at")):
            fail(errors, f"{label}.source_updated_at must be a date or null when not published")
        if model.get("source_checked_at") is not None and not valid_date(model.get("source_checked_at")):
            fail(errors, f"{label}.source_checked_at must be a date")
        for group in ("api_pricing", "performance"):
            values = model.get(group)
            if not isinstance(values, dict):
                fail(errors, f"{label}.{group} must be an object")
                continue
            for field, value in values.items():
                if value is not None and (not is_number(value) or value < 0):
                    fail(errors, f"{label}.{group}.{field} must be a finite non-negative number or null")
        benchmarks = model.get("benchmarks")
        if not isinstance(benchmarks, list):
            fail(errors, f"{label}.benchmarks must be an array")
            continue
        for j, score in enumerate(benchmarks):
            score_label = f"{label}.benchmarks[{j}]"
            if not isinstance(score, dict):
                fail(errors, f"{score_label} must be an object")
                continue
            for field in ("benchmark_id", "unit", "method_url", "source_kind"):
                if not isinstance(score.get(field), str) or not score[field].strip():
                    fail(errors, f"{score_label}.{field} must be a non-empty string")
            if score.get("score") is not None and not (is_number(score.get("score")) or isinstance(score.get("score"), str) and score["score"].strip()):
                fail(errors, f"{score_label}.score must be finite numeric, descriptive text, or null")
            if score.get("version") is not None and not isinstance(score.get("version"), str):
                fail(errors, f"{score_label}.version must be a string or null")
            if score.get("updated_at") is not None and not valid_date(score.get("updated_at")):
                fail(errors, f"{score_label}.updated_at must be a date or null")
            if score.get("source_kind") not in EVIDENCE:
                fail(errors, f"{score_label}.source_kind has unsupported evidence kind")
            if not is_official_aa_url(score.get("method_url")):
                fail(errors, f"{score_label}.method_url must use the official Artificial Analysis HTTPS host")
            for bool_field in ("higher_is_better", "included_in_index", "cross_model_comparable"):
                if score.get(bool_field) not in {True, False, None}:
                    fail(errors, f"{score_label}.{bool_field} must be true, false, or null")
            if score.get("cross_model_comparable") is True and not established_benchmark_scale(score):
                fail(errors, f"{score_label} cannot claim cross-model comparability without an established version and unit")

    coding_agents = snapshot.get("coding_agents", [])
    if not isinstance(coding_agents, list):
        fail(errors, "coding_agents must be an array")
        coding_agents = []
    coding_ids: set[str] = set()
    coding_numeric_fields = ("coding_agent_index", "average_task_tokens", "input_tokens", "cached_tokens", "output_tokens", "average_task_seconds", "cost_per_task_usd", "cache_hit_percent")
    for i, agent in enumerate(coding_agents):
        label = f"coding_agents[{i}]"
        if not isinstance(agent, dict):
            fail(errors, f"{label} must be an object")
            continue
        if not isinstance(agent.get("provider"), str) or agent.get("provider") not in PROVIDERS:
            fail(errors, f"{label}.provider must be one of {', '.join(sorted(PROVIDERS))}")
        agent_id = agent.get("id")
        if not isinstance(agent_id, str) or not agent_id:
            fail(errors, f"{label}.id must be a non-empty string")
        elif agent_id in coding_ids:
            fail(errors, f"Duplicate coding-agent id {agent_id}")
        else:
            coding_ids.add(agent_id)
        for field in ("agent", "harness", "model", "reasoning_effort", "benchmark_version", "note"):
            if not isinstance(agent.get(field), str) or not agent[field].strip():
                fail(errors, f"{label}.{field} must be a non-empty string; use 'unknown' when unpublished")
        if "source_updated_at" not in agent:
            fail(errors, f"{label}.source_updated_at must be present; use null when the page does not publish an update date")
        if not re.fullmatch(r"v\d+\.\d+", str(agent.get("benchmark_version", ""))):
            fail(errors, f"{label}.benchmark_version must be vMAJOR.MINOR")
        if not is_official_aa_url(agent.get("source_url")):
            fail(errors, f"{label}.source_url must use the official Artificial Analysis HTTPS host")
        if agent.get("source_updated_at") is not None and not valid_date(agent.get("source_updated_at")):
            fail(errors, f"{label}.source_updated_at must be a date/timestamp or null when unpublished")
        if agent.get("source_checked_at") is not None and not valid_date(agent.get("source_checked_at")):
            fail(errors, f"{label}.source_checked_at must be a date or timestamp")
        if agent.get("source_updated_at") is None and not valid_date(agent.get("source_checked_at")):
            fail(errors, f"{label} needs source_checked_at when the source update date is unpublished")
        for field in coding_numeric_fields:
            value = agent.get(field)
            if value is not None and (not is_number(value) or value < 0):
                fail(errors, f"{label}.{field} must be a finite non-negative number or null")
        index_score = agent.get("coding_agent_index")
        if index_score is not None and is_number(index_score) and index_score > 100:
            fail(errors, f"{label}.coding_agent_index must be between 0 and 100")
        cache_hit = agent.get("cache_hit_percent")
        if cache_hit is not None and is_number(cache_hit) and cache_hit > 100:
            fail(errors, f"{label}.cache_hit_percent must be between 0 and 100")
        cost_kind = agent.get("cost_kind")
        if cost_kind not in EVIDENCE and not (cost_kind is None and agent.get("cost_per_task_usd") is None):
            fail(errors, f"{label}.cost_kind must identify evidence for each cost")
        if agent.get("cost_per_task_usd") is not None and agent.get("cost_kind") not in EVIDENCE:
            fail(errors, f"{label} cost requires a supported cost_kind")
        scores = agent.get("scores")
        if not isinstance(scores, list):
            fail(errors, f"{label}.scores must be an array")
            continue
        for j, score in enumerate(scores):
            score_label = f"{label}.scores[{j}]"
            if not isinstance(score, dict):
                fail(errors, f"{score_label} must be an object")
                continue
            for field in ("benchmark_id", "unit", "version", "method_url", "source_kind"):
                if not isinstance(score.get(field), str) or not score[field].strip():
                    fail(errors, f"{score_label}.{field} must be a non-empty string")
            if score.get("score") is not None and not is_number(score.get("score")):
                fail(errors, f"{score_label}.score must be a finite number or null")
            if isinstance(score.get("unit"), str) and "%" in score["unit"] and is_number(score.get("score")) and not 0 <= score["score"] <= 100:
                fail(errors, f"{score_label} percentage score must be between 0 and 100")
            if score.get("source_kind") not in EVIDENCE:
                fail(errors, f"{score_label}.source_kind has unsupported evidence kind")
            if not is_official_aa_url(score.get("method_url")):
                fail(errors, f"{score_label}.method_url must use the official Artificial Analysis HTTPS host")
            if score.get("cross_model_comparable") is True and not established_benchmark_scale(score):
                fail(errors, f"{score_label} cannot claim cross-model comparability without an established version and unit")

    catalog = snapshot.get("benchmark_catalog", [])
    if not isinstance(catalog, list) or not catalog:
        fail(errors, "benchmark_catalog must have methodology definitions")
        catalog = []
    benchmark_ids: set[str] = set()
    weights: dict[str, float] = {}
    for i, definition in enumerate(catalog):
        label = f"benchmark_catalog[{i}]"
        if not isinstance(definition, dict):
            fail(errors, f"{label} must be an object")
            continue
        benchmark_id = definition.get("id")
        if benchmark_id in benchmark_ids:
            fail(errors, f"Duplicate benchmark id {benchmark_id}")
        benchmark_ids.add(benchmark_id)
        for field in ("name_zh", "what_it_tests", "metric_unit", "protocol", "method_url", "comparability_note", "index_version"):
            if not definition.get(field):
                fail(errors, f"{label} must include {field}")
        if definition.get("updated_at") is not None and not valid_date(definition.get("updated_at")):
            fail(errors, f"{label}.updated_at must be a published date or null when the source does not state it")
        if not valid_date(definition.get("source_checked_at")):
            fail(errors, f"{label}.source_checked_at must record the source review date")
        if definition.get("actual_score") is not None:
            fail(errors, f"{label} template actual_score must stay null until a sourced model result is imported")
        weight = definition.get("index_weight_percent")
        if weight is not None:
            if not is_number(weight) or weight < 0 or weight > 100:
                fail(errors, f"{label} has invalid index weight")
            else:
                group = definition.get("index_id")
                weights[group] = weights.get(group, 0) + float(weight)
    for group in ("intelligence", "coding_agent"):
        if group in weights and not math.isclose(weights[group], 100, abs_tol=0.01):
            fail(errors, f"{group} benchmark weights must total 100%, got {weights[group]:.4f}%")

    methodology = snapshot.get("index_methodology", {})
    category_weights = methodology.get("intelligence_category_weights", {}) if isinstance(methodology, dict) else {}
    if category_weights and not math.isclose(sum(category_weights.values()), 100, abs_tol=0.01):
        fail(errors, "Intelligence category weights must total 100%")
    return errors


def main() -> int:
    try:
        snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Invalid snapshot JSON: {exc}", file=sys.stderr)
        return 1
    if not isinstance(snapshot, dict):
        print("snapshot.json must contain an object", file=sys.stderr)
        return 1
    errors = validate(snapshot)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Validated {len(snapshot['plans'])} plans, {len(snapshot['quotas'])} quota observations, {len(snapshot['models'])} models and {len(snapshot['benchmark_catalog'])} benchmark definitions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
