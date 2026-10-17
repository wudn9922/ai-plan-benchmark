#!/usr/bin/env python3
"""Import a reviewed, source-linked Coding Agent dataset into snapshot.json."""

import json
import math
import re
import sys
import datetime as dt
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
EVIDENCE = {"official", "community", "measured", "estimate"}
PROVIDERS = {"openai", "anthropic", "google", "xai", "other"}


def official_aa_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme == "https" and parsed.hostname == "artificialanalysis.ai"


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        dt.date.fromisoformat(value[:10])
        return True
    except ValueError:
        return False


def finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def infer_provider(record: dict) -> str | None:
    """Infer only from recognizable official product/harness names for older import templates."""
    value = " ".join(str(record.get(key) or "") for key in ("provider", "agent", "harness", "model")).lower()
    if any(term in value for term in ("anthropic", "claude")):
        return "anthropic"
    if any(term in value for term in ("openai", "codex")):
        return "openai"
    if any(term in value for term in ("google", "gemini", "antigravity", "jules")):
        return "google"
    if any(term in value for term in ("xai", "x.ai", "grok")):
        return "xai"
    return None


def validate_import(data: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["Import must be a JSON object"]
    for key in ("schema_version", "index_version", "checked_at", "region", "source_url", "method_url", "evidence_kind", "records"):
        if key not in data:
            errors.append(f"Missing {key}")
    if data.get("schema_version") != "1.0.0":
        errors.append("Unsupported schema_version")
    if not re.fullmatch(r"v\d+\.\d+", str(data.get("index_version", ""))):
        errors.append("index_version must be vMAJOR.MINOR, matching the public page version")
    if data.get("evidence_kind") != "official":
        errors.append("Only official public Coding Agent data can be imported through this workflow")
    for key in ("source_url", "method_url"):
        if not official_aa_url(data.get(key)):
            errors.append(f"{key} must use an official Artificial Analysis HTTPS URL")
    if not valid_date(data.get("checked_at")):
        errors.append("checked_at must record the date the official source was reviewed")
    if not isinstance(data.get("region"), str) or not data.get("region", "").strip():
        errors.append("region must be a non-empty string")
    records = data.get("records")
    if not isinstance(records, list):
        errors.append("records must be an array")
        return errors
    ids: set[str] = set()
    required = ("id", "agent", "harness", "model", "reasoning_effort", "coding_agent_index", "scores", "average_task_tokens", "input_tokens", "cached_tokens", "output_tokens", "average_task_seconds", "cost_per_task_usd", "cost_kind", "benchmark_version", "source_url", "source_updated_at", "note")
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f"records[{index}] must be an object")
            continue
        for key in required:
            if key not in record:
                errors.append(f"records[{index}] missing {key}")
        record_id = record.get("id")
        if not isinstance(record_id, str) or not record_id:
            errors.append(f"records[{index}].id must be a non-empty string")
        elif record_id in ids:
            errors.append(f"duplicate record id {record_id}")
        else:
            ids.add(record_id)
        for key in ("agent", "harness", "model", "reasoning_effort", "benchmark_version", "note"):
            if not isinstance(record.get(key), str) or not record[key].strip():
                errors.append(f"records[{index}].{key} must be a non-empty string; use 'unknown' when unpublished")
        if not re.fullmatch(r"v\d+\.\d+", str(record.get("benchmark_version", ""))):
            errors.append(f"records[{index}].benchmark_version must be vMAJOR.MINOR")
        elif record.get("benchmark_version") != data.get("index_version"):
            errors.append(f"records[{index}].benchmark_version must match import index_version")
        provider = record.get("provider")
        if provider is not None and (not isinstance(provider, str) or provider not in PROVIDERS):
            errors.append(f"records[{index}].provider must be one of {', '.join(sorted(PROVIDERS))}")
        elif provider is None and infer_provider(record) is None:
            errors.append(f"records[{index}].provider is required when it cannot be inferred from the Agent or Harness")
        if not official_aa_url(record.get("source_url")):
            errors.append(f"records[{index}].source_url must use an official Artificial Analysis HTTPS URL")
        source_updated_at = record.get("source_updated_at")
        if source_updated_at is not None and not valid_date(source_updated_at):
            errors.append(f"records[{index}].source_updated_at must be a date or null when the page does not publish it")
        if record.get("source_checked_at") is not None and not valid_date(record.get("source_checked_at")):
            errors.append(f"records[{index}].source_checked_at must be a date")
        if source_updated_at is None and not valid_date(record.get("source_checked_at", data.get("checked_at"))):
            errors.append(f"records[{index}] must include a source check date when the source update date is unavailable")
        for score_key in ("coding_agent_index", "average_task_tokens", "input_tokens", "cached_tokens", "output_tokens", "average_task_seconds", "cost_per_task_usd", "cache_hit_percent"):
            value = record.get(score_key)
            if value is not None and not finite_number(value):
                errors.append(f"records[{index}].{score_key} must be a finite number or null")
            elif value is not None and value < 0:
                errors.append(f"records[{index}].{score_key} must not be negative")
        index_score = record.get("coding_agent_index")
        if index_score is not None and finite_number(index_score) and index_score > 100:
            errors.append(f"records[{index}].coding_agent_index must be between 0 and 100")
        cache_hit = record.get("cache_hit_percent")
        if cache_hit is not None and finite_number(cache_hit) and cache_hit > 100:
            errors.append(f"records[{index}].cache_hit_percent must be between 0 and 100")
        if record.get("cost_per_task_usd") is not None and record.get("cost_kind") is None:
            errors.append(f"records[{index}] must identify whether task cost is official, measured, community, or estimated")
        if record.get("cost_kind") is not None and record.get("cost_kind") not in EVIDENCE:
            errors.append(f"records[{index}].cost_kind must be official, measured, community, estimate, or null")
        scores = record.get("scores")
        if not isinstance(scores, list):
            errors.append(f"records[{index}].scores must be an array")
            continue
        for score_index, score in enumerate(scores):
            label = f"records[{index}].scores[{score_index}]"
            if not isinstance(score, dict):
                errors.append(f"{label} must be an object")
                continue
            for key in ("benchmark_id", "unit", "version", "method_url", "source_kind"):
                if not isinstance(score.get(key), str) or not score[key].strip():
                    errors.append(f"{label}.{key} must be a non-empty string")
            score_value = score.get("score")
            if score_value is not None and not finite_number(score_value):
                errors.append(f"{label}.score must be a finite number or null")
            if isinstance(score.get("unit"), str) and "%" in score["unit"] and finite_number(score_value) and not 0 <= score_value <= 100:
                errors.append(f"{label} percentage score must be between 0 and 100")
            for bool_key in ("higher_is_better", "included_in_index", "cross_model_comparable"):
                if score.get(bool_key) not in {True, False, None}:
                    errors.append(f"{label}.{bool_key} must be true, false, or null")
            if score.get("source_kind") not in EVIDENCE:
                errors.append(f"{label}.source_kind has an unsupported evidence kind")
            if not official_aa_url(score.get("method_url")):
                errors.append(f"{label}.method_url must use an official Artificial Analysis HTTPS URL")
    return errors


