# 📚 Data Dictionary — UrbanIncident Fusion Datasets

This document provides schema specifications, data types, nullability constraints, and definitions for all 7 production datasets in `data_and_ml/datasets/`.

---

## 1. `events.csv`
Core event stream capturing heterogeneous urban incident signals across time and space.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `event_id` | `VARCHAR(32)` | No | e.g. `EVT-MUM-001`, `SYN-EVT-101` | Unique event identifier. Primary key. |
| `type` | `VARCHAR(32)` | No | `water_level`, `road_sensor`, `transit`, `weather`, `citizen_report`, `emergency_call` | High-level modality / source channel. |
| `description` | `TEXT` | No | Free-form string | Natural language or sensor description of the observed symptom. |
| `event_time` | `TIMESTAMP` | Yes | ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) | Ground-truth time when the event occurred in the physical world. |
| `received_time` | `TIMESTAMP` | No | ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) | Ingestion time when the signal was received by the city system. |
| `location` | `VARCHAR(128)`| Yes | Landmark / Intersection | Descriptive textual location name. |
| `latitude` | `DECIMAL(9,6)`| Yes | `-90.000000` to `90.000000` | Verified WGS84 latitude. Preserved empty if unverified. |
| `longitude` | `DECIMAL(9,6)`| Yes | `-180.000000` to `180.000000` | Verified WGS84 longitude. Preserved empty if unverified. |
| `city` | `VARCHAR(64)` | Yes | e.g. `Mumbai`, `New York` | City municipality. |
| `country` | `VARCHAR(64)` | Yes | e.g. `India`, `United States` | Country of origin. |
| `source_reference`| `VARCHAR(128)`| No | Agency / System ID | Originating department, sensor model, or application name. |
| `is_synthetic` | `BOOLEAN` | No | `True`, `False` | Explicit flag: `True` if synthetic scenario test record; `False` if real. |
| `data_type` | `VARCHAR(32)` | No | `direct_observation`, `reported_incident`, `mapped_infrastructure`, `model_weather` | Provenance classification. |
| `trust` | `DECIMAL(3,2)`| No | `0.00` to `1.00` | Baseline trust prior calibrated by sensor fidelity and verification. |
| `signature_verified`| `BOOLEAN` | No | `True`, `False` | Cryptographic HMAC or source verification status. |

---

## 2. `evidence.csv`
Traceable evidence artifacts and verification metadata supporting or disputing incidents.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `evidence_id` | `VARCHAR(32)` | No | e.g. `EVD-EVT-MUM-001` | Unique evidence identifier. Primary key. |
| `event_id` | `VARCHAR(32)` | No | Resolves in `events.csv` | Foreign key referencing the parent event. |
| `source_name` | `VARCHAR(128)`| No | Agency / Organization name | Operating organization or publisher. |
| `source_type` | `VARCHAR(32)` | No | `sensor`, `weather_api`, `call_center`, `cad_dispatch`, `mobile_app` | Ingestion conduit type. |
| `source_url` | `VARCHAR(256)`| No | HTTP/HTTPS URL or repo path | Traceable public URL or audit reference. |
| `publication_time`| `TIMESTAMP` | No | ISO-8601 | Publication / broadcast timestamp. |
| `verification_status`| `VARCHAR(20)`| No | `verified`, `unverified`, `synthetic` | Validation status of the evidence. |
| `evidence_nature` | `VARCHAR(20)` | No | `supporting`, `contradicting`, `duplicate`, `suspicious` | Role of evidence relative to hypothesis. |
| `confidence_weight`| `DECIMAL(3,2)`| No | `0.00` to `1.00` | Weight assigned in probabilistic inference. |
| `notes` | `TEXT` | Yes | Audit notes | Contextual engineering or evaluation notes. |

---

## 3. `observations.csv`
Fine-grained numerical and categorical measurements (rainfall, water depth, traffic velocity).

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `observation_id` | `VARCHAR(32)`| No | e.g. `OBS-WTH-0001` | Unique observation identifier. Primary key. |
| `event_id` | `VARCHAR(32)`| Yes | Resolves in `events.csv` | Optional link to associated incident event. |
| `variable_name` | `VARCHAR(32)`| No | `rain_intensity`, `water_level`, `traffic_speed`, `road_status`, `relative_humidity` | Physical dimension measured. |
| `value` | `VARCHAR(32)`| Yes | Float or enum string | Measured numeric reading or status flag. |
| `unit` | `VARCHAR(32)`| Yes | `mm_per_hour`, `cm_above_normal`, `km_per_hour`, `percent` | Engineering measurement unit. |
| `data_type` | `VARCHAR(32)`| No | `model_weather`, `direct_observation` | Direct physical telemetry vs model reanalysis. |
| `latitude` | `DECIMAL(9,6)`| Yes | `-90.0` to `90.0` | Sensor / observation latitude. |
| `longitude` | `DECIMAL(9,6)`| Yes | `-180.0` to `180.0` | Sensor / observation longitude. |
| `timestamp` | `TIMESTAMP` | No | ISO-8601 | Precise measurement timestamp. |
| `provider` | `VARCHAR(64)` | No | Organization / API | Data provider (e.g. Open-Meteo). |
| `is_synthetic` | `BOOLEAN` | No | `True`, `False` | Synthetic vs real data indicator. |

