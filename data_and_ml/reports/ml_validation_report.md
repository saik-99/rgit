# 🔬 Machine Learning Validation & Reliability Audit Report

**Project**: UrbanIncident Fusion & Causal Intelligence  
**Module**: Incident Intelligence Baseline Model (`data_and_ml.scripts.train_baseline`)  
**Auditor**: Senior ML Validation Engineer  
**Audit Timestamp**: 2026-10-12 13:30:18 UTC  

---

## 1. Executive Summary & Root-Cause of 100% Metric

### 🔍 Why did the initial baseline report 100% Accuracy and Weighted F1 = 1.000?
Our mathematical and data-flow investigation identified the precise technical reasons for the perfect test score:

1. **Synthetic Linearly Separable Distributions**:
   In `generate_training_data()`, feature generation functions use prescriptive, non-overlapping bounds:
   - `drainage_failure` exclusively receives `water_level_count` $\in [1, 3]$ and `max_water_val` $\in [50.0, 110.0]$.
   - `road_accident` strictly has `water_level_count = 0` and `emergency_call_count` $\in [1, 2]$.
   - `power_outage` strictly has `citizen_report_count` $\in [2, 4]$ and `water_level_count = 0`.
   - `road_blockage` strictly has `emergency_call_count = 0` and `transit_count` $\in [1, 3]$.
   - `gas_leak_hazard` strictly has `emergency_call_count` $\in [2, 3]$ and `transit_count = 0`.
2. **Target Leakage via Domain Rules**:
   Feature 0 (`water_level_count > 0`) yields `drainage_failure` with **$P(\text{label} \mid \text{water} > 0) = 1.000$**. Mutual information between `max_water_val` and the target is 0.5347.
3. **Absence of Real-World Multi-Hazard Overlap**:
   In a real municipal disaster, a rainstorm causes flooding, traffic collisions, and power grid trips simultaneously. In the synthetic dataset, each event cluster represents a single isolated hazard category.
4. **Conclusion**:
   **The 100% score validates that the classifier has successfully learned the deterministic synthetic generator rules. It does NOT establish real-world predictive accuracy, generalization, or robustness under real-world noise.**

---

## 2. Dataset Composition & Provenance Breakdown

| Category | Sample / Record Count | Description & Provenance |
| :--- | :---: | :--- |
| **Authentic Production Events (`events.csv`)** | **52 records** | **100% authentic real-world records** across Mumbai (7 flood telemetry/dispatch) and NYC (40 authentic NYC 311 citizen requests, 5 weather). |
| **Authentic Evidence Links (`evidence.csv`)** | **52 records** | Traceable evidence references linked to official municipal and weather APIs. |
| **Authentic Physical Observations (`observations.csv`)** | **101 records** | Real Open-Meteo weather reanalysis (Mumbai & NYC) + BMC, BEST, and CAD telemetry. |
| **Mapped Infrastructure Nodes (`infrastructure.csv`)** | **48 assets** | Real OpenStreetMap Overpass verified hospitals, fire stations, junctions (Mumbai & NYC). |
| **Quarantined Synthetic Fixtures (`fixtures/synthetic/`)** | **10 events / 7 scenarios** | Quarantined strictly for isolated edge-case testing (missing coords, contradictions, out-of-order). |
| **Synthetic ML Training Samples** | 260 clusters | 10-dimensional controlled vectors used exclusively to audit algorithm mechanics. |

> **Critical Data Limitation**: While the repository now contains **52 authentic multi-city records and 48 infrastructure nodes**, there is only **1 independently verified historical multi-modal ground-truth labeled incident cluster** (Mumbai Hindmata Monsoon Flood). NYC 311 records are raw citizen service requests lacking confirmed 5-class disaster labels. Supervised real-world multi-class training is therefore **unvalidated / scientifically infeasible with current verified labels**.

---

## 3. Class Counts & Random Seeds

- **Random Seed**: `42` (fixed across NumPy, train/test split, and StratifiedKFold).
- **Class Distribution (N = 260)**:
  - `drainage_failure`: 60 samples (23.1%)
  - `road_accident`: 60 samples (23.1%)
  - `power_outage`: 50 samples (19.2%)
  - `road_blockage`: 50 samples (19.2%)
  - `gas_leak_hazard`: 40 samples (15.4%)

---

## 4. Multi-Method Validation Results

### Method A: Stratified Random Split (80% Train, 20% Test, N_test = 52)
- **Accuracy**: `100.0%`
- **Macro F1-Score**: `1.0000`
- **Weighted F1-Score**: `1.0000`
- **Precision (Weighted)**: `1.0000`
- **Recall (Weighted)**: `1.0000`

