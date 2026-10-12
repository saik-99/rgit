# 🏙️ UrbanIncident Fusion & Causal Intelligence

> **Multimodal Incident Fusion, Evolving Evidence Graphs & Causal Intelligence for Smart Cities**

Cities continuously generate fragmented signals: traffic cameras, citizen 311 reports, weather feeds, 911 calls, water-level IoT sensors, and road telemetry.  
A conventional dashboard shows 4 disconnected alerts. **UrbanIncident Fusion** unifies out-of-order, noisy, and conflicting observations into an **evolving incident graph**, infers the most probable root cause (e.g. *Drainage Failure* causing *Road Inundation* and *Traffic Slowdown*), preserves uncertainty, and produces confidence-aware operational summaries.

---

## 👥 Team Roles & Responsibilities

| Role | Members | Domain & Sandbox Folder | Deliverables |
| :--- | :--- | :--- | :--- |
| **Person 1** | @saik-99 (Lead) | `frontend/`, `backend/` | Ingestion API, WebSocket/event stream, Operator Incident Command Dashboard, Downstream API |
| **Person 2 & 3** | Teammates 2 & 3 (Working Together) | `data_and_ml/` | **Person 2**: Synthetic multimodal stream, spatiotemporal clustering, causal graph builder, severity model.<br>**Person 3**: Incident vocabulary schema, scenario benchmarks (out-of-order, duplicates, sensor spoofing), pitch deck & demo script. |
| **Person 4** | Teammate 4 | `agents/` | Incident Analyst AI Agent, causal hypothesis generation, conflict resolution, operator briefing & action recommendation |

👉 **Read the comprehensive step-by-step role guides:** [ROLE_GUIDE.md](ROLE_GUIDE.md)  
👉 **Read Git & Antigravity contribution workflow:** [TEAM_WORKFLOW.md](TEAM_WORKFLOW.md)

---

## 🏛️ System Architecture

```text
[ IoT Sensors / Cameras / 311 Calls / Weather / Telemetry ]
                           │
                           ▼
          ┌───────────────────────────────────┐
          │     Backend Ingestion Layer       │ (Person 1)
          │  - De-duplication & Timestamping  │
          │  - Cybersecurity Integrity Check  │
          └─────────────────┬─────────────────┘
                            │
                            ▼
          ┌───────────────────────────────────┐
          │   Spatiotemporal Event Fusion     │ (Person 2 & 3)
          │  - Geospatial (lat/lon) radius    │
          │  - Temporal sliding window        │
          └─────────────────┬─────────────────┘
                            │
                            ▼
          ┌───────────────────────────────────┐
          │  Causal Evidence & Severity Graph │ (Person 2 & 3)
          │  - Directed Acyclic Evidence DAG  │
          │  - Root Cause Probability (Bayes) │
          │  - Severity & Confidence Scoring  │
          └─────────────────┬─────────────────┘
                            │
                            ▼
          ┌───────────────────────────────────┐
          │   Autonomous Incident AI Agent    │ (Person 4)
          │  - Reconstructs out-of-order data │
          │  - Resolves conflicting reports   │
          │  - Operator Briefing & Actions    │
          └─────────────────┬─────────────────┘
                            │
                            ▼
          ┌───────────────────────────────────┐
          │ Operator Incident Command Console │ (Person 1)
          │  - Live Incident Map & DAG View   │
          │  - Evolving Confidence & Timeline │
          └───────────────────────────────────┘
```

---

## 🚀 24-Hour Hackathon Demo Scenarios

1. **Scenario 1: The Cascading Drainage Failure (Core Proof)**
   - *Signals*: Water-level sensor spikes ➔ Traffic slows down ➔ 311 reports flood ➔ Road sensor triggers.
   - *Challenge*: 311 report arrives 10 minutes late; water-level sensor briefly drops offline.
   - *Result*: Fuses 4 alerts into 1 incident with 93% confidence root cause: `Drainage Inundation`.
2. **Scenario 2: Traffic Collision vs False Alarm**
   - *Signals*: Traffic camera collision detection + emergency call. Conflicting report claims "road clear".
   - *Result*: Agent identifies conflict, weighs camera integrity over noisy report, and maintains uncertainty score.
3. **Scenario 3: IoT Sensor Tampering / Anomaly**
   - *Signals*: Water sensor reports flood while adjacent sensors and cameras show dry weather.
   - *Result*: Cybersecurity integrity flag isolates sensor as anomalous.

---

## ⚡ Quick Start for Team Members

```bash
git clone https://github.com/saik-99/rgit.git
cd rgit

# Branch out based on your role:
git checkout -b feature/fullstack-command   # Person 1
git checkout -b feature/data-ml-causal      # Person 2 & 3
git checkout -b feature/incident-agent      # Person 4
```

---

## 🌍 External Hazard Map Providers & API Keys

The application runs **100% out of the box with zero paid API keys**, utilizing graceful web fallbacks and public government feeds. Optional keys can be placed in `.env` (refer to `.env.example`).

### 1. Windy Atmospheric Radar (Wind, Rain, Clouds, Waves)
* **Without API Key (Default)**: Displays the official `https://embed.windy.com` interactive viewport centered on Mumbai (19.076, 72.8777). Note: Iframe mode cannot synchronize with custom timeline scrubs.
* **With API Key**: Set `WINDY_MAP_API_KEY` in `.env` to enable native Leaflet map integration per the [Windy Map API Docs](https://api.windy.com/map-forecast/docs).
* **Get a Key**: Register at [https://api.windy.com/keys](https://api.windy.com/keys).
* **Required Attribution**: Keep `Wind & weather data: Windy.com` visible on the map interface.

### 2. Google Flood Hub (Upstream Riverine Risk)
* **Without API Key (Default)**: The "Upstream river risk" layer opens an operator direct link to the [Google Flood Hub Mumbai Portal](https://sites.research.google/floods/l/19.0760/72.8777/10).
* **With API Key**: Set `GOOGLE_FLOOD_API_KEY` in `.env` to query the official [Google Flood Forecasting API](https://developers.google.com/flood-forecasting). Gauges are fetched server-side and cached for 15 minutes.
* **Request Access**: Apply via [Google Developers Flood Forecasting](https://developers.google.com/flood-forecasting).
* **Important Note**: Google Flood Hub models riverine flood risks, not street-level drainage/waterlogging.
* **Required Attribution**: `Flood forecast data: Google Flood Hub, CC BY 4.0`.

### 3. USGS Earthquakes (Global & Mumbai Region)
* **Live Feed**: Polled every 5 minutes from `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson` (no key required).
* **Demo Injection**: Use the **"🌋 Inject Earthquake (USGS Demo)"** scenario button in the dashboard to simulate ground motion and test causal classification even when seismic activity is quiet.
* **Required Attribution**: `Earthquake data: USGS, public domain`.

