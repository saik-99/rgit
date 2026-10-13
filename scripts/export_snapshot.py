import os
import json
import urllib.request

ENDPOINTS = {
    "/api/v1/cities": "cities.json",
    "/api/v1/incidents": "incidents.json",
    "/api/v1/stats": "stats.json",
    "/api/v1/events/geojson": "events.json",
}

BASE_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")

def export_snapshots():
    # Resolve paths relative to repo root
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(repo_root, "frontend", "public", "snapshot")
    os.makedirs(out_dir, exist_ok=True)

    print(f"Exporting snapshots from {BASE_URL} to {out_dir}...")

    for path, filename in ENDPOINTS.items():
        url = f"{BASE_URL}{path}"
        dest_path = os.path.join(out_dir, filename)
        try:
            print(f"Fetching {url} -> {filename}...")
            req = urllib.request.Request(url, headers={"User-Agent": "UrbanFusion-Export/1.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                content = response.read().decode("utf-8")
                # Parse to ensure valid json and pretty-print
                data = json.loads(content)
                with open(dest_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            size = os.path.getsize(dest_path)
            print(f"  [OK] Saved {filename} ({size} bytes)")
        except Exception as e:
            print(f"  [ERROR] Failed to fetch {url}: {e}")
            raise

    print("Snapshot export complete.")

if __name__ == "__main__":
    export_snapshots()
