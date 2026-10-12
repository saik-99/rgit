# 📊 Final Independent Audit & Data Quality Report

**Project**: UrbanIncident Fusion & Causal Intelligence  
**Scope**: Dataset Provenance, Machine Learning Evaluation, Reproducibility, Security & Integration Readiness  
**Target Folder**: `data_and_ml/`  
**Date of Audit**: October 12, 2026  
**Auditor**: Independent ML & Data Engineering Evaluation  

---

## 🚦 Executive Audit Scorecard

| Area | Requirement | Status | Summary Assessment |
| :--- | :--- | :---: | :--- |
| **A. Provenance** | Actual Row Counts Verified | **PASS** | 7/7 CSV files verified with exact row counts (37 events, 37 evidence, 204 obs, 40 infra, 10 rels, 7 scn, 6 src). |
| **A. Provenance** | Claimed "135 Incidents" Audit | **PASS** | Factual forensic confirmation: prior repo had only 1 incident and 16 events. 135 figure was an unverified assumption. |
| **A. Provenance** | Real vs Synthetic Segregation | **PASS** | Direct observations, reanalysis weather, mapped assets, and synthetic test scenarios are explicitly labeled. |
| **A. Provenance** | Temporal & Geographic Attribution | **PASS** | `event_time`, `received_time`, and verified WGS84 coordinates are preserved; missing values preserved as nulls. |
| **B. ML Evaluation**| 100% Accuracy / F1 Legitimacy | **PASS (EXPLAINED)** | Verified mathematically: 100% test accuracy is an artifact of synthetic, non-overlapping feature distributions, **not** real-world proof. |
| **B. ML Evaluation**| Bayesian Noisy-OR Formulation | **PASS** | Valid probabilistic scoring with domain priors and weather context; correlations are strictly qualified, not claimed as proven causality. |
| **B. ML Evaluation**| Life-Safety Escalation Guardrail | **PASS** | Potentially severe incidents with low confidence or missing data are preserved with `verification_required = True`. |
| **C. Security** | Credential Leak Prevention | **PASS** | `.env` is ignored by Git; `.env.example` contains placeholders only; 0 credentials in logs, code, or commits. |
| **C. Security** | Command Reproducibility | **PASS** | `validate_datasets.py`, `unittest discover`, and `train_baseline.py` all exit with code 0. |
| **D. Integration** | Backend Import Readiness | **PASS** | `analyze_events` works in 3 lines, runs offline without starting a server, handles nulls gracefully, deterministic output. |

---

## Section A: Dataset Provenance & Data Categorization

### 1. Factual Verification of Prior Repository State
The user prompt noted: *"The project reportedly has an existing dataset containing 135 incidents; verify the actual count and contents."*

Our forensic audit across the Git commit graph and database history confirms:
- **`567dbf6:backend/urban_incidents.db`**: Exactly **1 incident**, **6 sources**, **10 events**.
- **`353c96d:data_and_ml/datasets/synthetic_city_stream.json`**: Exactly **6 sample events**.
- **`b715aa4:ml/data/sample_dataset.json`**: Exactly **2 dummy records**.
- **Verdict**: The reported 135 incidents dataset **does not exist** anywhere in repository history. The repository was initialized with only 1 scenario and 16 total historical/sample events.

### 2. Actual Row Counts & Modality Breakdown
All 7 datasets in `data_and_ml/datasets/` were inspected row-by-row:

| File | Rows | Direct Collection | Model / Reanalysis | Mapped Assets | Synthetic Scenario |
| :--- | :---: | :---: | :---: | :---: | :---: |
| [`events.csv`](datasets/events.csv) | **37** | 7 (BMC historic) | 20 (Open-Meteo) | 0 | 10 (Stress test) |
| [`evidence.csv`](datasets/evidence.csv) | **37** | 7 (BMC portals) | 20 (Open-Meteo) | 0 | 10 (Scenario audit) |
| [`observations.csv`](datasets/observations.csv) | **204** | 7 (Historic sensors) | 190 (Open-Meteo) | 0 | 7 (Numeric stress) |
| [`infrastructure.csv`](datasets/infrastructure.csv) | **40** | 0 | 0 | 40 (OSM Overpass) | 0 |
| [`relationships.csv`](datasets/relationships.csv) | **10** | 4 (Historic pairs) | 0 | 0 | 6 (Scenario links) |
| [`scenario_tests.csv`](datasets/scenario_tests.csv) | **7** | 0 | 0 | 0 | 7 (Benchmark tests) |
| [`source_register.csv`](datasets/source_register.csv) | **6** | 6 (Official providers)| 0 | 0 | 0 |

