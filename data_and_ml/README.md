# 🧠 Data, ML & Research Squad
**Assigned Owners**: Person 2 & Person 3 (Working Together)

---

## 🎯 Role & Project Scope: UrbanIncident Fusion
You both collaborate on the core data engine, machine learning models, research, evaluation benchmarks, and presentation for the hackathon.

### 🤝 Team Collaboration Split
- **Person 2 (Dataset & ML Focus)**:
  - **Multimodal City Dataset**: Prepare synthetic or curated streams of events (IoT water sensors, road sensors, traffic camera vision alerts, 311 calls).
  - **Spatiotemporal Event Clustering**: Cluster signals by geographic radius and temporal sliding window (handling out-of-order and duplicate events).
  - **Causal Evidence Graph & Severity**: Build the graph mapping root causes to observed symptoms and calculate severity + confidence scores.
- **Person 3 (Research, Benchmarks & Pitch Focus)**:
  - **Constrained Incident Vocabulary**: Define the incident categories (e.g. Drainage Failure, Traffic Collision, Power Grid Outage).
  - **Replay Benchmarks**: Design test scenarios showing how out-of-order signals, sensor spoofing, and conflicting reports are resolved.
  - **Pitch Deck & Demo Script**: Create the 3-minute pitch deck and script the 90-second live demo for judges.

### 📁 Folder Layout
- `datasets/`: Incident taxonomy and synthetic city event streams.
- `correlation/`: Spatiotemporal clustering logic.
- `causal_engine/`: Causal graph builder and root cause inference.
- `research_and_pitch/`: Pitch deck outline, demo script, and evaluation scenarios.
