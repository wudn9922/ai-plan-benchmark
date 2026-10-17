#!/usr/bin/env python3
"""Apply reviewed subscription and benchmark metadata without replacing AA models."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CURATED_PATH = ROOT / "data" / "curated.json"
SNAPSHOT_PATH = ROOT / "public" / "data" / "snapshot.json"
STATIC_FIELDS = (
    "schema_version",
    "region",
    "currency",
    "sources",
    "plans",
    "quotas",
    "coding_agents",
    "index_methodology",
    "benchmark_catalog",
    "notes",
)
REQUIRED_FIELDS = {*STATIC_FIELDS, "index_versions"}


def _load_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def apply_curated_data(root: Path = ROOT) -> dict[str, Any]:
    curated = _load_object(root / "data" / "curated.json", "curated data")
    snapshot_path = root / "public" / "data" / "snapshot.json"
    snapshot = _load_object(snapshot_path, "snapshot")

    missing = REQUIRED_FIELDS - curated.keys()
    extra = curated.keys() - REQUIRED_FIELDS
    if missing or extra:
        raise ValueError(f"Curated data fields mismatch; missing={sorted(missing)}, extra={sorted(extra)}")
    if not isinstance(curated["index_versions"], dict):
        raise ValueError("curated index_versions must be an object")
    if "intelligence_api" in curated["index_versions"]:
        raise ValueError("curated data cannot override the Artificial Analysis API version")
    for key in ("sources", "plans", "quotas", "coding_agents", "benchmark_catalog", "notes"):
        if not isinstance(curated[key], list):
            raise ValueError(f"curated {key} must be an array")

    updated = dict(snapshot)
    for key in STATIC_FIELDS:
        updated[key] = curated[key]
    updated["index_versions"] = {
        **(snapshot.get("index_versions") if isinstance(snapshot.get("index_versions"), dict) else {}),
        **curated["index_versions"],
    }
    changed = updated != snapshot
    if changed:
        temporary = snapshot_path.with_suffix(snapshot_path.suffix + ".tmp")
        temporary.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(snapshot_path)
    return {"changed": changed, "plans": len(updated["plans"]), "quotas": len(updated["quotas"]), "sources": len(updated["sources"])}


if __name__ == "__main__":
    print(json.dumps(apply_curated_data(), ensure_ascii=False))