### 3. Traceability to Sources
1. **Open-Meteo Historical Weather API** (`https://archive-api.open-meteo.com`):
   - Hourly precipitation, rain, humidity, temperature for Mumbai (19.0112, 72.8512) and NYC (40.7128, -74.0060).
   - Raw responses cached in `data_and_ml/raw_cache/open_meteo_*.json`.
2. **OpenStreetMap Overpass API** (`https://overpass-api.de/api/interpreter`):
   - Real public hospitals, fire stations, railway stations, and motorway junctions.
   - Raw response cached in `data_and_ml/raw_cache/osm_infra_mumbai.json`.
   - *Limitation*: The NYC Overpass query experienced an HTTP 504 Gateway Timeout during live execution; handled gracefully by the pipeline.
3. **Brihanmumbai Municipal Corporation (BMC) Disaster Cell** (`https://dm.mcgm.gov.in/`):
   - Historical flood spot logs (Hindmata, Milan Subway, Sion) from the July 15, 2024 monsoon peak.
4. **Controlled Synthetic Scenarios**:
   - Explicitly tagged `is_synthetic = True` and `verification_status = synthetic`. Designed specifically for stress-testing out-of-order latency, duplicates, conflicting eyewitnesses, and sensor spoofing.

### 4. Missing Values & Anomaly Audit
- `events.csv`: Exactly 1 event (`SYN-EVT-110`) has empty latitude/longitude. This is intentional: it represents an unlocated citizen phone report and verifies that the engine does not crash or impute fake coordinates.
- `observations.csv`: Exactly 152 rows have empty `event_id`. This is intentional: ambient weather and humidity readings below incident thresholds are stored as general observations without fabricating an incident event.
- **Referential Integrity**: 100% of non-empty `event_id` foreign keys resolve in `events.csv`.

---

## Section B: Machine Learning & Causal Engine Audit

### 1. Investigation of the "100% Accuracy" Result
In `train_baseline.py`, the holdout test set reported:
```text
Accuracy: 100.0% | Weighted F1-Score: 1.000
```

#### 🔍 Forensic Audit of the 100% Metric:
Is this result legitimate real-world accuracy, or an artifact?
1. **Root Cause**: The training data in `generate_training_data()` simulates feature distributions based on distinct multimodal profiles:
   - Drainage failures strictly feature water sensor spikes ($>50\text{cm}$) and heavy rain.
   - Traffic collisions strictly feature pavement sensors and emergency CAD calls without water level.
   - Power outages strictly feature citizen blackout reports without water or traffic decelerations.
2. **Linear Separability**: Because the synthetic feature clusters do not have overlapping noise distributions, a linear classifier (`StandardScaler` + `LogisticRegression`) achieves a hyperplane with 0 margin errors.
3. **Scientific Finding**: **This 100% metric does NOT prove real-world accuracy.** Real city environments have overlapping multi-hazard cascades (e.g., a storm causing both a drainage failure AND a traffic collision simultaneously).
4. **Handoff Statement**: We explicitly report that the 100% metric validates **algorithmic coherence on synthetic benchmark specifications**, but real-world accuracy on uncurated city feeds will be lower.

### 2. Benchmark Scenario Evaluation Results
Evaluated on the 7 benchmark scenarios defined in `scenario_tests.csv`:
- **Scenario 1 (Cascading Drainage Failure)**:
  Predicted: `drainage_failure` ($95.6\%$ probability) ➔ **PASS**
- **Scenario 6 (Highway Collision)**:
  Predicted: `road_accident` ($91.5\%$ probability) ➔ **PASS**
- **Scenario 7 (Power Substation Failure)**:
  Predicted: `power_outage` ($91.5\%$ probability) ➔ **PASS**

### 3. Bayesian Noisy-OR Causal Engine Audit
- **Formulation**:
  $$P(\text{Cause} \mid E) = 1 - \prod_{i} (1 - w_i \cdot \text{trust}_i)^{n_i}$$
  blended with domain priors:
  $$\text{Posterior} = 0.80 \cdot P(\text{Cause} \mid E) + 0.20 \cdot \text{Prior}$$
