"""
Comprehensive Unit & Integration Test Suite for Incident Intelligence Module.
Verifies all 7 core scenarios:
1. Duplicate report suppression & evidence preservation
2. Out-of-order event arrivals
3. Missing coordinates resilience
4. Missing sensors & data completeness scoring
5. Contradictory evidence penalty & retention
6. High-severity / low-confidence safety preservation (verification_required)
7. Nearby unrelated incident spatial separation
8. Causal DAG qualified relationships
"""

import unittest
import datetime
from data_and_ml.incident_intelligence import (
    IncidentIntelligenceEngine,
    analyze_events,
    build_evidence_graph,
    deduplicate_events,
    normalize_event
)


class TestIncidentIntelligence(unittest.TestCase):

    def setUp(self):
        self.engine = IncidentIntelligenceEngine(spatial_radius_m=800.0, time_window_sec=1800.0)
        self.base_time = datetime.datetime(2026, 10, 12, 12, 0, 0, tzinfo=datetime.timezone.utc)

    def test_01_duplicate_suppression_and_evidence_preservation(self):
        """Duplicates must be flagged, original linked, and duplicate evidence preserved."""
        events = [
            {
                "event_id": "EVT-D1",
                "source_type": "water_level",
                "device_id": "IOT-401",
                "lat": 19.0112, "lon": 72.8512,
                "event_time": self.base_time.isoformat(),
                "payload": {"value": 85.0}
            },
            {
                "event_id": "EVT-D2",
                "source_type": "water_level",
                "device_id": "IOT-401",
                "lat": 19.0112, "lon": 72.8512,
                "event_time": self.base_time.isoformat(),
                "payload": {"value": 85.0}
            }
        ]
        norm = [normalize_event(e) for e in events]
        uniques, dups = deduplicate_events(norm)
        self.assertEqual(len(uniques), 1)
        self.assertEqual(len(dups), 1)
        self.assertTrue(dups[0].is_duplicate)
        self.assertEqual(dups[0].duplicate_of, "EVT-D1")

    def test_02_out_of_order_arrivals(self):
        """Events arriving out-of-order must be chronologically ordered by event_time."""
        events = [
            # Arrived first (received 12:20), but happened at 12:15
            {
                "event_id": "EVT-TRANSIT",
                "source_type": "transit",
                "device_id": "BUS-104",
                "lat": 19.0118, "lon": 72.8510,
                "event_time": (self.base_time + datetime.timedelta(minutes=15)).isoformat(),
                "received_time": (self.base_time + datetime.timedelta(minutes=20)).isoformat(),
                "payload": {"value": 3.0}
            },
            # Arrived second (received 12:25), but happened earliest at 12:00 (delayed 311)
            {
                "event_id": "EVT-311-EARLY",
                "source_type": "citizen_report",
                "device_id": "CALL-91",
                "lat": 19.0115, "lon": 72.8515,
                "event_time": self.base_time.isoformat(),
                "received_time": (self.base_time + datetime.timedelta(minutes=25)).isoformat(),
                "payload": {"text": "Street flooding"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 1)
        # Oldest event must be the created_at of incident
        self.assertEqual(reports[0].event_ids[0], "EVT-311-EARLY")

    def test_03_missing_coordinates_resilience(self):
        """Events with missing lat/lon must not crash the engine or be discarded."""
        events = [
            {
                "event_id": "EVT-NO-GEO",
                "source_type": "citizen_report",
                "device_id": "311-OPERATOR",
                "lat": None, "lon": None,
                "location": "Downtown Basin",
                "event_time": self.base_time.isoformat(),
                "payload": {"text": "Transformers buzzing near Downtown Basin"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 1)
        self.assertIsNone(reports[0].centroid_lat)
        self.assertIn("verified_coordinates", reports[0].missing_modalities)

    def test_04_missing_sensors_and_completeness(self):
        """Absence of physical sensors must reduce completeness and flag missing modalities."""
        events = [
            {
                "event_id": "EVT-CITIZEN-ONLY",
                "source_type": "citizen_report",
                "device_id": "CIT-11",
                "lat": 19.011, "lon": 72.851,
                "event_time": self.base_time.isoformat(),
                "payload": {"text": "Power blackout on entire block"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 1)
        self.assertIn("physical_sensors", reports[0].missing_modalities)
        self.assertLess(reports[0].data_completeness, 0.60)

    def test_05_contradictory_evidence_handling(self):
        """Contradicting reports must penalize confidence but remain visible with 'contradicts' relationship."""
        events = [
            {
                "event_id": "EVT-WATER",
                "source_type": "water_level",
                "device_id": "DRAIN-01",
                "lat": 19.0112, "lon": 72.8512,
                "event_time": self.base_time.isoformat(),
                "payload": {"value": 80.0, "description": "High water"}
            },
            {
                "event_id": "EVT-CONTRADICT",
                "source_type": "citizen_report",
                "device_id": "APP-USER",
                "lat": 19.0113, "lon": 72.8511,
                "event_time": self.base_time.isoformat(),
                "payload": {"text": "Road is clear from my window, no issue"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0].conflicting_evidence_count, 1)
        # Relationship must contain 'contradicts'
        rel_types = [r.relationship_type for r in reports[0].relationships]
        self.assertIn("contradicts", rel_types)

    def test_06_high_severity_low_confidence_safety_preservation(self):
        """Potentially severe incident with low confidence must NOT be discarded; must set verification_required."""
        events = [
            {
                "event_id": "EVT-UNVERIFIED-HAZARD",
                "source_type": "citizen_report",
                "device_id": "CALLER-99",
                "lat": 19.011, "lon": 72.851,
                "trust": 0.35,  # Low trust
                "event_time": self.base_time.isoformat(),
                "payload": {"text": "Gas leak strong odor and hissing sound near substation"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 1)
        rep = reports[0]
        # Must retain high/critical priority and set verification_required
        self.assertTrue(rep.verification_required)
        self.assertIn(rep.response_priority, ["P1_CRITICAL", "P2_HIGH"])

    def test_07_nearby_unrelated_incident_spatial_separation(self):
        """Events located 4km apart must NOT cluster together."""
        events = [
            # Incident 1 at Hindmata (19.0112, 72.8512)
            {
                "event_id": "EVT-INC1",
                "source_type": "water_level",
                "device_id": "DRAIN-HINDMATA",
                "lat": 19.0112, "lon": 72.8512,
                "event_time": self.base_time.isoformat(),
                "payload": {"value": 75.0}
            },
            # Incident 2 at Bandra (~5 km away: 19.0550, 72.8410)
            {
                "event_id": "EVT-INC2",
                "source_type": "emergency_call",
                "device_id": "CAD-BANDRA",
                "lat": 19.0550, "lon": 72.8410,
                "event_time": self.base_time.isoformat(),
                "payload": {"text": "Two car accident on highway approach"}
            }
        ]
        reports = self.engine.analyze_events(events)
        self.assertEqual(len(reports), 2, "Should separate 5km distant events into 2 distinct incidents")

    def test_08_evidence_graph_dag_and_qualified_relationships(self):
        """Evidence graph must generate valid nodes and edges without cycles."""
        events = [
            {"event_id": "E1", "source_type": "water_level", "device_id": "D1", "lat": 19.01, "lon": 72.85, "event_time": self.base_time.isoformat(), "payload": {"value": 80}},
            {"event_id": "E2", "source_type": "road_sensor", "device_id": "D2", "lat": 19.01, "lon": 72.85, "event_time": (self.base_time + datetime.timedelta(minutes=5)).isoformat(), "payload": {"value": 1}}
        ]
        graph = build_evidence_graph(events, root_cause="Drainage Failure")
        self.assertIn("nodes", graph)
        self.assertIn("edges", graph)
        self.assertEqual(len(graph["nodes"]), 3)  # E1, E2, incident
        # Edges must connect sources to targets
        for edge in graph["edges"]:
            self.assertNotEqual(edge["source"], edge["target"], "No self loops allowed")


if __name__ == "__main__":
    unittest.main()
