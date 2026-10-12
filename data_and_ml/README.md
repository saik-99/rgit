# 🧠 Data, ML & Incident Intelligence Squad

**Assigned Owners**: Person 2 & Person 3  
**Domain**: Dataset Pipeline, Causal Graph Engine, Incident Intelligence, Benchmarks & Evaluation

---

## 🎯 Scope & Deliverables Overview

This module provides the core data ingestion, validation, spatiotemporal clustering, causal DAG inference, and operator explanation engine for **UrbanIncident Fusion & Causal Intelligence**.

It is designed to be cleanly imported by the **Backend (Person 1)** and the **Incident AI Agent (Person 4)** without requiring a separate server or interfering with teammates' code.

---

## 📁 Folder Structure

```text
data_and_ml/
├── DATA_DICTIONARY.md              # Complete schema & column definitions for all CSVs
├── DATA_QUALITY_REPORT.md          # Row counts, missing-value audit, API status, and limits
├── README.md                       # This file
├── datasets/                       # Final cleaned, traceable datasets
│   ├── events.csv                  # 37 rows (verified real + labeled synthetic events)
│   ├── evidence.csv                # 37 rows (verification status, source URLs, weights)
│   ├── observations.csv            # 204 rows (rainfall, water depth, traffic velocities)
│   ├── infrastructure.csv          # 40 rows (OSM hospitals, fire stations, junctions)
│   ├── relationships.csv           # 10 rows (qualified DAG relationships with latency/distance)
│   ├── scenario_tests.csv          # 7 rows (stress test scenarios for judge demos)
│   ├── source_register.csv         # 6 rows (licensing, endpoints, and attribution register)
│   ├── incident_vocabulary.json    # Incident taxonomy & symptom weights
│   └── synthetic_city_stream.json  # Legacy-compatible JSON event stream
├── incident_intelligence/          # Importable Python Intelligence Module
│   ├── __init__.py                 # Public API exports
│   ├── engine.py                   # IncidentIntelligenceEngine & analyze_events()
│   ├── models.py                   # NormalizedEvent, EvidenceRelationship, IncidentReport
│   ├── normalization.py            # Input validation, coordinate checking & timestamp parsing
│   ├── deduplication.py            # Exact fingerprint & fuzzy text deduplication
│   ├── clustering.py               # Spatiotemporal Haversine clustering with out-of-order support
│   ├── causal_engine.py            # Bayesian Noisy-OR formulation & qualified DAG builder
│   ├── severity.py                 # Multi-factor severity, priority (P1-P4), & completeness
│   └── explainer.py                # Human-readable operator narrative & action generator
├── integration/                    # Integration contract for Backend & AI Agent
│   ├── README.md                   # Integration guide & code snippets
│   ├── example_input.json          # Realistic multimodal test input stream
│   └── example_output.json         # Complete structured output with DAG & briefing
├── raw_cache/                      # Offline cache of raw API responses (Open-Meteo, OSM)
├── scripts/                        # Reproducible data collection & validation scripts
│   ├── collect_data.py             # Pulls live public APIs & regenerates all 7 datasets
│   └── validate_datasets.py        # Validates schemas, coordinates, nulls & referential integrity
└── tests/                          # Automated unit test suite
    ├── test_datasets.py            # Tests 7 CSV files for integrity & coordinate validity
    └── test_intelligence.py        # Tests duplicates, out-of-order, conflicts, safety guards
```

---

## ⚡ Quick Integration for Teammates

### Backend & Agent Import:
```python
from data_and_ml.incident_intelligence import analyze_events, build_evidence_graph

# Analyze batch or streaming events with optional weather context:
incidents = analyze_events(raw_events, weather_context={"current_rain_mm": 65.0})

for inc in incidents:
    print(inc["title"])                    # e.g. "Drainage / Waterlogging Failure — Hindmata"
    print(inc["primary_cause"])            # "drainage_failure"
    print(inc["cause_confidence"])         # 0.75
    print(inc["response_priority"])        # "P2_HIGH" (or "P1_CRITICAL")
    print(inc["verification_required"])    # True if high hazard requires field check
    print(inc["explanation"])              # Formatted briefing with supporting & conflicting signals
```

---

## 🔬 Key Data Quality Invariants

1. **No Invented Real-World Incidents**: All historical incidents are traceable to municipal bulletins (BMC / NYC Open Data). All benchmark test cases are strictly flagged `is_synthetic = True`.
2. **Missing Values Preserved**: Missing coordinates or sensor channels are preserved as empty values (`null`), never filled with zero or guessed values.
3. **Out-of-Order Robustness**: Events are sorted and correlated based on physical `event_time` rather than ingestion arrival `received_time`.
4. **Safety Verification Invariant**: Potentially severe incidents with low confidence or missing sensors are **never discarded**; they are assigned `verification_required = True` and escalated with high response priority.
5. **Qualified Causal Relationships**: Avoids dogmatic causation claims. Uses qualified relationship types: `possible_contributor`, `temporally_related`, `spatially_related`, `duplicate_of`, `contradicts`, `corroborates`.

---

## 🧪 Running Validation & Tests

```bash
# 1. Regenerate datasets from APIs / Cache:
python data_and_ml/scripts/collect_data.py

# 2. Validate all 7 CSV datasets:
python data_and_ml/scripts/validate_datasets.py

# 3. Run the automated test suite (12 tests):
python -m unittest discover data_and_ml/tests
```
