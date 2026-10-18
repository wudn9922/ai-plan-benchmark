#!/usr/bin/env python3
"""Monitor official public source pages without changing verified plan data.

Content changes stay pending until reviewed. HTTP 403/404 and transient failures
are recorded separately as fetch availability; they are never interpreted as a
product change or used to replace the last verified snapshot.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY_BYTES = 2 * 1024 * 1024
USER_AGENT = "AI-Plan-Benchmark-source-monitor/2.0 (public-source-change-notice)"
HASH_VERSION = "visible-text-v1"
KEY_SECTION_HASH_VERSION = "key-sections-v1"
KEY_SECTION_SOURCES = {
    "anthropic-cowork",
    "anthropic-pricing",
    "anthropic-pro-cost",
    "google-gemini-limits",
    "google-annual-plus",
    "google-annual-pro",
    "google-ai-plus-current",
    "google-one-benefits",
}
KEY_SECTION_HASH_VERSIONS = {
    # Pricing pages have a short, stable pricing region; ignore rotating site-wide banners.
    "anthropic-pricing": "pricing-region-v2",
}
KEY_SECTION_WINDOWS = {
    # Limit these two sources to the consumer pricing content. The Anthropic page
    # appends team/API marketing and the Google page has rotating global banners.
    "anthropic-pricing": (re.compile(r"^Pricing$", re.I), re.compile(r"^Team$", re.I)),
    "google-ai-plus-current": (re.compile(r"^Get more out of Gemini$", re.I), re.compile(r"^Create$", re.I)),
}
KEY_SECTION_PATTERNS = {
    "anthropic-cowork": re.compile(r"cowork|pro|max|roll.?out|available|claude", re.I),
    "anthropic-pricing": re.compile(r"^(?:pricing|free|pro|max(?: 5x| 20x)?|\$\d+(?:\.\d{2})?|per month.*|everything in free.*|more usage.*|hand off and schedule tasks|claude (?:dashboards|code|science|in chrome).*|projects|more claude models|fable.*|opus.*|sonnet.*|haiku.*|context window.*|usage credits.*|usage limits apply.*|prices shown.*|.*\|\s*(?:no|yes)\s*\|.*)$", re.I),
    "anthropic-pro-cost": re.compile(r"pro|billing|annual|yearly|\$|month|tax", re.I),
    "google-gemini-limits": re.compile(r"limit|5.hour|five.hour|weekly|refresh|reset|plus|pro|prompt|model|usage|deep research", re.I),
    "google-annual-plus": re.compile(r"annual|yearly|billing|purchase|plus|month|\$|subscription", re.I),
    "google-annual-pro": re.compile(r"annual|yearly|billing|purchase|pro|month|\$|subscription", re.I),
    "google-ai-plus-current": re.compile(r"^(?:get more out of gemini|google ai (?:free|plus|pro|ultra).*|free|\$\d+(?:\.\d{2})?\s*/?\s*month|get \d+x higher usage.*|access to (?:gemini 4 argon|our (?:flash|pro) model).*|gemini app|get \d[\d,]* google flow credits.*|google flow|jules|higher limits to our asynchronous coding agent.*|google antigravity|entry rate limits to agent model.*|google ai (?:plus|pro) is available in .*|.*\|\s*(?:limited|expanded|higher|highest)\s*\|.*)$", re.I),
    "google-one-benefits": re.compile(r"antigravity|jules|ai credit|google ai pro|deep research|tasks in gemini", re.I),
}


def source_hash_version(source_id: str | None) -> str:
    if source_id in KEY_SECTION_HASH_VERSIONS:
        return KEY_SECTION_HASH_VERSIONS[source_id]
    return KEY_SECTION_HASH_VERSION if source_id in KEY_SECTION_SOURCES else HASH_VERSION


class _VisibleText(HTMLParser):
    """Collect page text while ignoring code, styles, and non-visible SVG markup."""

    IGNORED_TAGS = {"head", "script", "style", "noscript", "svg", "template"}
    BLOCK_TAGS = {
        "address", "article", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset",
        "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li",
        "main", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.IGNORED_TAGS:
            self.ignored_depth += 1
        elif self.ignored_depth == 0 and tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.IGNORED_TAGS and self.ignored_depth:
            self.ignored_depth -= 1
        elif self.ignored_depth == 0 and tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.ignored_depth == 0:
            self.parts.append(data)


def _stable_key_sections(text: str, source_id: str) -> str:
    """Keep pricing/limits passages and discard volatile page chrome and unrelated text."""
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    window = KEY_SECTION_WINDOWS.get(source_id)
    if window:
        start_pattern, stop_pattern = window
        start_index = next((index for index, line in enumerate(lines) if start_pattern.search(line)), None)
        if start_index is not None:
            stop_index = next((index for index in range(start_index + 1, len(lines)) if stop_pattern.search(lines[index])), None)
            lines = lines[start_index:stop_index if stop_index is not None else len(lines)]
    pattern = KEY_SECTION_PATTERNS[source_id]
    selected: list[str] = []
    for index, line in enumerate(lines):
        if pattern.search(line):
            if line not in selected:
                selected.append(line)
    return " ".join(selected) if selected else " ".join(lines)


def content_fingerprint(body: bytes, content_type: str | None, source_id: str | None = None) -> str:
    """Hash stable, reader-facing content instead of volatile HTML/CSS/JS bytes."""
    charset_match = re.search(r"charset=([^;\s]+)", content_type or "", re.IGNORECASE)
    charset = charset_match.group(1).strip("\"'") if charset_match else "utf-8"
    try:
        text = body.decode(charset, errors="replace")
    except LookupError:
        text = body.decode("utf-8", errors="replace")

    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type in {"application/json", "application/ld+json"}:
        try:
            parsed = json.loads(text, parse_constant=reject_json_constant)
            text = json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        except (json.JSONDecodeError, ValueError):
            pass
    elif "html" in media_type or (not media_type and "<html" in text[:1024].lower()):
        parser = _VisibleText()
        try:
            parser.feed(text)
            visible = "\n".join(parser.parts)
            if visible:
                text = _stable_key_sections(visible, source_id) if source_id in KEY_SECTION_SOURCES else " ".join(visible.split())
        except Exception:
            # An unusual document should still be checked using whitespace-normalized text.
            pass
    else:
        text = " ".join(text.split())
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
    # Force one full read when migrating from raw-byte hashes to visible-text hashes.
    fingerprint_version = source_hash_version(source.get("id"))
    if prior.get("hash_version") == fingerprint_version and prior.get("etag"):
        headers["If-None-Match"] = prior["etag"]
    if prior.get("hash_version") == fingerprint_version and prior.get("last_modified"):
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
            content_type = response.headers.get("Content-Type")
            digest = content_fingerprint(body, content_type, source.get("id"))
            response_headers = response.headers
            state = {
                **prior,
                "sha256": digest,
                "hash_version": fingerprint_version,
                "content_type": content_type,
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
            **({"manual_verified_at": state["manual_verified_at"]} if state.get("manual_verified_at") else {}),
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
        "status": "warning" if warnings or unavailable else "ok",
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
            and next_state.get("hash_version") == prior.get("hash_version")
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
            hash_migrated = bool(old_hash) and prior.get("hash_version") != source_hash_version(source_id)
            if not old_hash or hash_migrated:
                # First read or explicit fingerprint migration establishes a baseline.
                # The migration is recorded so the new, text-only hash is reviewed once.
                reviewed_hash = new_hash
                next_state["baseline_at"] = prior.get("baseline_at") or now_iso()
                if hash_migrated:
                    next_state["reviewed_at"] = now_iso()
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

    # Removed source IDs should not leave old warnings in the public report.
    active_ids = set(source_by_id)
    for warning_id, warning in list(pending.items()):
        if not isinstance(warning, dict) or warning.get("source_id") not in active_ids:
            pending.pop(warning_id, None)
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
