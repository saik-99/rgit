"""
Social media tools (Person 4).

Turn social media posts (X/Twitter etc.) into city events in the SAME format
as data_and_ml/datasets/synthetic_city_stream.json, so the incident agent can
use them like any other sensor.

Works with NO keys:
  - posts come from agents/data/sample_mumbai_posts.json (synthetic demo posts)
  - location + incident type are extracted with keyword rules

Optional keys (only if set in the environment):
  - X_BEARER_TOKEN  -> fetch live posts from the X API (paid, pay-per-use)
  - GEMINI_API_KEY  -> LLM extraction for messy posts (falls back to rules)
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_POSTS = os.path.join(HERE, "..", "data", "sample_mumbai_posts.json")

# Approximate centre points of common Mumbai trouble spots (lat, lon).
MUMBAI_PLACES = {
    "hindmata": (19.0090, 72.8430), "dadar": (19.0178, 72.8478),
    "andheri subway": (19.1197, 72.8468), "milan subway": (19.0880, 72.8420),
    "sion": (19.0390, 72.8619), "kurla": (19.0726, 72.8845),
    "kings circle": (19.0275, 72.8570), "king's circle": (19.0275, 72.8570),
    "parel": (19.0000, 72.8400), "malad": (19.1864, 72.8485),
    "bandra": (19.0596, 72.8295), "chembur": (19.0522, 72.9005),
    "ghatkopar": (19.0860, 72.9081), "worli": (19.0176, 72.8162),
    "byculla": (18.9790, 72.8330), "andheri": (19.1136, 72.8697),
    "borivali": (19.2307, 72.8567), "goregaon": (19.1663, 72.8526),
    "kandivali": (19.2047, 72.8510), "powai": (19.1176, 72.9060),
    "colaba": (18.9067, 72.8147), "santacruz": (19.0815, 72.8410),
}

# keyword -> signal name from incident_vocabulary.json (citizen-report symptom)
INCIDENT_KEYWORDS = [
    ("Citizen311FloodCall", ["waterlog", "water log", "flooded", "flooding", "knee deep",
                             "knee-deep", "waist deep", "submerged", "paani bhar", "feet of water",
                             "ft water", "feet water"]),
    ("Citizen911EmergencyCall", ["accident", "collision", "crash", "overturned", "hit by"]),
    ("CitizenBlackoutReport", ["power cut", "blackout", "no electricity", "outage", "light gayi"]),
    ("OdorComplaintCalls", ["gas leak", "smell of gas", "gas smell"]),
    ("TrafficSlowdown", ["traffic jam", "heavy traffic", "slow moving", "crawling", "stuck in traffic"]),
]
ALL_CLEAR_WORDS = ["no waterlogging", "no water logging", "roads are clear", "road is clear",
                   "traffic normal", "moving smoothly", "all clear", "no flooding"]

OFFICIAL_TRUST, CITIZEN_TRUST = 0.9, 0.6


# ---------------------------------------------------------------------------
# Tool 1: get posts (sample file, given list, or live X API)
# ---------------------------------------------------------------------------
def load_posts(path: str | None = None) -> list[dict]:
    with open(path or SAMPLE_POSTS, encoding="utf-8") as f:
        return json.load(f)


def fetch_x_posts(query: str, max_results: int = 20) -> list[dict]:
    """Live X API v2 recent search. Needs X_BEARER_TOKEN (paid credits)."""
    token = os.getenv("X_BEARER_TOKEN")
    if not token:
        raise RuntimeError("X_BEARER_TOKEN not set")
    params = urllib.parse.urlencode({
        "query": query, "max_results": max(10, min(max_results, 100)),
        "tweet.fields": "created_at,author_id", "expansions": "author_id",
        "user.fields": "username,verified",
    })
    req = urllib.request.Request(f"https://api.x.com/2/tweets/search/recent?{params}",
                                 headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.load(resp)
    users = {u["id"]: u for u in data.get("includes", {}).get("users", [])}
    posts = []
    for t in data.get("data", []):
        u = users.get(t.get("author_id"), {})
        posts.append({"post_id": t["id"], "author": "@" + u.get("username", "unknown"),
                      "official": bool(u.get("verified")), "created_at": t.get("created_at"),
                      "text": t.get("text", "")})
    return posts


# ---------------------------------------------------------------------------
# Tool 2: extract location + incident type
# ---------------------------------------------------------------------------
def extract_rules(text: str) -> dict:
    """Keyword extraction. Returns {} if the post is not about an incident."""
    t = text.lower().replace("’", "'")
    place = next((p for p in sorted(MUMBAI_PLACES, key=len, reverse=True) if p in t), None)
    if not place:
        return {}
    if any(w in t for w in ALL_CLEAR_WORDS):
        return {"place": place, "signal": "ConflictingReport", "method": "rules"}
    for signal, words in INCIDENT_KEYWORDS:
        if any(w in t for w in words):
            depth = re.search(r"(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)", t)
            return {"place": place, "signal": signal, "method": "rules",
                    "depth_ft": float(depth.group(1)) if depth else None}
    return {}


def extract_llm(text: str) -> dict:
    """Gemini extraction. Returns {} on any problem so rules can take over."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        return {}
    try:
        from google import genai
        client = genai.Client(api_key=key)
        allowed = [s for s, _ in INCIDENT_KEYWORDS] + ["ConflictingReport", "None"]
        prompt = ("Extract from this Mumbai social media post. Reply ONLY with JSON: "
                  '{"place": <one of ' + json.dumps(sorted(MUMBAI_PLACES)) + ' or null>, '
                  '"signal": <one of ' + json.dumps(allowed) + '>, "depth_ft": <number or null>}.'
                  ' Use ConflictingReport if the post says things are normal/clear.\nPOST: ' + text)
        resp = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), contents=prompt)
        raw = (resp.text or "").strip().strip("`").removeprefix("json").strip()
        out = json.loads(raw)
    except Exception:
        return {}
    # Guard: only accept values from our fixed lists
    if out.get("place") not in MUMBAI_PLACES or out.get("signal") not in allowed \
            or out.get("signal") == "None":
        return {}
    out["method"] = "llm"
    return out


# ---------------------------------------------------------------------------
# Tool 3: convert a post into a city event (stream format)
# ---------------------------------------------------------------------------
def post_to_event(post: dict, extracted: dict, received_at: str) -> dict:
    lat, lon = MUMBAI_PLACES[extracted["place"]]
    official = bool(post.get("official"))
    ev = {
        "event_id": f"SOC-{post.get('post_id')}",
        "timestamp": post.get("created_at"),
        "received_at": received_at,
        "source_type": "Social_Media_Official" if official else "Social_Media_Citizen",
        "device_id": post.get("author", "unknown"),
        "location": {"lat": lat, "lon": lon, "neighborhood": extracted["place"].title()},
        "signal": extracted["signal"],
        "text": post.get("text", ""),
        "integrity_verified": official,
        "confidence": OFFICIAL_TRUST if official else CITIZEN_TRUST,
        "extraction": extracted.get("method"),
    }
    if extracted.get("depth_ft"):
        ev["value"], ev["unit"] = extracted["depth_ft"], "ft_water"
    return ev


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