#### Detailed Classification Report:
```text
                  precision    recall  f1-score   support

drainage_failure      1.000     1.000     1.000        12
   road_accident      1.000     1.000     1.000        12
    power_outage      1.000     1.000     1.000        10
   road_blockage      1.000     1.000     1.000        10
 gas_leak_hazard      1.000     1.000     1.000         8

        accuracy                          1.000        52
       macro avg      1.000     1.000     1.000        52
    weighted avg      1.000     1.000     1.000        52

```

#### Confusion Matrix:
```text
Rows: Actual [drainage, accident, power, blockage, gas_leak]
Cols: Predicted [drainage, accident, power, blockage, gas_leak]
  [12, 0, 0, 0, 0]
  [0, 12, 0, 0, 0]
  [0, 0, 10, 0, 0]
  [0, 0, 0, 10, 0]
  [0, 0, 0, 0, 8]
```

---

### Method B: 5-Fold Stratified Cross-Validation (N = 260)
To test whether the 80/20 test split was an artifact of an easy random partition:
- **Fold Accuracies**: `[0.9615, 1.0, 1.0, 1.0, 0.9808]`
- **Mean CV Accuracy**: `98.8% (+/- 0.0154)`
- **Mean CV Macro F1**: `0.9876 (+/- 0.0161)`

*Observation*: Cross-validation demonstrates near-perfect stability (mean 98.8% accuracy across folds) because synthetic classes occupy isolated hyper-rectangles in feature space with only minor fold boundary effects.

---

### Method C: Out-of-Sample Project Benchmark Scenario Evaluation
The model was tested directly against the actual project scenario records:

| Scenario / Case | Expected Cause | Model Predicted | Probability | Status |
| :--- | :--- | :--- | :---: | :---: |
| Stress Scenario 1: Cascading Drainage Failure | `drainage_failure` | `drainage_failure` | 49.9% | ✅ PASS |
| Stress Scenario 6: Highway Collision | `road_accident` | `road_accident` | 91.3% | ✅ PASS |
| Stress Scenario 7: Power Substation Sparking | `power_outage` | `power_outage` | 54.4% | ✅ PASS |
| Authentic Real Case: Mumbai Hindmata Monsoon Flood | `drainage_failure` | `drainage_failure` | 100.0% | ✅ PASS |

- **Result**: The trained pipeline correctly classifies **100% of the project benchmark test scenarios**, including the historical Mumbai flood.

---

### Method D: Grouped Validation Feasibility Assessment
- **Status**: **NOT PERFORMED (Scientifically Infeasible)**
- **Reason**: A GroupKFold or GroupShuffleSplit requires samples grouped by distinct incident or scenario IDs. Because the 260 synthetic training samples were generated as independent clusters, and the project only has 7 scenario clusters and 1 real incident, grouping by incident ID would result in a dataset of size N=8. Splitting an N=8 dataset across 5 classes results in classes with 0 training samples. Forcing a grouped split on synthetic data would be statistically invalid.

---

## 5. Causal Bayesian Noisy-OR Model Audit

In addition to the supervised classifier, the project implements a Bayesian Noisy-OR engine in `causal_engine.py`:
1. **Model Formulation**:
   $$P(\text{Cause} \mid E) = 1 - \prod_{i} (1 - w_i \cdot \text{trust}_i)^{n_i}$$
2. **Prior & Likelihood Calibration**:
   - The weights ($w_i$) and priors are derived from the domain incident taxonomy (`INCIDENT_TAXONOMY`), not empirically fitted on historical municipal outcomes.
   - Probabilities are heuristic confidence scores, not empirically calibrated frequentist probabilities.
3. **Correlation vs Causation**:
   - The engine does not assert proven causation. It generates qualified DAG edges (`possible_contributor`, `temporally_related`, `spatially_related`, `contradicts`, `corroborates`).

---

## 6. What Additional Data is Needed for True Real-World Validation?

To transition from synthetic proof-of-concept to production real-world validation, the team requires:
1. **Multi-Incident Historical Archive**: At least 300+ labeled historical municipal incident records with raw CAD dispatch times, 311 citizen logs, and sensor feeds.
2. **True Class Overlap / Concurrency**: Data containing multi-hazard cascades (e.g. storm causing flooding AND traffic collisions on the same road).
3. **Adversarial Noise & Calibration Data**: False alarms, sensor drift, and human misreporting rates from municipal operations.

---

## 7. Final Conclusions & Safe Claims

### 🟢 What CAN be Claimed:
- The ML pipeline (`StandardScaler` + `LogisticRegression`) is mathematically correct, fully reproducible, and free of runtime errors.
- The pipeline correctly classifies 100% of the project's designed benchmark scenarios (`scenario_tests.csv`) and the historical Mumbai flood case.
- The Bayesian causal engine generates qualified DAG relationships and enforces life-safety guardrails (`verification_required: True`).

### 🔴 What CANNOT be Claimed:
- The 100% accuracy metric must **not** be presented as real-world predictive performance.
- The posterior confidence scores must **not** be presented as empirically calibrated real-world probabilities.
- Causal correlations must **not** be described as proven physical causality.
