"""
Machine Learning Classifier for Incident Root-Cause Prediction.
Loads pre-trained logistic regression weights and scaler parameters from
model_weights.json, extracts the 10-feature cluster representation, and produces
calibrated softmax probabilities.
"""

import json
import math
import re
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import numpy as np

from .models import NormalizedEvent
from .causal_engine import INCIDENT_TAXONOMY


class MLIncidentClassifier:
    """
    Inference runtime for the trained logistic regression classifier.
    """

    def __init__(self, weights_path: Optional[Path] = None):
        if weights_path is None:
            weights_path = Path(__file__).resolve().parent / "model_weights.json"

        self.weights_path = weights_path
        self.classes: List[str] = []
        self.feature_names: List[str] = []
        self.scaler_mean: List[float] = []
        self.scaler_scale: List[float] = []
        self.intercept: List[float] = []
        self.coefficients: List[List[float]] = []

        self._load_weights()

    def _load_weights(self):
        """Loads and parses trained model coefficients."""
        if not self.weights_path.exists():
            raise FileNotFoundError(f"model_weights.json not found at {self.weights_path}")

        with open(self.weights_path, mode="r", encoding="utf-8") as f:
            data = json.load(f)

        self.classes = data["classes"]
        self.feature_names = data["feature_names"]
        self.scaler_mean = data["scaler_mean"]
        self.scaler_scale = data["scaler_scale"]
        self.intercept = data["intercept"]
        self.coefficients = data["coefficients"]

    def featurize_cluster(
        self,
        cluster: List[Any],
        weather_rain: float = 0.0
    ) -> List[float]:
        """
        Builds the exact 10-dimensional feature vector:
        0. water_level_count
        1. road_sensor_count
        2. transit_count
        3. weather_count
        4. citizen_report_count
        5. emergency_call_count
        6. max_water_val
        7. max_rain_val
        8. avg_trust
        9. has_contradiction
        """
        counts = {
            "water_level": 0,
            "road_sensor": 0,
            "transit": 0,
            "weather": 0,
            "citizen_report": 0,
            "emergency_call": 0
        }
        max_water = 0.0
        max_rain = float(weather_rain)
        trust_vals: List[float] = []
        has_conflict = 0.0

        for item in cluster:
            # Check duplicate status
            is_dup = getattr(item, "is_duplicate", False) if hasattr(item, "is_duplicate") else (
                item.get("is_duplicate", False) if isinstance(item, dict) else False
            )
            if is_dup:
                continue

            st = getattr(item, "source_type", None) if hasattr(item, "source_type") else (
                item.get("source_type") or item.get("type") if isinstance(item, dict) else None
            )
            st = str(st or "unknown").lower()
            if st in counts:
                counts[st] += 1

            # Trust
            trust = getattr(item, "trust", None) if hasattr(item, "trust") else (
                item.get("trust", 0.5) if isinstance(item, dict) else 0.5
            )
            trust_vals.append(float(trust if trust is not None else 0.5))

            # Payload
            payload = getattr(item, "payload", {}) if hasattr(item, "payload") else (
                item.get("payload", {}) if isinstance(item, dict) else {}
            )
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {}
            elif not isinstance(payload, dict):
                payload = {"value": payload}

            val = payload.get("value")
            if val is None:
                val = payload.get("rain_mm")
            if val is None:
                desc = str(payload.get("text") or payload.get("description") or getattr(item, "location_name", "") or "")
                match = re.search(r"(\d+(?:\.\d+)?)\s*(?:cm|mm)", desc)
                if match:
                    try:
                        val = float(match.group(1))
                    except (ValueError, TypeError):
                        pass

            if st == "water_level" and isinstance(val, (int, float)):
                max_water = max(max_water, float(val))
            elif st == "weather" and isinstance(val, (int, float)):
                max_rain = max(max_rain, float(val))

            desc_text = str(
                payload.get("text") or payload.get("description") or ""
            ).lower()
            if any(w in desc_text for w in ["no issue", "clear", "no problem", "all dry", "normal flow"]):
                has_conflict = 1.0

        avg_trust = float(np.mean(trust_vals)) if trust_vals else 0.5

        return [
            float(counts["water_level"]),
            float(counts["road_sensor"]),
            float(counts["transit"]),
            float(counts["weather"]),
            float(counts["citizen_report"]),
            float(counts["emergency_call"]),
            float(max_water),
            float(max_rain),
            float(avg_trust),
            float(has_conflict)
        ]

    def predict_probabilities(self, features: List[float]) -> List[Dict[str, Any]]:
        """
        Scales features and computes softmax probabilities across classes.
        Returns cause_ranking_ml.
        """
        # Standardize
        scaled_x = []
        for j in range(len(features)):
            mean_j = self.scaler_mean[j]
            scale_j = self.scaler_scale[j]
            val = (features[j] - mean_j) / scale_j if scale_j != 0 else 0.0
            scaled_x.append(val)

        # Logits
        logits = []
        for k in range(len(self.classes)):
            logit = self.intercept[k]
            for j in range(len(features)):
                logit += self.coefficients[k][j] * scaled_x[j]
            logits.append(logit)

        # Softmax with stability
        max_logit = max(logits)
        exp_logits = [math.exp(l - max_logit) for l in logits]
        sum_exp = sum(exp_logits)
        probs = [e / sum_exp for e in exp_logits]

        ranking = []
        for k, class_name in enumerate(self.classes):
            tax = INCIDENT_TAXONOMY.get(class_name, {})
            ranking.append({
                "cause": class_name,
                "label": tax.get("label", class_name.replace("_", " ").title()),
                "category": tax.get("category", "General"),
                "probability": round(probs[k], 3)
            })

        ranking.sort(key=lambda x: x["probability"], reverse=True)
        return ranking


_default_classifier = MLIncidentClassifier()


def get_ml_classifier() -> MLIncidentClassifier:
    return _default_classifier


def combine_cause_rankings(
    ranking_rules: List[Dict[str, Any]],
    ranking_ml: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], str, str, float]:
    """
    Combines rule-based (Bayesian noisy-OR) and ML model probabilities:
    final = 0.5 * rules + 0.5 * ml.
    Returns: (combined_ranking, top_cause, top_label, top_confidence)
    """
    rules_map = {r["cause"]: r.get("probability", 0.0) for r in ranking_rules}
    ml_map = {r["cause"]: r.get("probability", 0.0) for r in ranking_ml}
    signals_map = {r["cause"]: r.get("evidence_signals", 0) for r in ranking_rules}

    all_causes = list(INCIDENT_TAXONOMY.keys())

    combined = []
    for c in all_causes:
        p_rules = rules_map.get(c, 0.0)
        p_ml = ml_map.get(c, 0.0)
        final_p = round(0.5 * p_rules + 0.5 * p_ml, 3)

        tax = INCIDENT_TAXONOMY[c]
        combined.append({
            "cause": c,
            "label": tax["label"],
            "category": tax["category"],
            "probability": final_p,
            "evidence_signals": signals_map.get(c, 0)
        })

    combined.sort(key=lambda x: x["probability"], reverse=True)
    top = combined[0]
    return combined, top["cause"], top["label"], top["probability"]
