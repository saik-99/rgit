"""
Spatiotemporal event clustering and candidate matching.
Groups incoming multimodal events into coherent incident clusters based on:
1. Geospatial Haversine distance (default 800m threshold).
2. Sliding temporal window (default 30 min / 1800s threshold).
3. Resilient to out-of-order arrivals and handles missing coordinates without dropping events.
"""

import math
import datetime
from typing import List, Optional, Tuple
from .models import NormalizedEvent


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two coordinates in meters."""
    R = 6_371_000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(dlambda / 2.0) ** 2))
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def compute_cluster_centroid(events: List[NormalizedEvent]) -> Tuple[Optional[float], Optional[float], float]:
    """
    Calculate average centroid lat/lon and bounding radius in meters.
    Events without coordinates are excluded from centroid calculation but retained in cluster.
    """
    coords = [(e.lat, e.lon) for e in events if e.lat is not None and e.lon is not None]
    if not coords:
        return None, None, 0.0

    c_lat = sum(c[0] for c in coords) / len(coords)
    c_lon = sum(c[1] for c in coords) / len(coords)

    # Calculate maximum radius
    max_dist = 0.0
    for lat, lon in coords:
        d = haversine_distance_m(c_lat, c_lon, lat, lon)
        if d > max_dist:
            max_dist = d

    return c_lat, c_lon, round(max_dist, 1)


def cluster_events_spatiotemporal(
    events: List[NormalizedEvent],
    max_distance_m: float = 800.0,
    max_time_sec: float = 1800.0
) -> List[List[NormalizedEvent]]:
    """
    Group events into incident clusters using greedy spatiotemporal linkage.
    Sorts events by event_time to be robust against out-of-order arrival latency.
    Events with missing coordinates are grouped with temporally matching clusters if
    they share location names or flagged as standalone candidate clusters.
    """
    if not events:
        return []

    # Sort primarily by event_time, falling back to received_time
    def sort_key(e: NormalizedEvent):
        t = e.event_time or e.received_time
        return t.timestamp() if t else 0.0

    sorted_events = sorted(events, key=sort_key)
    clusters: List[List[NormalizedEvent]] = []

    for evt in sorted_events:
        matched_cluster = None
        min_distance = float("inf")

        for cluster in clusters:
            # Check temporal proximity against any event in the cluster
            temporal_match = False
            for c_evt in cluster:
                t1 = evt.event_time or evt.received_time
                t2 = c_evt.event_time or c_evt.received_time
                if t1 and t2:
                    if abs((t1 - t2).total_seconds()) <= max_time_sec:
                        temporal_match = True
                        break
                else:
                    temporal_match = True  # un-timestamped events matched leniently

            if not temporal_match:
                continue

            # Check spatial proximity
            spatial_match = False
            if evt.lat is not None and evt.lon is not None:
                # Compare against centroid or members
                c_lat, c_lon, _ = compute_cluster_centroid(cluster)
                if c_lat is not None and c_lon is not None:
                    dist = haversine_distance_m(evt.lat, evt.lon, c_lat, c_lon)
                    if dist <= max_distance_m and dist < min_distance:
                        matched_cluster = cluster
                        min_distance = dist
                        spatial_match = True
            else:
                # Missing coordinates: match if neighborhood or location_name aligns
                evt_loc = (evt.location_name or "").lower()
                for c_evt in cluster:
                    c_loc = (c_evt.location_name or "").lower()
                    if evt_loc and c_loc and (evt_loc in c_loc or c_loc in evt_loc):
                        matched_cluster = cluster
                        spatial_match = True
                        break

            if spatial_match and matched_cluster is cluster:
                break

        if matched_cluster is not None:
            matched_cluster.append(evt)
        else:
            clusters.append([evt])

    return clusters
