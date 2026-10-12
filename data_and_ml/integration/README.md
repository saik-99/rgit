# 🔌 Incident Intelligence Integration Guide

> **For Person 1 (Backend/API) & Person 4 (Incident Agent)**  
> **Domain**: `data_and_ml.incident_intelligence`

This module provides a standalone, fully typed, zero-overhead Python API for multimodal event normalization, deduplication, spatiotemporal clustering, causal graph inference, and operator briefing generation.

---

## ⚡ Quick Start (3 Lines of Code)

```python
from data_and_ml.incident_intelligence import analyze_events

# Pass raw list of dictionaries, backend Event objects, or JSON records:
incident_reports = analyze_events(raw_events, weather_context={"current_rain_mm": 65.0})

# incident_reports is a list of structured dicts:
for inc in incident_reports:
    print(inc["title"])
    print(inc["primary_cause"], inc["cause_confidence"])
    print(inc["response_priority"])      # e.g., P1_CRITICAL, P2_HIGH
    print(inc["data_completeness"])      # e.g., 0.85
    print(inc["verification_required"])  # True if life-safety risk with low sensor confidence
    print(inc["explanation"])            # Markdown-formatted operator briefing
```

---

## 🏗️ Core API Reference

### 1. `IncidentIntelligenceEngine`
```python
from data_and_ml.incident_intelligence import IncidentIntelligenceEngine

engine = IncidentIntelligenceEngine(
    spatial_radius_m=800.0,   # Cluster radius in meters
    time_window_sec=1800.0    # Temporal linkage window (30 minutes)
)
reports = engine.analyze_events(events, weather_context=None)
```

### 2. `build_evidence_graph(events, root_cause)`
Generates frontend-ready nodes and edges for DAG visualization (Cytoscape / D3 / Leaflet):
```python
from data_and_ml.incident_intelligence import build_evidence_graph

graph = build_evidence_graph(events, root_cause="Drainage / Waterlogging Failure")
# Returns: {"nodes": [...], "edges": [...]}
```

---

## 📄 Schemas & Examples

- **Sample Input**: [example_input.json](example_input.json)
- **Sample Output**: [example_output.json](example_output.json)

### Output Fields per Incident:
| Field | Type | Description |
| :--- | :--- | :--- |
| `incident_id` | `str` | Unique cluster identifier (e.g. `INCIDENT-001`) |
| `title` | `str` | Human-readable title (e.g. `Drainage / Waterlogging Failure — Hindmata`) |
| `primary_cause` | `str` | Inferred root cause ID (`drainage_failure`, `road_accident`, etc.) |
| `cause_confidence` | `float` | Bayesian probability (0.05 to 0.99) adjusted for trust & conflicts |
| `cause_ranking` | `list[dict]` | Ranked probabilities for all 5 vocabulary causes |
| `severity_score` | `int` | Severity index from 0 to 100 |
| `severity_level` | `str` | `critical`, `high`, `medium`, `low` |
| `response_priority` | `str` | Operational priority: `P1_CRITICAL`, `P2_HIGH`, `P3_MEDIUM`, `P4_LOW` |
| `data_completeness` | `float` | Score (0.0 to 1.0) evaluating coordinates, sensors, eyewitnesses, weather |
| `verification_required`| `bool` | **Safety Invariant**: Flagged True when high severity has unconfirmed signals |
| `centroid_lat` / `lon` | `float` | Calculated geospatial cluster centroid |
| `radius_m` | `float` | Bounding radius in meters |
| `relationships` | `list[dict]` | Qualified DAG relationships (`possible_contributor`, `contradicts`, etc.) |
| `explanation` | `str` | Markdown-formatted operator briefing |
| `recommended_actions`| `list[str]` | Actionable municipal response directives |

---

## 🛡️ Qualified Relationship Types
Rather than asserting unproven causation, relationships use strict semantics:
- `possible_contributor`: Signal A preceded Symptom B within spatial and temporal proximity.
- `temporally_related`: Events occurred in the same temporal window.
- `spatially_related`: Events occurred in the same geospatial radius.
- `duplicate_of`: Telemetry retransmission or near-duplicate report from same device.
- `contradicts`: Eye-witness or sensor report directly disputes the primary hypothesis.
- `corroborates`: Independent modality supports the primary hypothesis.
