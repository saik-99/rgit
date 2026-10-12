"""
Deduplication module for streaming multimodal events.
Provides:
1. Exact fingerprint matching (device_id + event_time + source_type + payload hash).
2. Fuzzy near-duplicate detection for citizen reports and emergency calls.
3. Preserves original source records and links duplicates via 'duplicate_of'.
"""

import hashlib
import json
from typing import List, Tuple
from .models import NormalizedEvent


def compute_event_fingerprint(event: NormalizedEvent) -> str:
    """Generate deterministic hash for exact deduplication."""
    t_str = event.event_time.isoformat() if event.event_time else ""
    raw_payload = json.dumps(event.payload, sort_keys=True)
    key = f"{event.device_id}|{event.source_type}|{t_str}|{raw_payload}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def tokenize_text(text: str) -> set[str]:
    """Tokenize text into lowercase words for Jaccard similarity."""
    if not text:
        return set()
    return set(text.lower().replace(",", " ").replace(".", " ").split())


def text_similarity(t1: str, t2: str) -> float:
    """Compute Jaccard similarity between two text descriptions."""
    s1 = tokenize_text(t1)
    s2 = tokenize_text(t2)
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / len(s1 | s2)


def deduplicate_events(events: List[NormalizedEvent], time_window_sec: float = 600.0) -> Tuple[List[NormalizedEvent], List[NormalizedEvent]]:
    """
    Partition events into unique events and duplicates.
    Duplicates have is_duplicate=True and duplicate_of=<parent_event_id>.
    Original evidence is preserved.
    """
    unique_events: List[NormalizedEvent] = []
    duplicate_events: List[NormalizedEvent] = []
    seen_fingerprints: dict[str, str] = {}  # fingerprint -> original event_id

    for evt in events:
        fp = compute_event_fingerprint(evt)
        
        # 1. Exact match check
        if fp in seen_fingerprints:
            evt.is_duplicate = True
            evt.duplicate_of = seen_fingerprints[fp]
            duplicate_events.append(evt)
            continue

        # 2. Near-duplicate check for citizen reports / calls from same device or identical text
        is_near_dup = False
        text = evt.payload.get("text") or evt.payload.get("description", "")
        for u in unique_events:
            # Same device within small window
            if evt.device_id == u.device_id and evt.device_id != "UNKNOWN-DEVICE":
                if evt.event_time and u.event_time:
                    delta = abs((evt.event_time - u.event_time).total_seconds())
                    if delta <= 120.0 and evt.source_type == u.source_type:
                        evt.is_duplicate = True
                        evt.duplicate_of = u.event_id
                        duplicate_events.append(evt)
                        is_near_dup = True
                        break

            # High text overlap within temporal window
            u_text = u.payload.get("text") or u.payload.get("description", "")
            if text and u_text:
                sim = text_similarity(text, u_text)
                if sim >= 0.85:
                    if evt.event_time and u.event_time:
                        delta = abs((evt.event_time - u.event_time).total_seconds())
                        if delta <= time_window_sec:
                            evt.is_duplicate = True
                            evt.duplicate_of = u.event_id
                            duplicate_events.append(evt)
                            is_near_dup = True
                            break

        if not is_near_dup:
            seen_fingerprints[fp] = evt.event_id
            unique_events.append(evt)

    return unique_events, duplicate_events
