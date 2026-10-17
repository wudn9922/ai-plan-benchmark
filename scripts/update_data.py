#!/usr/bin/env python3
"""Fetch and validate the authorized Artificial Analysis free API snapshot.

Only the official free language-model endpoint is used. API credentials are read
from AA_API_KEY and never written into generated files. Failed fetches preserve
the last verified model snapshot and update only status.json.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / "public" / "data" / "snapshot.json"
STATUS_PATH = ROOT / "public" / "data" / "status.json"
CACHE_PATH = ROOT / "scripts" / ".cache" / "aa-free-response.json"
ENDPOINT = "https://artificialanalysis.ai/api/v2/language/models/free"
MAX_PAGES = 500

INDEX_ALIASES: dict[str, set[str]] = {
    "intelligence": {"intelligence", "intelligenceindex", "artificialanalysisintelligenceindex", "aaintelligenceindex"},
    "coding": {"coding", "codingindex", "artificialanalysiscodingindex", "aacodingindex"},
    "agentic": {"agentic", "agenticindex", "artificialanalysisagenticindex", "aaagenticindex"},
    "finance_accounting": {"financeaccounting", "financeaccountingindex", "financeandaccountingindex", "artificialanalysisfinanceandaccountingindex"},
    "strategy_ops": {"strategyops", "strategyopsindex", "businessstrategyoperationsindex", "strategyandoperationsindex", "artificialanalysisstrategyandopsindex"},
    "legal": {"legal", "legalindex", "artificialanalysislegalindex"},
    "healthcare_medical": {"healthcaremedical", "healthcaremedicalindex", "healthcareindex", "medicalindex", "artificialanalysishealthcareandmedicalindex"},
    "engineering": {"engineering", "engineeringindex", "artificialanalysisengineeringindex"},
    "economics": {"economics", "economicsindex", "artificialanalysiseconomicsindex"},
}


class ApiError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def reject_json_constant(value: str) -> None:
    raise ValueError(f"Invalid JSON numeric constant: {value}")


def normalize_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value)
            return parsed if math.isfinite(parsed) else None
        except ValueError:
            return None
    return None


def _index_from_named_value(name: Any, item: Any) -> tuple[str, float] | None:
    if not isinstance(name, str):
        return None
    norm_name = normalize_key(name)
    target = next((idx for idx, aliases in INDEX_ALIASES.items() if norm_name in aliases), None)
    if target is None:
        return None
    if isinstance(item, dict):
        for key in ("score", "value", "index", "result"):
            if key in item:
                value = as_number(item[key])
                if value is not None:
                    return target, value
        return None
    value = as_number(item)
    return (target, value) if value is not None else None


def extract_indices(model: dict[str, Any]) -> dict[str, float | None]:
    found: dict[str, float | None] = {key: None for key in INDEX_ALIASES}

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                match = _index_from_named_value(key, value)
                if match and found[match[0]] is None:
                    found[match[0]] = match[1]
                if isinstance(value, dict) and isinstance(value.get("name"), str):
                    named_match = _index_from_named_value(value["name"], value)
                    if named_match and found[named_match[0]] is None:
                        found[named_match[0]] = named_match[1]
                visit(value)
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, dict) and isinstance(item.get("name"), str):
                    match = _index_from_named_value(item["name"], item)
                    if match and found[match[0]] is None:
                        found[match[0]] = match[1]
                visit(item)

    visit(model)
    return found


def get_path(value: Any, path: tuple[str, ...]) -> Any:
    current = value
    for part in path:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def first_number(source: dict[str, Any], aliases: tuple[str, ...]) -> float | None:
    normalized = {normalize_key(str(key)): value for key, value in source.items()}
    for alias in aliases:
        if normalize_key(alias) in normalized:
            number = as_number(normalized[normalize_key(alias)])
            if number is not None:
                return number
    return None


def nested_dicts(root: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(root, dict):
        found.append(root)
        for value in root.values():
            found.extend(nested_dicts(value))
    elif isinstance(root, list):
        for item in root:
            found.extend(nested_dicts(item))
    return found


def extract_pricing(model: dict[str, Any]) -> dict[str, float | None]:
    records = nested_dicts(model.get("pricing"))

    def pick(aliases: tuple[str, ...]) -> float | None:
        for record in records:
            value = first_number(record, aliases)
            if value is not None:
                return value
        return None

    return {
        "input_per_million_usd": pick(("price_1m_input_tokens", "input_per_million_tokens", "input_price_per_1m_tokens", "input")),
        "output_per_million_usd": pick(("price_1m_output_tokens", "output_per_million_tokens", "output_price_per_1m_tokens", "output")),
        "cache_read_per_million_usd": pick(("price_1m_cached_input_tokens", "price_1m_cache_read_tokens", "cache_read_per_million_tokens", "cached_input")),
        "cache_write_per_million_usd": pick(("price_1m_cache_write_tokens", "cache_write_per_million_tokens", "cache_write")),
    }


def extract_performance(model: dict[str, Any]) -> dict[str, float | None]:
    records = nested_dicts(model.get("performance"))

    def pick(aliases: tuple[str, ...]) -> float | None:
        for record in records:
            result = first_number(record, aliases)
            if result is not None:
                return result
        return None

    return {
        "output_tokens_per_second": pick(("median_output_tokens_per_second", "output_tokens_per_second", "tokens_per_second")),
        "time_to_first_token_ms": pick(("time_to_first_token_ms", "ttft_ms")),
    }


def _provider_name(raw: Any) -> str:
    if isinstance(raw, dict):
        return str(raw.get("name") or raw.get("slug") or "未知供應商")
    return str(raw or "未知供應商")


def normalize_model(model: Any, fetched_at: str, index_version: str | None) -> dict[str, Any]:
    if not isinstance(model, dict):
        raise ValueError("Each data item must be an object")
    model_id = model.get("id") or model.get("slug")
    name = model.get("name")
    if not isinstance(model_id, str) or not model_id.strip() or not isinstance(name, str) or not name.strip():
        raise ValueError("Model is missing a stable id/slug or name")
    indices = extract_indices(model)
    cost = as_number(get_path(model, ("artificial_analysis_intelligence_index_cost", "cost_per_task", "total_cost")))
    explicit_version = model.get("version")
    return {
        "id": model_id,
        "provider": _provider_name(model.get("model_creator")),
        "name": name,
        "version": str(explicit_version) if explicit_version else None,
        "retired": bool(model.get("deprecated") or model.get("is_deprecated") or False),
        "indices": indices,
        "intelligence_cost_per_task_usd": cost,
        "intelligence_cost_model_id": model_id,
        "intelligence_cost_model_name": name,
        "intelligence_cost_model_version": str(explicit_version) if explicit_version else None,
        "intelligence_cost_reasoning": str(model.get("reasoning") or model.get("reasoning_effort") or "unknown"),
        "intelligence_cost_benchmark_version": index_version,
        "api_pricing": extract_pricing(model),
        "performance": extract_performance(model),
        "benchmarks": [],
        "source_url": "https://artificialanalysis.ai/data-api/docs/reference",
        "source_updated_at": None,
        "source_kind": "official",
        "data_origin": "aa_free_api",
    }


def validate_page(payload: Any) -> tuple[list[dict[str, Any]], dict[str, Any], str | None]:
    if not isinstance(payload, dict):
        raise ValueError("API page must be a JSON object")
    data = payload.get("data")
    pagination = payload.get("pagination")
    if not isinstance(data, list) or not isinstance(pagination, dict):
        raise ValueError("API response must include data[] and pagination metadata")
    version = payload.get("intelligence_index_version")
    if version is not None and not isinstance(version, (str, int, float)):
        raise ValueError("intelligence_index_version must be text or null")
    return data, pagination, str(version) if version is not None else None


def _page_count(pagination: dict[str, Any]) -> int | None:
    for key in ("total_pages", "totalPages", "last_page", "pages"):
        candidate = pagination.get(key)
        if isinstance(candidate, int) and candidate >= 1:
            return candidate
    return None


def _has_next(pagination: dict[str, Any]) -> bool | None:
    for key in ("has_next", "hasNextPage", "has_more"):
        if isinstance(pagination.get(key), bool):
            return pagination[key]
    return None


def _request_page(page: int, api_key: str, cache: dict[str, Any], opener: Callable[..., Any]) -> tuple[dict[str, Any], str | None]:
    cache_key = str(page)
    cached = cache.get("pages", {}).get(cache_key, {})
    params = urllib.parse.urlencode({"page": page})
    request = urllib.request.Request(f"{ENDPOINT}?{params}", headers={"x-api-key": api_key, "Accept": "application/json"})
    etag = cached.get("etag") if isinstance(cached, dict) else None
    if etag:
        request.add_header("If-None-Match", etag)
    try:
        response = opener(request, timeout=40)
        status = getattr(response, "status", 200)
        headers = getattr(response, "headers", {})
        if status == 304:
            if not isinstance(cached, dict) or not isinstance(cached.get("payload"), dict):
                raise ApiError("API returned 304 without a valid local page cache", 304)
            return cached["payload"], etag
        body = response.read()
        if status != 200:
            raise ApiError(f"Artificial Analysis API returned HTTP {status}", status)
        try:
            payload = json.loads(body.decode("utf-8"), parse_constant=reject_json_constant)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("API response was not valid UTF-8 JSON") from exc
        return payload, headers.get("ETag") if hasattr(headers, "get") else None
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            if isinstance(cached, dict) and isinstance(cached.get("payload"), dict):
                return cached["payload"], etag
            raise ApiError("API returned 304 without a valid local page cache", 304) from exc
        raise ApiError(f"Artificial Analysis API returned HTTP {exc.code}", exc.code) from exc
    except urllib.error.URLError as exc:
        raise ApiError(f"Artificial Analysis API request failed: {exc.reason}") from exc


def fetch_all_models(api_key: str, cache_path: Path = CACHE_PATH, opener: Callable[..., Any] = urllib.request.urlopen) -> tuple[list[dict[str, Any]], str | None, str, list[dict[str, Any]]]:
    cache: dict[str, Any] = {"pages": {}}
    if cache_path.exists():
        try:
            loaded = json.loads(cache_path.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
            if isinstance(loaded, dict) and isinstance(loaded.get("pages"), dict):
                cache = loaded
        except (OSError, json.JSONDecodeError, ValueError):
            pass

    collected: list[dict[str, Any]] = []
    raw_pages: list[dict[str, Any]] = []
    index_version: str | None = None
    page = 1
    for _ in range(MAX_PAGES):
        payload, etag = _request_page(page, api_key, cache, opener)
        raw_pages.append(payload)
        data, pagination, current_version = validate_page(payload)
        if current_version is not None:
            if index_version is not None and index_version != current_version:
                raise ValueError("Artificial Analysis index version changed during pagination")
            index_version = current_version
        if not data:
            if not collected:
                raise ValueError("API returned an empty first page; refusing to replace the verified snapshot")
            break
        collected.extend(data)
        cache.setdefault("pages", {})[str(page)] = {"payload": payload, "etag": etag}
        total = _page_count(pagination)
        if total is not None:
            if page >= total:
                break
            page += 1
            continue
        has_next = _has_next(pagination)
        if has_next is False:
            break
        if has_next is True:
            page += 1
            continue
        raise ValueError("API pagination metadata does not provide a page count or next-page indicator")
    else:
        raise ValueError(f"Pagination exceeded the safety limit of {MAX_PAGES} pages")

    if not collected:
        raise ValueError("API returned no models")
    fetched_at = now_iso()
    normalized = [normalize_model(item, fetched_at, index_version) for item in collected]
    ids = [model["id"] for model in normalized]
    if len(ids) != len(set(ids)):
        raise ValueError("API response contains duplicate model IDs")
    cache["last_successful_fetch"] = fetched_at
    cache["index_version"] = index_version
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return normalized, index_version, fetched_at, raw_pages


def _load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
    except (OSError, json.JSONDecodeError, ValueError):
        return default


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def _stale_days(snapshot: dict[str, Any], today: dt.date | None = None) -> int | None:
    dates = [model.get("source_updated_at") for model in snapshot.get("models", []) if isinstance(model, dict)]
    dates = [value for value in dates if isinstance(value, str)]
    if not dates:
        return None
    try:
        last = max(dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date() for value in dates)
        return max(0, ((today or dt.date.today()) - last).days)
    except ValueError:
        return None


def _age_since(timestamp: str | None, today: dt.date | None = None) -> int | None:
    if not timestamp:
        return None
    try:
        last = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date()
        return max(0, ((today or dt.date.today()) - last).days)
    except ValueError:
        return None


def _same_model_data(old: dict[str, Any], new: dict[str, Any]) -> bool:
    api_fields = (
        "id", "provider", "name", "version", "retired", "indices",
        "intelligence_cost_per_task_usd", "intelligence_cost_model_id",
        "intelligence_cost_model_name", "intelligence_cost_model_version",
        "intelligence_cost_reasoning", "intelligence_cost_benchmark_version",
        "api_pricing", "performance", "source_kind",
    )
    return {key: old.get(key) for key in api_fields} == {key: new.get(key) for key in api_fields}


def merge_model_sources(api_models: list[dict[str, Any]], prior_models: list[dict[str, Any]], fetched_at: str) -> list[dict[str, Any]]:
    """Merge Free API rows with reviewed public-page benchmark snapshots by stable model/config ID."""
    pages_by_id: dict[str, dict[str, Any]] = {}
    old_api_by_id: dict[str, dict[str, Any]] = {}
    for previous in prior_models:
        if not isinstance(previous, dict) or not isinstance(previous.get("id"), str):
            continue
        origin = previous.get("data_origin")
        if origin == "aa_public_page":
            pages_by_id[previous["id"]] = previous
        elif origin == "aa_free_api+aa_public_page":
            pages_by_id[previous["id"]] = previous
            old_api_by_id[previous["id"]] = previous
        elif origin == "aa_free_api" or previous.get("source_url") == "https://artificialanalysis.ai/data-api/docs/reference":
            old_api_by_id[previous["id"]] = previous

    merged: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for api_model in api_models:
        model = dict(api_model)
        model_id = model["id"]
        previous_api = old_api_by_id.get(model_id)
        model["source_updated_at"] = (
            previous_api.get("source_updated_at")
            if previous_api and _same_model_data(previous_api, model)
            else fetched_at
        )
        page = pages_by_id.get(model_id)
        if page:
            model["data_origin"] = "aa_free_api+aa_public_page"
            model["public_page_source_url"] = page.get("public_page_source_url") or page.get("source_url")
            model["public_page_checked_at"] = page.get("public_page_checked_at") or page.get("source_checked_at")
            if page.get("benchmarks"):
                model["benchmarks"] = page["benchmarks"]
            model["source_checked_at"] = page.get("public_page_checked_at") or page.get("source_checked_at")
        merged.append(model)
        seen_ids.add(model_id)

    for model_id, page in pages_by_id.items():
        if model_id not in seen_ids:
            merged.append(page)
    return merged


def run_update(root: Path = ROOT, environ: dict[str, str] | None = None, opener: Callable[..., Any] = urllib.request.urlopen) -> dict[str, Any]:
    env = environ if environ is not None else os.environ
    snapshot_path = root / "public" / "data" / "snapshot.json"
    status_path = root / "public" / "data" / "status.json"
    cache_path = root / "scripts" / ".cache" / "aa-free-response.json"
    snapshot = _load_json(snapshot_path, {})
    old_models = snapshot.get("models", []) if isinstance(snapshot, dict) else []
    previous_status = _load_json(status_path, {})
    previous_aa_status = previous_status.get("aa", {}) if isinstance(previous_status, dict) else {}
    previous_status_time = previous_aa_status.get("checked_at")
    last_successful_snapshot_at = previous_aa_status.get("last_successful_snapshot_at") or previous_aa_status.get("data_updated_at")
    checked_at = now_iso()
    api_key = env.get("AA_API_KEY", "").strip()
    status: dict[str, Any] = dict(previous_status) if isinstance(previous_status, dict) else {}
    status["aa"] = {
            "configured": bool(api_key),
            "status": "disabled" if not api_key else "error",
            "message": "尚未設定 Artificial Analysis API Key；保留最後一次合法儲存的資料。" if not api_key else "更新尚未完成。",
            "checked_at": checked_at if previous_aa_status.get("status") != "disabled" else previous_status_time,
            "data_updated_at": max((model.get("source_updated_at") for model in old_models if isinstance(model, dict) and model.get("source_updated_at")), default=None),
            "last_successful_snapshot_at": last_successful_snapshot_at,
            "stale_days": _age_since(last_successful_snapshot_at),
            "http_status": None,
            "last_error": None,
            "models_count": len(old_models) if isinstance(old_models, list) else 0,
            "endpoint": ENDPOINT,
    }
    if not api_key:
        if previous_aa_status.get("status") != "disabled":
            _write_json(status_path, status)
        return status

    try:
        models, api_version, fetched_at, raw_pages = fetch_all_models(api_key, cache_path, opener)
        if not isinstance(snapshot, dict) or snapshot.get("schema_version") is None:
            raise ValueError("Existing snapshot is missing schema_version; refusing to replace it")
        models = merge_model_sources(models, old_models if isinstance(old_models, list) else [], fetched_at)
        prior_api_version = snapshot.get("index_versions", {}).get("intelligence_api")
        methodology_version = snapshot.get("index_versions", {}).get("intelligence_methodology")
        api_prefix = str(api_version).lstrip("v") if api_version is not None else None
        method_prefix_match = re.match(r"v?(\d+\.\d+)", str(methodology_version or ""))
        method_prefix = method_prefix_match.group(1) if method_prefix_match else None
        version_changed = prior_api_version is not None and api_version is not None and api_version != prior_api_version
        version_mismatch = api_prefix is not None and method_prefix is not None and api_prefix != method_prefix
        methodology_warning = previous_aa_status.get("methodology_warning")
        if version_changed or version_mismatch:
            methodology_warning = (
                f"Artificial Analysis API 指數版本為 {api_version}；方法目錄為 {methodology_version}。"
                "請人工核對方法版本與指標映射；更新器不會自動改動方法目錄。"
            )
        if methodology_warning:
            status["aa"]["methodology_warning"] = methodology_warning
        data_changed = models != old_models or api_version != prior_api_version
        if data_changed:
            snapshot["models"] = models
            # The snapshot date must move with successfully fetched model data,
            # not remain on the date of the initial scaffold.
            snapshot["as_of"] = fetched_at[:10]
            snapshot.setdefault("index_versions", {})["intelligence_api"] = api_version
            _write_json(snapshot_path, snapshot)
            _write_json(root / "public" / "data" / "aa-raw.json", {
                "endpoint": ENDPOINT,
                "retrieved_at": fetched_at,
                "intelligence_index_version": api_version,
                "pages": raw_pages,
            })
        data_updated_at = fetched_at if data_changed else previous_aa_status.get("data_updated_at") or max((model.get("source_updated_at") for model in old_models if isinstance(model, dict) and model.get("source_updated_at")), default=fetched_at)
        status["aa"].update({
            "status": "ready",
            "message": "Artificial Analysis 免費 API 資料已成功更新。" if data_changed else "每日 API 檢查成功；資料內容與快照相同。",
            "checked_at": fetched_at if data_changed or previous_aa_status.get("status") != "ready" else previous_status_time,
            "last_successful_snapshot_at": fetched_at if data_changed or previous_aa_status.get("status") != "ready" else last_successful_snapshot_at,
            "data_updated_at": data_updated_at,
            "stale_days": 0,
            "models_count": len(models),
        })
    except ApiError as exc:
        status["aa"].update({
            "status": "stale" if old_models else "error",
            "message": f"Artificial Analysis API 更新失敗（HTTP {exc.status}）；保留最後一次合法儲存的資料。" if exc.status else "Artificial Analysis API 連線失敗；保留最後一次合法儲存的資料。",
            "http_status": exc.status,
            "last_error": str(exc),
            "checked_at": checked_at if previous_aa_status.get("status") != ("stale" if old_models else "error") or previous_aa_status.get("last_error") != str(exc) else previous_status_time,
            "last_successful_snapshot_at": last_successful_snapshot_at,
            "stale_days": _age_since(last_successful_snapshot_at),
        })
    except (ValueError, OSError) as exc:
        status["aa"].update({
            "status": "stale" if old_models else "error",
            "message": "Artificial Analysis 資料驗證失敗；保留最後一次合法儲存的資料。",
            "last_error": str(exc),
            "checked_at": checked_at if previous_aa_status.get("status") != ("stale" if old_models else "error") or previous_aa_status.get("last_error") != str(exc) else previous_status_time,
            "last_successful_snapshot_at": last_successful_snapshot_at,
            "stale_days": _age_since(last_successful_snapshot_at),
        })
    if status != previous_status:
        _write_json(status_path, status)
    return status


if __name__ == "__main__":
    outcome = run_update()
    print(json.dumps(outcome, ensure_ascii=False, indent=2))
    if outcome["aa"]["status"] in {"error", "stale"}:
        sys.exit(1)
