# ml/pipeline.py
# [PERSON 2: DATASET & ML MODEL DOMAIN]
# Machine learning inference, preprocessing, and model scoring pipeline.

import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "data" / "sample_dataset.json"

def load_sample_data():
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def predict(input_data: dict) -> dict:
    """
    Inference entrypoint called by Person 1's backend.
    Accepts input payload and returns prediction scores/classes.
    """
    # Sample placeholder prediction logic
    query = input_data.get("query", "")
    score = 0.92
    
    return {
        "status": "success",
        "input_query": query,
        "prediction": "positive_signal",
        "confidence_score": score,
        "model_version": "v0.1.0"
    }

if __name__ == "__main__":
    test_result = predict({"query": "hackathon sample test"})
    print("ML Test Result:", test_result)
