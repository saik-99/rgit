"""
Automated Data Quality & Schema Validation Script.
Validates:
- events.csv
- evidence.csv
- observations.csv
- infrastructure.csv
- relationships.csv
- scenario_tests.csv
- source_register.csv

Checks schema conformance, referential integrity, timestamp formats,
geospatial coordinate bounds, missingness rates, and synthetic labeling.
"""

import csv
import json
import re
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = BASE_DIR / "datasets"

REQUIRED_SCHEMAS = {
    "events.csv": [
        "event_id", "type", "description", "event_time", "received_time",
        "location", "latitude", "longitude", "city", "country",
        "source_reference", "is_synthetic", "data_type", "trust", "signature_verified"
    ],
    "evidence.csv": [
        "evidence_id", "event_id", "source_name", "source_type", "source_url",
        "publication_time", "verification_status", "evidence_nature", "confidence_weight", "notes"
    ],
    "observations.csv": [
        "observation_id", "event_id", "variable_name", "value", "unit",
        "data_type", "latitude", "longitude", "timestamp", "provider", "is_synthetic"
    ],
    "infrastructure.csv": [
        "infrastructure_id", "name", "type", "latitude", "longitude",
        "city", "country", "source", "tags", "is_synthetic"
    ],
    "relationships.csv": [
        "relationship_id", "source_id", "target_id", "relationship_type",
        "time_difference_sec", "geographic_distance_m", "evidence_summary",
        "confidence", "alternative_explanations"
    ],
    "scenario_tests.csv": [
        "scenario_id", "name", "category", "description",
        "events_injected", "expected_root_cause", "expected_behavior", "notes"
    ],
    "source_register.csv": [
        "provider", "dataset_name", "source_url", "collection_date",
        "access_requirements", "license_and_attribution", "notes"
    ]
}

QUALIFIED_RELATIONSHIP_TYPES = {
    "possible_contributor", "temporally_related", "spatially_related",
    "duplicate_of", "contradicts", "corroborates"
}


def parse_iso(ts_str: str) -> bool:
    if not ts_str:
        return True  # empty/missing
    try:
        # replace trailing Z with +00:00 for fromisoformat
        s = ts_str.replace("Z", "+00:00")
        datetime.datetime.fromisoformat(s)
        return True
    except Exception:
        return False


