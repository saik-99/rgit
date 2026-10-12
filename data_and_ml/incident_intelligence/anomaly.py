"""
Anomaly Detection Module for Multimodal Incident Streams.
Uses scikit-learn IsolationForest per event type trained on reference
values from datasets/observations.csv, with rolling sample z-score
fallback when insufficient reference data (< 10 samples) is available.
"""

import csv
import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import numpy as np
from sklearn.ensemble import IsolationForest

from .models import NormalizedEvent

# Variable/data_type mapping from observations.csv to event source_type
OBSERVATION_TYPE_MAP = {
    "rain_mm": "weather",
    "weather_observation": "weather",
    "water_level_cm": "water_level",
    "traffic_speed_kmh": "road_sensor",
    "transit_delay_min": "transit",
    "track_submersion_cm": "transit",
    "emergency_priority": "emergency_call",
    "direct_sensor": "sensor_telemetry",
    "transit_telemetry": "transit",
    "railway_telemetry": "transit",
    "cad_dispatch": "emergency_call"
}


class AnomalyDetector:
    """
    Per-event-type anomaly detector combining IsolationForest and rolling z-scores.
    """

    def __init__(self, observations_csv_path: Optional[Path] = None):
        if observations_csv_path is None:
            observations_csv_path = Path(__file__).resolve().parents[1] / "datasets" / "observations.csv"
        
        self.observations_csv_path = observations_csv_path
        self.reference_data: Dict[str, List[float]] = {}
        self.models: Dict[str, IsolationForest] = {}
        self.stats: Dict[str, Tuple[float, float]] = {}  # mean, std
        self.rolling_buffers: Dict[str, List[float]] = {}

        self._load_reference_observations()
        self._train_models()

    def _load_reference_observations(self):
        """Loads and indexes physical sensor and weather observations by source_type."""
        if not self.observations_csv_path.exists():
            return

        with open(self.observations_csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                var_name = row.get("variable_name", "")
                data_type = row.get("data_type", "")
                val_str = row.get("value", "")

                try:
                    val = float(val_str)
                except (ValueError, TypeError):
                    continue

                st = OBSERVATION_TYPE_MAP.get(var_name) or OBSERVATION_TYPE_MAP.get(data_type)
                if st:
                    if st not in self.reference_data:
                        self.reference_data[st] = []
                    self.reference_data[st].append(val)

    def _train_models(self):
        """
        Trains IsolationForest for event types with >= 10 reference samples.
        For types with < 10 samples, establishes rolling stats.
        """
        for st, vals in self.reference_data.items():
            arr = np.array(vals, dtype=float)
            mean_val = float(np.mean(arr))
            std_val = float(np.std(arr)) if len(arr) > 1 else 1.0
            if std_val == 0.0:
                std_val = 1.0
            self.stats[st] = (mean_val, std_val)
            self.rolling_buffers[st] = list(vals)

            if len(vals) >= 10:
                # Fit IsolationForest
                iso = IsolationForest(
                    contamination=0.05,
                    random_state=42,
                    n_estimators=50
                )
                X = arr.reshape(-1, 1)
                iso.fit(X)
                self.models[st] = iso

    def extract_event_value(self, event: NormalizedEvent) -> Optional[float]:
        """Extracts a scalar numeric reading from payload or description text."""
        payload = event.payload or {}
        val = payload.get("value")
        if val is None:
            val = payload.get("rain_mm")
        if val is not None and isinstance(val, (int, float)):
            return float(val)

        # Check raw text or description
        desc = str(payload.get("text") or payload.get("description") or "")
        match = re.search(r"(\d+(?:\.\d+)?)\s*(?:cm|mm|km/h|minutes|min|priority)", desc)
        if match:
            try:
                return float(match.group(1))
            except (ValueError, TypeError):
                pass
        return None

    def evaluate_event(self, event: NormalizedEvent) -> Tuple[bool, float]:
        """
        Returns (is_anomaly, anomaly_zscore).
        Uses IsolationForest if available, otherwise rolling sample z-score.
        """
        val = self.extract_event_value(event)
        if val is None:
            return False, 0.0

        st = event.source_type
        # Default baseline stats if no reference exists for this type
        mean_val, std_val = self.stats.get(st, (0.0, 1.0))
        buffer = self.rolling_buffers.setdefault(st, [])

        if st in self.models:
            # 1. IsolationForest Prediction
            iso = self.models[st]
            pred = iso.predict([[val]])[0]  # -1 is anomaly, 1 is normal
            is_anomaly = bool(pred == -1)
            z_score = abs(val - mean_val) / std_val if std_val > 0 else 0.0
        else:
            # 2. Rolling Z-Score Fallback (< 10 samples)
            if len(buffer) >= 2:
                cur_mean = float(np.mean(buffer))
                cur_std = float(np.std(buffer))
                if cur_std == 0.0:
                    cur_std = max(1.0, 0.1 * cur_mean) if cur_mean > 0 else 1.0
                z_score = abs(val - cur_mean) / cur_std
            else:
                # Single sample or sparse fallback
                if mean_val > 0:
                    z_score = abs(val - mean_val) / (std_val if std_val > 0 else 1.0)
                else:
                    z_score = 0.0

            is_anomaly = bool(z_score >= 2.0)
            # Update rolling buffer (capped at last 50 readings)
            buffer.append(val)
            if len(buffer) > 50:
                buffer.pop(0)

        return is_anomaly, round(float(z_score), 2)

    def detect_anomalies(self, events: List[NormalizedEvent]) -> List[NormalizedEvent]:
        """Processes and mutates is_anomaly and anomaly_zscore on each event."""
        for e in events:
            is_anom, z = self.evaluate_event(e)
            e.is_anomaly = is_anom
            e.anomaly_zscore = z
        return events


# Global singleton instance
_default_detector = AnomalyDetector()


def detect_anomalies(events: List[NormalizedEvent]) -> List[NormalizedEvent]:
    """Top-level convenience function to tag anomalies on normalized events."""
    return _default_detector.detect_anomalies(events)
