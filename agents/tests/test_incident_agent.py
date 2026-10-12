"""Run with:  python -m unittest discover -s agents/tests -t ."""
import json
import os
import unittest

from agents import analyze_incident, run_agent

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ev(eid, t, src, dev, sig, verified=True, conf=0.9, recv=None, text=None):
    e = {"event_id": eid, "timestamp": t, "received_at": recv or t, "source_type": src,
         "device_id": dev, "signal": sig, "integrity_verified": verified,
         "confidence": conf, "location": {"neighborhood": "Test Zone"}}
    if text:
        e["text"] = text
    return e


class Scenario1Drainage(unittest.TestCase):
    """Out-of-order + duplicate + conflicting report (team's synthetic stream)."""

    def setUp(self):
        with open(os.path.join(ROOT, "data_and_ml", "datasets",
                               "synthetic_city_stream.json"), encoding="utf-8") as f:
            self.r = analyze_incident({"events": json.load(f)}, use_llm=False)

    def test_root_cause(self):
        self.assertEqual(self.r["root_cause"], "DrainageFailure")
        self.assertGreater(self.r["confidence"], 0.75)

    def test_duplicate_and_late(self):
        self.assertEqual(len(self.r["duplicates_removed"]), 1)
        self.assertEqual(self.r["late_arrivals"][0]["event_id"], "EVT-1004")
        self.assertEqual(self.r["timeline"][0]["event_id"], "EVT-1004")  # true first

    def test_conflict_outweighed(self):
        self.assertEqual(self.r["conflicts"][0]["verdict"], "outweighed")


class Scenario2Collision(unittest.TestCase):
    def test_collision_with_road_clear_report(self):
        r = analyze_incident({"events": [
            ev("C1", "2026-10-12T09:00:00Z", "Traffic_Camera", "CAM-7", "CameraCrashDetection"),
            ev("C2", "2026-10-12T09:01:00Z", "Citizen_911", "CALL-1", "Citizen911EmergencyCall",
               verified=False, conf=0.8),
            ev("C3", "2026-10-12T09:02:00Z", "Citizen_App_Report", "APP-9", "ConflictingReport",
               verified=False, conf=0.5, text="Road is clear"),
        ]}, use_llm=False)
        self.assertEqual(r["root_cause"], "TrafficCollision")
        self.assertEqual(len(r["conflicts"]), 1)
        self.assertTrue(r["uncertainty_reasons"])


class Scenario3Tampering(unittest.TestCase):
    def test_single_sensor_contradicted(self):
        r = analyze_incident({"events": [
            ev("T1", "2026-10-12T11:00:00Z", "IoT_Water_Sensor", "IOT-DRAIN-9", "WaterLevelSpike"),
            ev("T2", "2026-10-12T11:01:00Z", "Traffic_Camera", "CAM-3", "ConflictingReport",
               conf=0.9, text="Dry road, normal traffic"),
            ev("T3", "2026-10-12T11:02:00Z", "Weather_Feed", "WX-1", "ConflictingReport",
               conf=0.9, text="No rainfall"),
        ]}, use_llm=False)
        issues = [f["issue"] for f in r["integrity_flags"]]
        self.assertIn("possible_tampering", issues)
        self.assertLess(r["confidence"], 0.6)
        self.assertIn("Quarantine", r["recommended_actions"][0])


class Interface(unittest.TestCase):
    def test_run_agent_shape(self):
        out = run_agent("Explain", {"incident": {"events": [
            ev("X1", "2026-10-12T08:00:00Z", "Grid", "SUB-1", "SubstationVoltageDrop")]}})
        self.assertIn("response", out)
        self.assertIsInstance(out["steps_taken"], list)

    def test_empty(self):
        self.assertIn("error", analyze_incident({}))


if __name__ == "__main__":
    unittest.main()
