"""
Ingestion script for authentic NYC 311 Service Requests.
Queries NYC Open Data Socrata API (erm2-nwe9).
Caches raw JSON to data_and_ml/raw_cache/nyc_311_service_requests.json.
"""

import json
import ssl
import urllib.request
import urllib.parse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CACHE_DIR = BASE_DIR / "raw_cache"
RAW_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_nyc_311(limit: int = 40) -> list[dict]:
    cache_path = RAW_CACHE_DIR / "nyc_311_service_requests.json"
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data and len(data) >= limit:
                print(f"Loaded {len(data)} cached NYC 311 records from {cache_path}")
                return data

    ctx = ssl.create_default_context()
    # Query multi-hazard urban incident complaints
    params = {
        "$limit": str(limit),
        "$order": "created_date DESC",
        "$where": "complaint_type in ('Sewer', 'Water System', 'Street Condition', 'Traffic Signal Condition') AND latitude IS NOT NULL AND longitude IS NOT NULL"
    }
    url = "https://data.cityofnewyork.us/resource/erm2-nwe9.json?" + urllib.parse.urlencode(params)
    print(f"Querying NYC 311 API: {url[:80]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "UrbanIncidentFusion/1.0 (academic research)"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"Successfully fetched {len(data)} live NYC 311 incident records.")
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
    except Exception as e:
        print(f"Error querying NYC 311 API: {e}")
        if cache_path.exists():
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []


if __name__ == "__main__":
    records = fetch_nyc_311(40)
    print(f"Fetched {len(records)} records.")
    for r in records[:3]:
        print(f"  * {r.get('unique_key')}: {r.get('complaint_type')} - {r.get('descriptor')} ({r.get('city')}, {r.get('latitude')}, {r.get('longitude')})")
