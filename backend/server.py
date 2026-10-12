# backend/server.py
# [PERSON 1: BACKEND DOMAIN]
# Central API server connecting the frontend, ML pipeline, and AI agents.

import sys
from pathlib import Path

# Add project root to path to import ml and agents modules
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

try:
    from ml.pipeline import predict as ml_predict
except ImportError:
    ml_predict = lambda data: {"status": "ML pipeline not connected yet"}

try:
    from agents.agent_manager import run_agent
except ImportError:
    run_agent = lambda prompt, context=None: {"status": "Agent manager not connected yet"}

def handle_request(action: str, payload: dict) -> dict:
    if action == "ml_predict":
        return ml_predict(payload)
    elif action == "run_agent":
        return run_agent(payload.get("prompt", ""), payload.get("context"))
    return {"error": "Unknown action"}

if __name__ == "__main__":
    print("Backend server initialized. Ready to connect ML & Agents.")
