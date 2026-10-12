# UrbanIncident Fusion: Data & ML Module Report

## 1. Executive Summary (The Big Picture)

Cities deal with thousands of disorganized alerts every day—from 311 calls and flood sensors to traffic feeds and social media posts. 

In the **Data and ML** track, we built an end-to-end, production-ready pipeline that:
1. **Ingests real city data** from open municipal and environmental APIs (NYC 311, Austin 311, USGS, NASA FIRMS, Open-Meteo).
2. **Defends against data poisoning** with a cryptographic **SHA-256 Ingestion Gate** at the front door.
3. **Fuses chaotic multi-source feeds** into unified incidents using **Spatiotemporal Clustering**.
4. **Discovers root causes** using **Causal Inference Graph modeling** (e.g., proving whether a storm caused a power outage or vice-versa).
5. **Explains findings in plain language** with automated incident narratives for emergency operators.

---

## 2. What We Built (Layer by Layer)

```
[Real-World Feeds] NYC 311, Austin 311, USGS Earthquakes, NASA FIRMS, Weather APIs
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 1. CYBERSECURITY GATE (SHA-256 Ingestion Guard)        │
│    • Digital tamper seal before any AI processing       │
│    • Catches spoofed/hacked sensor data (Trust: 0.0)    │
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 2. DATA NORMALIZATION & QUALITY ASSURANCE              │
│    • Canonical schema mapping (lat/lon, time, trust)   │
│    • Complete Data Dictionary & Quality Audit reports  │
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 3. INCIDENT INTELLIGENCE & NUSCAN ENGINE               │
│    • Spatiotemporal Clustering (DBSCAN & H3 Hex Grid)  │
│    • Deduplication of overlapping reports              │
│    • Causal Graph Discovery (Root Cause vs Cascades)   │
│    • Severity & Priority Scoring                       │
│    • Automated Incident Narrative Summaries            │
└────────────────────────────────────────────────────────┘
```

### Layer 1: Real-World Multi-City Data
* **Real Datasets**: Cached and live ingestion for NYC 311, Austin 311, USGS real-time seismic feeds, NASA FIRMS thermal anomaly feeds, and live Open-Meteo weather context.
* **Data Quality & Governance**: Full audit documentation in `DATA_QUALITY_REPORT.md` and schema standardization in `DATA_DICTIONARY.md`.

### Layer 2: The SHA-256 Ingestion Gate (`ingestion_gate.py`)
* Acts as an **airport security checkpoint for incoming data**.
* Before raw data can touch the machine learning models, its canonical byte representation is hashed using SHA-256.
* If a sensor reading is modified or spoofed in transit (e.g., an attacker changing a flood height from 0.2m to 2.5m), the hash fails verification, the trust score drops to `0.0`, and the record is quarantined immediately.

### Layer 3: Incident Intelligence Engine (`engine.py`)
* **Spatiotemporal Clustering**: Groups fragmented calls and sensor signals occurring within the same geographical radius (e.g., 800m) and time window (e.g., 30 mins) into single consolidated incidents.
* **Causal Inference Modeling**: Constructs directed acyclic graphs (DAGs) between events to uncover the chain of causality:
  `Storm Rain ──> Street Flooding ──> Traffic Gridlock`
* **Severity & Priority Engine**: Weighs threat levels, population impact, and cryptographic trust to prioritize incidents for first responders.

---

## 3. How to Present This to Evaluators (Presentation Script)

When an evaluator asks: **"What did you do on the Data and ML side?"**, use this 3-step walkthrough:

### Step 1: The Problem (Hook)
> *"In urban disaster response, 90% of data is noisy, duplicate, or unverified. If a city emergency center receives 100 calls about downed trees and traffic lights, existing systems treat them as 100 separate tickets. Worse, bad actors could spoof sensor data to manipulate city resources."*

### Step 2: Our Innovation (What We Did)
> *"We solved both problems with two key innovations:*
> *First, we implemented a **SHA-256 Ingestion Gate** at Step 0. Every incoming record is verified against a cryptographic digital seal before any AI model sees it. If sensor data is tampered with, it's quarantined before it can poison our models.*
> *Second, our **NuSCAN Engine** groups spatial and temporal evidence, eliminates duplicate tickets, and runs **Causal Inference** to identify the true root cause rather than just treating symptoms."*

### Step 3: The Real-World Impact (Result)
> *"We tested and validated this on real datasets from NYC 311, Austin, and USGS feeds. Instead of overwhelming operators with hundreds of isolated alerts, our system outputs verified, prioritized incident intelligence dossiers ready for immediate dispatch."*

---

## 4. Key Assets in the Repository

| Asset | Location in Repo | Value to Highlight |
|---|---|---|
| **SHA-256 Gate** | `data_and_ml/incident_intelligence/ingestion_gate.py` | Zero-trust cybersecurity boundary layer |
| **Intelligence Engine** | `data_and_ml/incident_intelligence/engine.py` | Full pipeline: Gate → Clustering → Causal Graph |
| **Real Datasets** | `data_and_ml/raw_cache/` | Real NYC & Austin 311, USGS, and NASA FIRMS feeds |
| **Data Quality Audit** | `data_and_ml/DATA_QUALITY_REPORT.md` | Data validation, completeness, and cleanliness scores |
| **Data Dictionary** | `data_and_ml/DATA_DICTIONARY.md` | Clear schema standardization across heterogeneous cities |