def run_validation():
    print("=" * 70)
    print("UrbanIncident Fusion: Running Comprehensive Data Quality Validation")
    print("=" * 70)

    report = {"files": {}, "summary": {"total_files": len(REQUIRED_SCHEMAS), "passed": 0, "errors": []}}
    event_ids = set()

    # 1. Validate Schema and Rows for Each File
    for filename, expected_cols in REQUIRED_SCHEMAS.items():
        filepath = DATASETS_DIR / filename
        file_metrics = {
            "exists": filepath.exists(),
            "row_count": 0,
            "column_count": len(expected_cols),
            "missing_values_by_col": {col: 0 for col in expected_cols},
            "errors": []
        }

        if not filepath.exists():
            file_metrics["errors"].append(f"File not found: {filename}")
            report["files"][filename] = file_metrics
            report["summary"]["errors"].append(f"Missing file: {filename}")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            actual_cols = reader.fieldnames or []

            # Check header
            missing_cols = set(expected_cols) - set(actual_cols)
            if missing_cols:
                err = f"Missing columns in {filename}: {missing_cols}"
                file_metrics["errors"].append(err)
                report["summary"]["errors"].append(err)

            rows = list(reader)
            file_metrics["row_count"] = len(rows)

            for i, r in enumerate(rows, start=1):
                # Tally nulls/missing values
                for col in expected_cols:
                    val = r.get(col, "")
                    if val is None or val.strip() == "":
                        file_metrics["missing_values_by_col"][col] += 1

                # Specific checks by file
                if filename == "events.csv":
                    eid = r.get("event_id")
                    if eid:
                        event_ids.add(eid)
                    lat = r.get("latitude")
                    lon = r.get("longitude")
                    if lat and lat.strip():
                        try:
                            lat_f = float(lat)
                            if not (-90.0 <= lat_f <= 90.0):
                                file_metrics["errors"].append(f"Row {i}: Latitude {lat_f} out of range [-90, 90]")
                        except ValueError:
                            file_metrics["errors"].append(f"Row {i}: Invalid float latitude: '{lat}'")
                    if lon and lon.strip():
                        try:
                            lon_f = float(lon)
                            if not (-180.0 <= lon_f <= 180.0):
                                file_metrics["errors"].append(f"Row {i}: Longitude {lon_f} out of range [-180, 180]")
                        except ValueError:
                            file_metrics["errors"].append(f"Row {i}: Invalid float longitude: '{lon}'")

                    if not parse_iso(r.get("event_time", "")):
                        file_metrics["errors"].append(f"Row {i}: Invalid event_time ISO: '{r.get('event_time')}'")
                    if not parse_iso(r.get("received_time", "")):
                        file_metrics["errors"].append(f"Row {i}: Invalid received_time ISO: '{r.get('received_time')}'")

                elif filename == "relationships.csv":
                    rtype = r.get("relationship_type", "")
                    if rtype not in QUALIFIED_RELATIONSHIP_TYPES:
                        file_metrics["errors"].append(f"Row {i}: Unqualified relationship_type '{rtype}'")

                elif filename == "infrastructure.csv":
                    lat = r.get("latitude")
                    lon = r.get("longitude")
                    if lat:
                        try:
                            lat_f = float(lat)
                            if not (-90.0 <= lat_f <= 90.0):
                                file_metrics["errors"].append(f"Row {i}: Invalid infra latitude {lat_f}")
                        except ValueError:
                            file_metrics["errors"].append(f"Row {i}: Non-numeric infra latitude '{lat}'")

        if not file_metrics["errors"]:
            report["summary"]["passed"] += 1
            print(f"[PASS] {filename:<22} | Rows: {file_metrics['row_count']:<4} | Validated Clean")
        else:
            print(f"[FAIL] {filename:<22} | Rows: {file_metrics['row_count']:<4} | Errors: {len(file_metrics['errors'])}")
            for e in file_metrics["errors"][:3]:
                print(f"       -> {e}")

        report["files"][filename] = file_metrics

    # 2. Check Referential Integrity
    print("-" * 70)
    print("Checking Referential Integrity across datasets...")
    ref_errors = []

    # Check evidence.csv references
    ev_file = DATASETS_DIR / "evidence.csv"
    if ev_file.exists():
        with open(ev_file, "r", encoding="utf-8") as f:
            for i, r in enumerate(csv.DictReader(f), start=1):
                eid = r.get("event_id")
                if eid and eid not in event_ids:
                    ref_errors.append(f"evidence.csv row {i}: event_id '{eid}' not found in events.csv")

    # Check observations.csv references (optional linkage to event_id)
    obs_file = DATASETS_DIR / "observations.csv"
    if obs_file.exists():
        with open(obs_file, "r", encoding="utf-8") as f:
            for i, r in enumerate(csv.DictReader(f), start=1):
                eid = r.get("event_id")
                if eid and eid.strip() and eid not in event_ids:
                    ref_errors.append(f"observations.csv row {i}: event_id '{eid}' not found in events.csv")

    if not ref_errors:
        print("[PASS] Referential integrity confirmed: All event_id foreign keys resolve in events.csv.")
    else:
        print(f"[FAIL] Referential integrity issues found: {len(ref_errors)}")
        for e in ref_errors[:5]:
            print(f"       -> {e}")

    # 3. Check Synthetic Quarantine & Real-World Purity
    print("-" * 70)
    print("Checking Synthetic Quarantine & Real-World Purity...")
    prod_events_file = DATASETS_DIR / "events.csv"
    syn_count = 0
    cities_found = set()
    if prod_events_file.exists():
        with open(prod_events_file, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if str(r.get("is_synthetic", "")).lower() in ("true", "1"):
                    syn_count += 1
                if r.get("city"):
                    cities_found.add(r.get("city"))

    if syn_count == 0:
        print(f"[PASS] Synthetic Quarantine Enforced: Zero synthetic records in production events.csv.")
    else:
        print(f"[FAIL] Synthetic Contamination Detected: {syn_count} synthetic events found in production events.csv!")
        report["summary"]["errors"].append(f"{syn_count} synthetic events in production")

    # 4. Multi-City Geographic Coverage
    if len(cities_found) >= 2:
        print(f"[PASS] Multi-City Architecture Confirmed: Authentic records across {sorted(list(cities_found))}.")
    else:
        print(f"[WARN] Limited Geographic Diversity: Only {cities_found} present in production.")

    print("=" * 70)
    print(f"Validation Complete: {report['summary']['passed']}/{report['summary']['total_files']} files passed without error.")
    print("=" * 70)
    return report


if __name__ == "__main__":
    run_validation()