def import_file(source_path: Path, snapshot_path: Path = SNAPSHOT) -> None:
    data = json.loads(source_path.read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Invalid JSON numeric constant: {value}")))
    errors = validate_import(data)
    if errors:
        raise ValueError("\n".join(errors))
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Invalid JSON numeric constant: {value}")))
    old_records = snapshot.get("coding_agents", [])
    incoming = data["records"]
    for record in incoming:
        if record.get("provider") is None:
            record["provider"] = infer_provider(record)
        if record.get("source_checked_at") is None:
            record["source_checked_at"] = data["checked_at"]
    old_ids = {record.get("id") for record in old_records if isinstance(record, dict)}
    if any(record["id"] in old_ids for record in incoming):
        raise ValueError("Import would overwrite an existing coding agent record; remove or version explicitly first")
    snapshot["coding_agents"] = old_records + incoming
    snapshot.setdefault("index_versions", {})["coding_agent"] = data["index_version"]
    source_id = f"aa-coding-agent-import-{data['index_version']}-{data['checked_at']}"
    if not any(source.get("id") == source_id for source in snapshot.setdefault("sources", [])):
        snapshot["sources"].append({
        "id": source_id,
        "label": f"Artificial Analysis Coding Agent Index {data['index_version']} manual import",
        "url": data["source_url"],
        "kind": "official",
        "checked_at": data["checked_at"],
        "region": data["region"],
        "notes": data.get("review_notes", "Versioned official dataset import."),
        })
    temporary = snapshot_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(snapshot_path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/import_coding_agents.py path/to/reviewed-import.json", file=sys.stderr)
        raise SystemExit(2)
    try:
        import_file(Path(sys.argv[1]))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print("Coding Agent dataset imported; run scripts/validate_data.py before publishing.")
