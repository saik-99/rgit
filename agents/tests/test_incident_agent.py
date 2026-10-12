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


class SocialAgent(unittest.TestCase):
    def setUp(self):
        from agents import run_social_agent
        self.out = run_social_agent(use_llm=False)

    def test_extracts_and_skips(self):
        self.assertEqual(len(self.out["skipped"]), 1)          # vada pav post ignored
        self.assertEqual(len(self.out["events"]), 7)

    def test_hindmata_flood(self):
        top = self.out["incidents"][0]
        self.assertEqual(top["root_cause"], "DrainageFailure")
        self.assertIn("Hindmata", top["location"])
        self.assertEqual(len(top["duplicates_removed"]), 1)    # retweet
        self.assertEqual(top["conflicts"][0]["verdict"], "outweighed")

    def test_rules_extraction(self):
        from agents.tools.social_tools import extract_rules
        r = extract_rules("Milan subway flooded, 3 feet water")
        self.assertEqual(r["signal"], "Citizen311FloodCall")
        self.assertEqual(r["depth_ft"], 3.0)
        self.assertEqual(extract_rules("nice weather in Pune"), {})


def backend_incident():
    """Shaped like Person 1's Incident.to_dict(include_events=True) for the Hindmata seed."""
    def e(i, src, minute, payload, dev, trust=0.9, verified=True, dup=False, anomaly=False):
        t = f"2026-07-15T04:{minute:02d}:00"
        return {"id": i, "source_type": src, "lat": 19.0112, "lon": 72.8512, "timestamp": t,
                "received_at": t, "payload": payload, "device_id": dev, "trust": trust,
                "signature_verified": verified, "is_duplicate": dup, "is_anomaly": anomaly}
    return {"id": 1, "cause": "drainage_failure", "cause_confidence": 0.91,
            "neighborhood": "Hindmata Junction, Parel, Mumbai", "events": [
        e(1, "water_level", 0, {"value": 78.5, "description": "Water level rising at Hindmata nallah"}, "IOT-DRAIN-HM01", 0.95),
        e(2, "water_level", 2, {"value": 82.3, "description": "Storm drain overflow confirmed"}, "IOT-DRAIN-HM02", 0.93),
        e(3, "road_sensor", 4, {"status": "submerged", "description": "Road surface underwater"}, "ROAD-HM-01", 0.88),
        e(4, "transit", 6, {"value": 3.2, "description": "BEST bus crawling due to waterlogging"}, "TRANSIT-BEST-104", 0.85, False),
        e(5, "citizen_report", 8, {"text": "Paani bhar gaya Hindmata pe! Cars stuck"}, "CIT-1", 0.6, False),
        e(6, "weather", 9, {"value": 85, "description": "Extremely heavy rainfall"}, "WX-1", 0.9),
        e(7, "citizen_report", 12, {"text": "Road looks clear from my window, no issue here at all."}, "CIT-2", 0.5, False),
        e(8, "water_level", 13, {"value": 78.5, "description": "Duplicate signal"}, "IOT-DRAIN-HM01", 0.95, dup=True),
    ]}


class TeamFormats(unittest.TestCase):
    """Agent must understand Person 1 (backend) and Person 2/3 (data_and_ml) event formats."""

    def test_signal_mapping(self):
        from agents.tools.normalize import map_signal
        self.assertEqual(map_signal("road_sensor", {"status": "submerged"}), "RoadInundation")
        self.assertEqual(map_signal("citizen_report", {"text": "no flooding at all, road is dry"}), "ConflictingReport")
        self.assertEqual(map_signal("citizen_report", {"text": "Paani bhar gaya"}), "Citizen311FloodCall")
        self.assertEqual(map_signal("seismic", {}), "SeismicActivity")

    def test_backend_incident(self):
        from agents import analyze_backend_incident
        r = analyze_backend_incident(backend_incident(), use_llm=False, use_ml=False)
        self.assertEqual(r["root_cause"], "DrainageFailure")
        self.assertTrue(r["agrees_with_engine"])
        self.assertEqual(r["conflicts"][0]["verdict"], "outweighed")
        self.assertEqual(r["duplicates_removed"][0]["flagged_by"], "upstream")

    def test_backend_explain_route_input(self):
        """Exactly what backend/app/routes/incidents.py /explain sends."""
        inc = backend_incident()
        r = analyze_incident({"incident_id": 1, "cause": "drainage_failure", "confidence": 0.91,
                              "events": inc["events"]}, use_llm=False, use_ml=False)
        self.assertEqual(r["root_cause"], "DrainageFailure")

    def test_data_and_ml_format(self):
        with open(os.path.join(ROOT, "data_and_ml", "integration", "example_input.json"),
                  encoding="utf-8") as f:
            events = json.load(f)
        r = analyze_incident({"events": events}, use_llm=False, use_ml=False)
        self.assertEqual(r["root_cause"], "DrainageFailure")
        self.assertEqual(len(r["conflicts"]), 1)

    def test_engine_disagreement_is_reported(self):
        inc = backend_incident()
        inc["cause"] = "earthquake"
        from agents import analyze_backend_incident
        r = analyze_backend_incident(inc, use_llm=False, use_ml=False)
        self.assertFalse(r["agrees_with_engine"])
        self.assertTrue(any("backend engine suggests" in x for x in r["uncertainty_reasons"]))

    def test_ml_engine_never_crashes_agent(self):
        """Whether or not data_and_ml imports cleanly, the agent must still answer."""
        r = analyze_incident({"events": backend_incident()["events"]}, use_llm=False, use_ml=True)
        self.assertEqual(r["root_cause"], "DrainageFailure")
        self.assertIn(r["agrees_with_ml"], (True, False, None))


if __name__ == "__main__":
    unittest.main()
