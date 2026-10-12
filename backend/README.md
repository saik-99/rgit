# ⚙️ Backend — Event Ingestion & Integration API
**Assigned Owner**: Person 1 (Lead Full-Stack)

---

## 🎯 Role & Project Scope: UrbanIncident Fusion
Your job is to provide the ingestion layer and tie together the work from Person 2, 3, and 4:

### Key Requirements
1. **Event Ingestion Endpoint**: `POST /api/events` to ingest multimodal signals (IoT sensors, camera alerts, 311 calls).
2. **Incident Query Endpoint**: `GET /api/incidents` returning clustered incidents and causal graph data from `data_and_ml/`.
3. **Agent Integration Endpoint**: `POST /api/incidents/:id/explain` calling Person 4's agent in `agents/`.
4. **Downstream API**: Clean API for emergency dispatch systems.
