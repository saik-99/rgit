"""
Automated unit tests validating dataset files:
- events.csv
- evidence.csv
- observations.csv
- infrastructure.csv
- relationships.csv
- scenario_tests.csv
- source_register.csv
"""

import unittest
import csv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = BASE_DIR / "datasets"


class TestDatasetFiles(unittest.TestCase):

    def test_all_seven_csv_files_exist_and_non_empty(self):
        expected_files = [
            "events.csv", "evidence.csv", "observations.csv",
            "infrastructure.csv", "relationships.csv",
            "scenario_tests.csv", "source_register.csv"
        ]
        for fname in expected_files:
            fpath = DATASETS_DIR / fname
            self.assertTrue(fpath.exists(), f"Missing dataset file: {fname}")
            with open(fpath, "r", encoding="utf-8") as f:
                rows = list(csv.reader(f))
                self.assertGreater(len(rows), 1, f"File {fname} is empty or only has header")

    def test_referential_integrity(self):
        """All event_id foreign keys must exist in events.csv."""
        events_path = DATASETS_DIR / "events.csv"
        evidence_path = DATASETS_DIR / "evidence.csv"
        obs_path = DATASETS_DIR / "observations.csv"

        with open(events_path, "r", encoding="utf-8") as f:
            event_ids = set(r["event_id"] for r in csv.DictReader(f))

        with open(evidence_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.assertIn(r["event_id"], event_ids, f"Orphaned event_id in evidence.csv: {r['event_id']}")

        with open(obs_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                eid = r.get("event_id")
                if eid and eid.strip():
                    self.assertIn(eid, event_ids, f"Orphaned event_id in observations.csv: {eid}")

    def test_coordinate_validity(self):
        """Latitude must be in [-90, 90] and longitude in [-180, 180] when present."""
        events_path = DATASETS_DIR / "events.csv"
        with open(events_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                lat = r.get("latitude")
                lon = r.get("longitude")
                if lat and lat.strip():
                    self.assertTrue(-90.0 <= float(lat) <= 90.0, f"Out of bounds lat: {lat}")
                if lon and lon.strip():
                    self.assertTrue(-180.0 <= float(lon) <= 180.0, f"Out of bounds lon: {lon}")

    def test_synthetic_quarantine_in_production(self):
        """Production events.csv must be 100% authentic with zero synthetic records."""
        events_path = DATASETS_DIR / "events.csv"
        with open(events_path, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.assertFalse(
                    r.get("event_id", "").startswith("SYN-"),
                    f"Synthetic event {r['event_id']} found in production dataset!"
                )
                self.assertEqual(
                    r.get("is_synthetic", "").lower(), "false",
                    f"Production record {r['event_id']} must have is_synthetic=False"
                )

    def test_synthetic_fixtures_isolated_in_test_directory(self):
        """Synthetic stress-test fixtures must be preserved in tests/fixtures/synthetic/."""
        fixtures_dir = BASE_DIR / "tests" / "fixtures" / "synthetic"
        syn_events_file = fixtures_dir / "events_synthetic.csv"
        scen_tests_file = fixtures_dir / "scenario_tests.csv"

        self.assertTrue(syn_events_file.exists(), "Missing quarantined synthetic events fixture")
        self.assertTrue(scen_tests_file.exists(), "Missing quarantined scenario tests fixture")

        with open(syn_events_file, "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
            self.assertGreaterEqual(len(rows), 10, "Quarantined synthetic events fixture must contain at least 10 records")

    def test_multi_city_coverage(self):
        """Production datasets must contain authentic records across multiple cities (Mumbai and NYC)."""
        events_path = DATASETS_DIR / "events.csv"
        infra_path = DATASETS_DIR / "infrastructure.csv"

        with open(events_path, "r", encoding="utf-8") as f:
            event_cities = set(r.get("city") for r in csv.DictReader(f))
            self.assertIn("Mumbai", event_cities)
            self.assertIn("New York", event_cities)

        with open(infra_path, "r", encoding="utf-8") as f:
            infra_cities = set(r.get("city") for r in csv.DictReader(f))
            self.assertIn("Mumbai", infra_cities)
            self.assertIn("New York", infra_cities)


if __name__ == "__main__":
    unittest.main()
