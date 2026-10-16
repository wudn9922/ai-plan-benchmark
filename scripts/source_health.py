#!/usr/bin/env python3
"""Check public official source pages without scraping prices or editing the data snapshot.

HTTP validators and page hashes are kept in a small public cache. A changed
source creates a persistent review warning; a fetch failure warns until a later
successful check. Repeated unchanged checks do not rewrite files or create commits.
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
USER_AGENT = "AI-Plan-Benchmark-source-monitor/1.0 (public-source-change-notice)"


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
                return "unchanged", None, prior
            body = response.read(MAX_BODY_BYTES + 1)
            if len(body) > MAX_BODY_BYTES:
                return "error", f"回應超過 2 MiB 監測上限（HTTP {status}）", {**prior, "http_status": status}
            digest = hashlib.sha256(body).hexdigest()
            response_headers = response.headers
            state = {
                "sha256": digest,
                "etag": response_headers.get("ETag"),
                "last_modified": response_headers.get("Last-Modified"),
                "http_status": status,
                "error": None,
            }
            return "ok", None, state
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return "unchanged", None, prior
        return "error", f"來源檢查回傳 HTTP {exc.code}", {**prior, "http_status": exc.code, "error": f"HTTP {exc.code}"}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", str(exc))
        message = f"來源目前無法讀取：{reason}"
        return "error", message, {**prior, "error": message}


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
    for source in snapshot.get("sources", []):
        if not isinstance(source, dict) or not is_checkable_source(source):
            continue
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id:
            continue
        prior = prior_sources.get(source_id, {})
        if not isinstance(prior, dict):
            prior = {}
        result, message, next_state = request_source(source, prior)
        if result == "error":
            warning = {"source_id": source_id, "label": source.get("label", source_id), "url": source["url"], "message": message or "來源讀取失敗"}
            pending[f"error:{source_id}"] = warning
            if next_state != prior:
                next_state["state_changed_at"] = now_iso()
        elif result == "ok":
            old_hash = prior.get("sha256")
            new_hash = next_state.get("sha256")
            pending.pop(f"error:{source_id}", None)
            if old_hash and new_hash and old_hash != new_hash:
                pending[f"change:{source_id}"] = {
                    "source_id": source_id,
                    "label": source.get("label", source_id),
                    "url": source["url"],
                    "message": f"官方頁面內容已變更（{str(old_hash)[:12]} → {str(new_hash)[:12]}），價格與權限未自動改動，請人工核對。",
                }
                next_state["state_changed_at"] = now_iso()
            elif not old_hash:
                next_state["baseline_at"] = now_iso()
                next_state["state_changed_at"] = now_iso()
            elif old_hash == new_hash:
                # Ignore changing validators/response headers when content is identical.
                next_state = prior
        if next_state != prior:
            prior_sources[source_id] = next_state
            changed = True

    warnings = sorted(pending.values(), key=lambda item: (item.get("label", ""), item.get("source_id", "")))
    if changed or pending != cache.get("pending_warnings", {}):
        report_time = now_iso()
        report = {
            "status": "warning" if warnings else "ok",
            "checked_at": report_time,
            "summary": f"{len(warnings)} 個官方來源需要人工核對。" if warnings else "官方來源檢查成功，沒有偵測到待核對變更。",
            "warnings": warnings,
        }
        cache_out = {"sources": prior_sources, "pending_warnings": pending, "last_state_change_at": report_time}
        write_if_changed(cache_path, cache_out)
        if not isinstance(status, dict):
            status = {}
        status["source_health"] = report
        write_if_changed(status_path, status)
    print(json.dumps({"checked_sources": len(prior_sources), "pending_warnings": len(warnings), "files_changed": changed or pending != cache.get("pending_warnings", {})}, ensure_ascii=False))
    return {"checked_sources": len(prior_sources), "pending_warnings": len(warnings), "warnings": warnings}


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--ack":
        source_id = sys.argv[2]
        cache_path = ROOT / "public/data/source-health-cache.json"
        status_path = ROOT / "public/data/status.json"
        cache = load(cache_path, {"sources": {}, "pending_warnings": {}})
        pending = cache.get("pending_warnings", {})
        removed = [key for key, warning in pending.items() if warning.get("source_id") == source_id]
        for key in removed:
            pending.pop(key, None)
        write_if_changed(cache_path, cache)
        status = load(status_path, {})
        if isinstance(status, dict) and isinstance(status.get("source_health"), dict):
            warnings = sorted(pending.values(), key=lambda item: (item.get("label", ""), item.get("source_id", "")))
            status["source_health"] = {
                "status": "warning" if warnings else "ok",
                "checked_at": now_iso(),
                "summary": f"{len(warnings)} 個官方來源需要人工核對。" if warnings else "官方來源待核對項目已清除。",
                "warnings": warnings,
            }
            write_if_changed(status_path, status)
        print(f"Cleared {len(removed)} warning(s) for {source_id}.")
    else:
        check_sources()
