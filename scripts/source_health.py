#!/usr/bin/env python3
"""Monitor official public source pages without changing verified plan data.

Content changes stay pending until reviewed. HTTP 403/404 and transient failures
are recorded separately as fetch availability; they are never interpreted as a
product change or used to replace the last verified snapshot.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY_BYTES = 2 * 1024 * 1024
USER_AGENT = "AI-Plan-Benchmark-source-monitor/2.0 (public-source-change-notice)"


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def reject_json_constant(value: str) -> None:
    raise ValueError(f"Invalid JSON numeric constant: {value}")


def load(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
    except (OSError, json.JSONDecodeError, ValueError):
        return default


def write_if_changed(path: Path, value: Any) -> bool:
    serialized = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    try:
        if path.read_text(encoding="utf-8") == serialized:
            return False
    except OSError:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(path)
    return True


def is_checkable_source(source: dict[str, Any]) -> bool:
    if source.get("kind") != "official":
        return False
    url = source.get("url")
    if not isinstance(url, str):
        return False
    parsed = urllib.parse.urlparse(url)
    # The key-protected AA API is monitored by update_data.py, not a public-page GET.
    return parsed.scheme == "https" and parsed.path != "/api/v2/language/models/free"


def _http_failure(code: int, prior: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    if code == 403:
        state_name, message = "blocked", "HTTP 403：網站拒絕自動讀取；這不代表內容已改變或產品已下架。"
    elif code == 404:
        state_name, message = "not_found", "HTTP 404：此網址目前找不到；可能已搬址或撤下，不能單憑 404 判定方案已停止。"
    elif code == 429:
        state_name, message = "rate_limited", "HTTP 429：來源暫時限制自動請求；保留上次已核實資料。"
    else:
        state_name, message = "unavailable", f"來源暫時無法自動讀取（HTTP {code}）；保留上次已核實資料。"
    state = {**prior, "availability": state_name, "http_status": code, "error": message}
    return state_name, message, state


def request_source(source: dict[str, Any], prior: dict[str, Any]) -> tuple[str, str | None, dict[str, Any]]:
    url = source["url"]
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5"}
    if prior.get("etag"):
        headers["If-None-Match"] = prior["etag"]
    if prior.get("last_modified"):
        headers["If-Modified-Since"] = prior["last_modified"]
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            status = getattr(response, "status", 200)
            if status == 304:
                state = {**prior, "availability": "available", "http_status": 304, "error": None}
                return "unchanged", None, state
            body = response.read(MAX_BODY_BYTES + 1)
            if len(body) > MAX_BODY_BYTES:
                message = "來源回應超過 2 MiB 監測上限；保留上次已核實資料。"
                return "unavailable", message, {**prior, "availability": "unavailable", "http_status": status, "error": message}
            digest = hashlib.sha256(body).hexdigest()
            response_headers = response.headers
            state = {
                **prior,
                "sha256": digest,
                "etag": response_headers.get("ETag"),
                "last_modified": response_headers.get("Last-Modified"),
                "http_status": status,
                "availability": "available",
                "error": None,
            }
            return "ok", None, state
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            state = {**prior, "availability": "available", "http_status": 304, "error": None}
            return "unchanged", None, state
        return _http_failure(exc.code, prior)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", str(exc))
        message = f"來源暫時無法自動讀取：{reason}；保留上次已核實資料。"
        return "unavailable", message, {**prior, "availability": "unavailable", "error": message}


def build_report(pending: dict[str, Any], source_states: dict[str, Any], checked_at: str) -> dict[str, Any]:
    warnings = sorted(pending.values(), key=lambda item: (item.get("label", ""), item.get("source_id", "")))
    unavailable = []
    labels = {
        "blocked": "機器人存取受阻",
        "not_found": "網址無法找到",
        "rate_limited": "自動請求受限",
        "unavailable": "暫時無法自動讀取",
    }
    for source_id, state in source_states.items():
        if not isinstance(state, dict) or state.get("availability", "available") == "available":
            continue
        unavailable.append({
            "source_id": source_id,
            "label": state.get("label", source_id),
            "url": state.get("url", ""),
            "category": state.get("availability", "unavailable"),
            "message": state.get("error") or labels.get(state.get("availability"), labels["unavailable"]),
        })
    unavailable.sort(key=lambda item: (item.get("label", ""), item.get("source_id", "")))
    if warnings and unavailable:
        summary = f"有 {len(warnings)} 個內容更新待核對；{len(unavailable)} 個來源目前無法自動讀取。"
    elif warnings:
        summary = f"有 {len(warnings)} 個來源內容更新待核對。"
    elif unavailable:
        summary = f"內容變更警告為 0；{len(unavailable)} 個來源自動讀取受限，仍保留最後核實版本。"
    else:
        summary = "官方來源檢查完成，沒有待核對的內容變更。"
    return {
        "status": "warning" if warnings else "ok",
        "checked_at": checked_at,
        "summary": summary,
        "warnings": warnings,
        "unavailable": unavailable,
    }


def check_sources(root: Path = ROOT) -> dict[str, Any]:
    snapshot_path = root / "public/data/snapshot.json"
    status_path = root / "public/data/status.json"
    cache_path = root / "public/data/source-health-cache.json"
    snapshot = load(snapshot_path, {})
    status = load(status_path, {})
    cache = load(cache_path, {"sources": {}, "pending_warnings": {}})
    prior_sources = cache.get("sources", {}) if isinstance(cache, dict) else {}
    pending = cache.get("pending_warnings", {}) if isinstance(cache, dict) else {}
    if not isinstance(prior_sources, dict):
        prior_sources = {}
    if not isinstance(pending, dict):
        pending = {}

    changed = False
    source_by_id = {}
    for source in snapshot.get("sources", []):
        if not isinstance(source, dict) or not is_checkable_source(source):
            continue
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id:
            continue
        source_by_id[source_id] = source
        prior = prior_sources.get(source_id, {})
        if not isinstance(prior, dict):
            prior = {}
        result, message, next_state = request_source(source, prior)
        if (
            result == "ok"
            and next_state.get("sha256") == prior.get("sha256")
            and prior.get("availability", "available") == "available"
        ):
            # Ignore validator/response-header churn when page content is identical.
            next_state = dict(prior)
        next_state["label"] = source.get("label", source_id)
        next_state["url"] = source["url"]
        if result == "ok":
            old_hash = prior.get("sha256")
            new_hash = next_state.get("sha256")
            reviewed_hash = prior.get("reviewed_sha256") or old_hash
            if not old_hash:
                # A first successful read establishes a baseline; it is not a change.
                reviewed_hash = new_hash
                next_state["baseline_at"] = now_iso()
                pending.pop(f"change:{source_id}", None)
            elif new_hash and new_hash != reviewed_hash:
                pending[f"change:{source_id}"] = {
                    "source_id": source_id,
                    "label": source.get("label", source_id),
                    "url": source["url"],
                    "message": f"官方頁面內容已變更（{str(reviewed_hash)[:12]} → {str(new_hash)[:12]}）；方案資料未自動覆寫，待來源核對。",
                }
            else:
                pending.pop(f"change:{source_id}", None)
            next_state["reviewed_sha256"] = reviewed_hash
            next_state["last_success_at"] = now_iso() if new_hash != old_hash or prior.get("availability") != "available" else prior.get("last_success_at")
            next_state["state_changed_at"] = now_iso() if next_state != prior else prior.get("state_changed_at")
        elif result == "unchanged":
            # A 304 confirms access, not the page body; keep the previous digest.
            if prior.get("availability") != "available":
                next_state["state_changed_at"] = now_iso()
        else:
            # Keep the last content hash and review baseline on every fetch failure.
            next_state["state_changed_at"] = now_iso() if next_state.get("availability") != prior.get("availability") or next_state.get("http_status") != prior.get("http_status") else prior.get("state_changed_at")
        if next_state != prior:
            prior_sources[source_id] = next_state
            changed = True

    warnings = sorted(pending.values(), key=lambda item: (item.get("label", ""), item.get("source_id", "")))
    old_report = status.get("source_health", {}) if isinstance(status, dict) else {}
    report = build_report(pending, prior_sources, now_iso())
    # Do not create a daily commit solely to refresh timestamps when nothing changed.
    if not changed and report.get("warnings") == old_report.get("warnings") and report.get("unavailable") == old_report.get("unavailable"):
        report = old_report
    else:
        changed = True
    if changed:
        cache_out = {"sources": prior_sources, "pending_warnings": pending, "last_state_change_at": report.get("checked_at", now_iso())}
        write_if_changed(cache_path, cache_out)
        if not isinstance(status, dict):
            status = {}
        status["source_health"] = report
        write_if_changed(status_path, status)
    unavailable = report.get("unavailable", []) if isinstance(report, dict) else []
    result = {
        "checked_sources": len(source_by_id),
        "pending_warnings": len(warnings),
        "unavailable_sources": len(unavailable),
        "files_changed": changed,
        "warnings": warnings,
        "unavailable": unavailable,
    }
    print(json.dumps({key: value for key, value in result.items() if key not in {"warnings", "unavailable"}}, ensure_ascii=False))
    return result


def acknowledge_source(root: Path, source_id: str) -> int:
    cache_path = root / "public/data/source-health-cache.json"
    status_path = root / "public/data/status.json"
    cache = load(cache_path, {"sources": {}, "pending_warnings": {}})
    states = cache.get("sources", {}) if isinstance(cache, dict) else {}
    pending = cache.get("pending_warnings", {}) if isinstance(cache, dict) else {}
    state = states.get(source_id, {}) if isinstance(states, dict) else {}
    if isinstance(state, dict) and state.get("sha256"):
        state["reviewed_sha256"] = state["sha256"]
        state["reviewed_at"] = now_iso()
    removed = [key for key, warning in pending.items() if warning.get("source_id") == source_id]
    for key in removed:
        pending.pop(key, None)
    write_if_changed(cache_path, cache)
    status = load(status_path, {})
    if isinstance(status, dict):
        status["source_health"] = build_report(pending, states, now_iso())
        write_if_changed(status_path, status)
    return len(removed)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--ack":
        print(f"Cleared {acknowledge_source(ROOT, sys.argv[2])} content-change warning(s) for {sys.argv[2]}.")
    else:
        check_sources()