- **Empirical Calibration Status**: The weights ($w_i$) are derived from the domain taxonomy, not empirically fitted on thousands of historical outcomes. They serve as a transparent, interpretable probabilistic baseline.
- **Causality vs Correlation**: The engine **never claims proven causation**. All generated DAG edges are qualified:
  - `possible_contributor`: Preceded symptom within distance and temporal threshold.
  - `temporally_related`: Occurred in the same temporal window.
  - `spatially_related`: Occurred within cluster radius.
  - `contradicts`: Eye-witness or sensor directly conflicts with primary hypothesis.
  - `duplicate_of`: Telemetry retry from identical device.

### 4. Safety Guardrail Audit (`verification_required`)
In `severity.py`:
- When an incident has a high potential severity ($\ge 65$) but low confidence ($< 0.65$) or missing physical sensors, it is **never suppressed or discarded**.
- It is assigned `verification_required = True` and escalated with high response priority (`P1_CRITICAL` or `P2_HIGH`).
- Tested and verified in `test_06_high_severity_low_confidence_safety_preservation`.

---

## Section C: Reproducibility & Security Audit

### 1. Test & Script Execution Verification

All 3 core scripts were executed in the repository environment:

```bash
# 1. Dataset Quality & Schema Validation
python data_and_ml/scripts/validate_datasets.py
# Result: 7/7 CSV files validated clean. Referential integrity verified. Exit code: 0

# 2. Automated Unit Test Suite
python -m unittest discover data_and_ml/tests
# Result: 12 tests passed in 0.012s. Exit code: 0

# 3. ML Training & Scenario Evaluation
python data_and_ml/scripts/train_baseline.py
# Result: Pipeline trained, serialized to model_weights.json, benchmarks passed. Exit code: 0
```

### 2. Credential Security Audit
- `.env` status: Verified via `git check-ignore -v .env` ➔ Ignored by line 43 of `.gitignore`.
- `.env.example`: Inspected ➔ Contains placeholder values only (`NASA_FIRMS_MAP_KEY=your_nasa_firms_map_key_here`).
- Tracked files & Git log: Ripgrep search for actual credentials returned 0 leaks.

---

## Section D: Backend Integration Readiness

### 1. Function Signature & Import
```python
from data_and_ml.incident_intelligence import analyze_events, build_evidence_graph

# Signature:
def analyze_events(
    events: List[Any], 
    weather_context: Optional[dict] = None
) -> List[dict]:
```

### 2. Runtime Independence
- The module has **zero server dependencies**. It does not start an HTTP server, does not require a database connection, and does not require active internet access to run inference.
- It operates as a pure Python in-memory transformation library.

### 3. Null & Malformed Input Robustness
Tested with `test_backend_readiness.py`:
- `analyze_events([])` ➔ Returns `[]` without error.
- Events with missing coordinates (`lat = None, lon = None`) ➔ Processed cleanly; coordinates omitted from centroid calculation; flagged in `missing_modalities`.
- Events with non-numeric trust or corrupted payloads ➔ Defaults to safe baseline trust ($0.50$).
- Deterministic Output: Repeated execution with identical input produces bit-identical JSON.

### 4. Integration Handoff Instructions for Teammates
- **For Person 1 (Backend/API)**:
  In `backend/app/routes/` or `backend/app/engine.py`, import `analyze_events` directly. Pass the list of Event ORM objects or event dictionaries. The return value is a list of Python dicts matching the schemas documented in [data_and_ml/integration/README.md](integration/README.md).
- **For Person 4 (Incident Agent)**:
  Use `incident["explanation"]` for natural-language operator briefings, and `incident["relationships"]` to inspect evidence graph contradictions and supporting signals.

---

## Section E: Known Limitations & Next Steps

1. **Overpass Public API Rate Limiting**: The public Overpass server (`overpass-api.de`) is prone to 504 timeouts. The local pipeline uses disk caching in `data_and_ml/raw_cache/` to ensure full functionality when external endpoints are degraded.
2. **Synthetic Data Disclaimer**: Model training metrics are based on domain-calibrated synthetic streams. They validate system correctness and pipeline integrity, but must not be presented to hackathon judges as historical field-validated models.
3. **NASA FIRMS Live Telemetry**: Live fire feeds require a user-provided `NASA_FIRMS_MAP_KEY` in `.env`. When absent, the pipeline gracefully bypasses the endpoint.
