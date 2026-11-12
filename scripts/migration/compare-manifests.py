#!/usr/bin/env python3
"""Compare PRIVATE migration manifests. Does not access any DB or print records.

Manifest inputs are generated offline by an approved read-only export. Keep
both JSON files outside the public GitHub repository.
"""
import json
import sys
from pathlib import Path

EXPECTED_SECTIONS = ("tables", "auth", "routines", "extensions", "jobs", "storage")
NUMERIC_KEYS = ("row_count", "users", "identities", "buckets", "objects")

def validate(manifest):
    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be a JSON object.")
    if not all(k in manifest for k in EXPECTED_SECTIONS):
        raise ValueError("Manifest missing one or more mandatory sections.")
    if not isinstance(manifest["tables"], dict):
        raise ValueError("tables must map table names to integer row counts.")
    for table, count in manifest["tables"].items():
        if not isinstance(table, str) or type(count) is not int or count < 0:
            raise ValueError("Invalid table count.")
    for key in ("users", "identities"):
        if type(manifest["auth"].get(key)) is not int:
            raise ValueError("Auth counts must be integers.")
    for key in ("buckets", "objects"):
        if type(manifest["storage"].get(key)) is not int:
            raise ValueError("Storage counts must be integers.")
    for key in ("routines", "extensions", "jobs"):
        if not isinstance(manifest[key], list):
            raise ValueError(key + " must be a list.")

def compare(source, target):
    validate(source)
    validate(target)
    differences = []
    for table in sorted(set(source["tables"]) | set(target["tables"])):
        a, b = source["tables"].get(table), target["tables"].get(table)
        if a != b:
            differences.append(("table", table, a, b))
    for key in ("users", "identities"):
        a, b = source["auth"][key], target["auth"][key]
        if a != b:
            differences.append(("auth", key, a, b))
    for key in ("buckets", "objects"):
        a, b = source["storage"][key], target["storage"][key]
        if a != b:
            differences.append(("storage", key, a, b))
    for key in ("routines", "extensions", "jobs"):
        a, b = sorted(set(source[key])), sorted(set(target[key]))
        if a != b:
            differences.append(("catalog", key, len(a), len(b)))
    return differences

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compare-manifests.py PRIVATE_SOURCE.json PRIVATE_TARGET.json")
    files = [Path(p).resolve() for p in sys.argv[1:]]
    if files[0] == files[1]:
        raise SystemExit("Source and target must be different files.")
    left, right = (json.loads(p.read_text(encoding="utf8")) for p in files)
    differences = compare(left, right)
    if differences:
        for kind, name, a, b in differences:
            print(f"DIFFERENCE {kind}: {name}: source={a}, target={b}")
        print(f"NO-GO: {len(differences)} structural/count mismatches. "
              "Business-value hashes and functional tests are also required.")
        raise SystemExit(1)
    print("PASS: catalog and counts agree. "
          "This is NOT a substitute for financial checksums, Auth logins, or RLS.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