---

## 4. `infrastructure.csv`
Geospatially mapped critical public infrastructure elements extracted from OpenStreetMap.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `infrastructure_id` | `VARCHAR(32)`| No | e.g. `INFRA-MUM-12345` | Unique infrastructure identifier. Primary key. |
| `name` | `VARCHAR(128)`| No | Asset name | Name of hospital, station, junction, or pumping plant. |
| `type` | `VARCHAR(32)`| No | `hospital`, `fire_station`, `railway_station`, `motorway_junction` | Infrastructure asset taxonomy. |
| `latitude` | `DECIMAL(9,6)`| No | WGS84 Latitude | Verified coordinate latitude. |
| `longitude` | `DECIMAL(9,6)`| No | WGS84 Longitude | Verified coordinate longitude. |
| `city` | `VARCHAR(64)` | No | Municipal city name | City location. |
| `country` | `VARCHAR(64)` | No | Country name | Country. |
| `source` | `VARCHAR(64)` | No | e.g. `OpenStreetMap Contributors` | Provenance source. |
| `tags` | `JSON` | Yes | JSON object | Raw OSM tags (operator, emergency capabilities, etc.). |
| `is_synthetic` | `BOOLEAN` | No | `False` | All infrastructure records are verified public assets. |

---

## 5. `relationships.csv`
Directed Acyclic Graph (DAG) edges representing evidence and inter-event causal links.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `relationship_id` | `VARCHAR(32)`| No | e.g. `REL-001` | Unique edge identifier. Primary key. |
| `source_id` | `VARCHAR(32)`| No | Event ID or Observation ID | Tail of the directed evidence edge. |
| `target_id` | `VARCHAR(32)`| No | Event ID or Incident ID | Head of the directed evidence edge. |
| `relationship_type`| `VARCHAR(32)`| No | `possible_contributor`, `temporally_related`, `spatially_related`, `duplicate_of`, `contradicts`, `corroborates` | Qualified, non-dogmatic relationship classification. |
| `time_difference_sec`| `FLOAT` | Yes | Seconds | Precedence lag: `target_time - source_time`. |
| `geographic_distance_m`| `FLOAT` | Yes | Meters | Great-circle Haversine separation distance. |
| `evidence_summary` | `TEXT` | No | Summary narrative | Explanation of why relationship was established. |
| `confidence` | `DECIMAL(3,2)`| No | `0.00` to `1.00` | Calibration score for this edge. |
| `alternative_explanations`| `TEXT` | Yes | Explanations | Alternative hypotheses explaining the correlation. |

---

## 6. `scenario_tests.csv`
Controlled benchmark edge-case evaluation scenarios.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `scenario_id` | `VARCHAR(32)`| No | e.g. `SCN-01-DRAINAGE-CASCADE` | Unique test scenario ID. Primary key. |
| `name` | `VARCHAR(64)` | No | Scenario name | Human-readable title. |
| `category` | `VARCHAR(32)` | No | `Deduplication`, `Temporal Robustness`, `Conflict Resolution`, etc. | Testing category. |
| `description` | `TEXT` | No | Narrative | Problem statement and conditions. |
| `events_injected` | `VARCHAR(128)`| No | Comma-separated event IDs | Injected test events. |
| `expected_root_cause`| `VARCHAR(64)`| No | Vocabulary cause name | Expected primary inferred hypothesis. |
| `expected_behavior` | `TEXT` | No | Narrative | Expected engine action (e.g. flag duplicate, suppress alert). |
| `notes` | `TEXT` | Yes | Evaluation notes | Judge presentation notes. |

---

## 7. `source_register.csv`
Registry of public data providers, licensing, access criteria, and audit notes.

| Column | Data Type | Nullable | Valid Values / Format | Description |
| :--- | :--- | :--- | :--- | :--- |
| `provider` | `VARCHAR(64)` | No | Provider agency name | Sponsoring municipal or scientific organization. |
| `dataset_name` | `VARCHAR(64)` | No | Title of dataset | Official dataset title. |
| `source_url` | `VARCHAR(256)`| No | URL | Official public endpoint or portal. |
| `collection_date` | `DATE` | No | `YYYY-MM-DD` | Date of data retrieval. |
| `access_requirements`| `TEXT` | No | Terms | Open access, API key requirements, or rate limits. |
| `license_and_attribution`| `TEXT` | No | License | Legal license (CC BY 4.0, ODbL, MIT). |
| `notes` | `TEXT` | Yes | Notes | Operational characteristics and sampling notes. |
