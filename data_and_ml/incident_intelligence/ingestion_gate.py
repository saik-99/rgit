"""
SHA-256 Ingestion Gate — Cybersecurity Boundary Layer.

Sits at the boundary between raw incoming data (sensor feeds, API payloads,
CSV rows, social-media posts) and the NuSCAN AI engine (H3 grid, spatial
clustering, causal graph).  Every record must pass SHA-256 verification
before it is admitted into the pipeline.

Pipeline position:

    [Raw Dataset / API Feed]
              |
              v
    +---------------------------------------------------------+
    |  STEP 1: SHA-256 Ingestion Gate                         |
    |  - Compute canonical SHA-256 of incoming record         |
    |  - Compare against registered authoritative hash        |
    |  - trust=1.0 (verified)  0.5 (new)  0.0 (tampered)     |
    +---------------------------------------------------------+
              |
    +---------+---------------------+
    |  Tampered / Unregistered      |  Verified
    |  Reject + Flag Spoof Attack   v
    +-----------------------------  STEP 2: NuSCAN AI Engine
                                    (H3 Hex Grid, Clustering, Causal Graph)

Usage:
    from incident_intelligence.ingestion_gate import IngestionGate, compute_sha256

    gate = IngestionGate(mode="permissive")  # "strict" for production
    gate.register(record)                    # call once at trusted ingest time
    result = gate.verify(record)             # call before AI engine
    if result.admitted:
        engine.analyze_events([record])
    else:
        alert_security_team(result)          # spoof / tamper detected
"""

import hashlib
import json
import logging
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canonical serialiser
# ---------------------------------------------------------------------------

def _canonical_bytes(record: Any) -> bytes:
    """
    Produce a deterministic, canonical UTF-8 byte representation of a record.

    Internal gate bookkeeping fields are stripped so the hash is always
    computed over the original payload only, never over gate annotations.
    """
    _GATE_FIELDS = {"_sha256", "_gate_admitted", "_gate_reason", "_gate_trust"}
    if isinstance(record, dict):
        clean = {k: v for k, v in record.items() if k not in _GATE_FIELDS}
        return json.dumps(
            clean, sort_keys=True, ensure_ascii=False,
            separators=(",", ":"), default=str
        ).encode("utf-8")
    if isinstance(record, bytes):
        return record
    return str(record).encode("utf-8")


def compute_sha256(record: Any) -> str:
    """Return the hex-encoded SHA-256 digest of the canonical representation."""
    return hashlib.sha256(_canonical_bytes(record)).hexdigest()


# ---------------------------------------------------------------------------
# Gate result
# ---------------------------------------------------------------------------

@dataclass
class GateResult:
    """Decision record produced by the Ingestion Gate for a single incoming row."""
    record_id: str
    sha256: str
    admitted: bool
    trust_score: float              # 1.0 verified | 0.5 new-record | 0.0 tampered
    reason: str
    is_spoof_flagged: bool = False
    registered_sha256: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Signature Registry
# ---------------------------------------------------------------------------

class SignatureRegistry:
    """
    Stores the authoritative SHA-256 signature for each record ID.

    In production this should be backed by a tamper-evident store such as
    an append-only database, HSM, or a blockchain ledger.  For development
    and hackathon usage an in-process dict is sufficient.
    """

    def __init__(self) -> None:
        self._store: Dict[str, str] = {}

    def register(self, record_id: str, sha256: str) -> None:
        self._store[record_id] = sha256
        logger.debug("GATE REGISTRY: registered %s -> %s...", record_id, sha256[:12])

    def lookup(self, record_id: str) -> Optional[str]:
        return self._store.get(record_id)

    def __len__(self) -> int:
        return len(self._store)

    def __contains__(self, record_id: str) -> bool:
        return record_id in self._store


# ---------------------------------------------------------------------------
# Ingestion Gate
# ---------------------------------------------------------------------------

class IngestionGate:
    """
    SHA-256 Ingestion Gate — the cybersecurity boundary between raw data and
    the AI engine.

    Modes
    -----
    permissive  Records with no registered hash are ADMITTED with trust 0.5
                and auto-registered.  Use during development / source onboarding.
    strict      Records with no registered hash are REJECTED.
                Use in production to enforce all data is pre-registered.
    """

    TRUST_VERIFIED: float = 1.00   # hash matches registered value  -> full trust
    TRUST_NEW:      float = 0.50   # no prior registration (permissive mode)
    TRUST_TAMPERED: float = 0.00   # hash mismatch -> reject

    def __init__(self, mode: str = "permissive", id_field: str = "event_id") -> None:
        if mode not in ("strict", "permissive"):
            raise ValueError("mode must be 'strict' or 'permissive'")
        self.mode = mode
        self.id_field = id_field
        self.registry = SignatureRegistry()
        self._stats: Dict[str, int] = {
            "admitted": 0, "rejected": 0, "spoof_flags": 0, "new": 0
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _extract_id(self, record: Any) -> str:
        """Extract the best-effort string identifier from a record."""
        if isinstance(record, dict):
            for key in (self.id_field, "id", "unique_key", "event_id",
                        "record_id", "uuid"):
                val = record.get(key)
                if val:
                    return str(val)
        elif hasattr(record, self.id_field):
            val = getattr(record, self.id_field, None)
            if val:
                return str(val)
        # Fall back to first 16 hex chars of the hash itself
        return "UNKNOWN-" + compute_sha256(record)[:16]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register(self, record: Any) -> str:
        """
        Compute and store the authoritative SHA-256 for a record.

        Call this exactly once when a record is first received from a trusted
        source (e.g. immediately after fetching from a government API or
        validated sensor hardware).

        Returns the computed hex digest.
        """
        record_id = self._extract_id(record)
        sha256    = compute_sha256(record)
        self.registry.register(record_id, sha256)
        return sha256

    def register_bulk(self, records: List[Any]) -> Dict[str, str]:
        """Register many records at once. Returns {record_id: sha256}."""
        return {self._extract_id(r): self.register(r) for r in records}

    def verify(self, record: Any) -> GateResult:
        """
        Verify a single record against the registry.

        Returns a GateResult.  Inspect result.admitted before passing the
        record into the AI engine.  If result.is_spoof_flagged is True,
        escalate to your security / alerting pipeline.
        """
        record_id  = self._extract_id(record)
        sha256     = compute_sha256(record)
        registered = self.registry.lookup(record_id)

        # ---- No registered hash ----------------------------------------
        if registered is None:
            if self.mode == "strict":
                self._stats["rejected"] += 1
                logger.warning("GATE REJECT [unregistered] id=%s", record_id)
                return GateResult(
                    record_id=record_id,
                    sha256=sha256,
                    admitted=False,
                    trust_score=self.TRUST_TAMPERED,
                    reason="UNREGISTERED: no prior signature found. Rejected (strict mode).",
                    is_spoof_flagged=False,
                    registered_sha256=None,
                )
            # permissive — auto-register and admit with reduced trust
            self.registry.register(record_id, sha256)
            self._stats["admitted"] += 1
            self._stats["new"] += 1
            logger.info("GATE ADMIT [new] id=%s hash=%s...", record_id, sha256[:12])
            return GateResult(
                record_id=record_id,
                sha256=sha256,
                admitted=True,
                trust_score=self.TRUST_NEW,
                reason="NEW: no prior signature. Auto-registered (permissive mode). Trust=0.5.",
                is_spoof_flagged=False,
                registered_sha256=sha256,
            )

        # ---- Hash MATCH → VERIFIED ------------------------------------
        if sha256 == registered:
            self._stats["admitted"] += 1
            logger.debug("GATE ADMIT [verified] id=%s", record_id)
            return GateResult(
                record_id=record_id,
                sha256=sha256,
                admitted=True,
                trust_score=self.TRUST_VERIFIED,
                reason="VERIFIED: SHA-256 matches registered signature.",
                is_spoof_flagged=False,
                registered_sha256=registered,
            )

        # ---- Hash MISMATCH → SPOOF / TAMPERING DETECTED ---------------
        self._stats["rejected"] += 1
        self._stats["spoof_flags"] += 1
        logger.error(
            "GATE REJECT [TAMPERED/SPOOF] id=%s expected=%s... got=%s...",
            record_id, registered[:12], sha256[:12],
        )
        return GateResult(
            record_id=record_id,
            sha256=sha256,
            admitted=False,
            trust_score=self.TRUST_TAMPERED,
            reason=(
                "TAMPERED: SHA-256 mismatch. "
                f"Expected {registered[:16]}..., got {sha256[:16]}... "
                "Record flagged as potential spoof attack."
            ),
            is_spoof_flagged=True,
            registered_sha256=registered,
        )

    def screen_batch(
        self,
        records: List[Any],
    ) -> Tuple[List[Any], List[GateResult], List[GateResult]]:
        """
        Screen an entire batch of records through the gate in one call.

        Returns
        -------
        admitted_records  : list[Any]        records that passed the gate
        admitted_results  : list[GateResult] gate decision for each admitted record
        rejected_results  : list[GateResult] gate decision for each rejected record
        """
        admitted_records: List[Any]        = []
        admitted_results: List[GateResult] = []
        rejected_results: List[GateResult] = []

        for record in records:
            result = self.verify(record)
            if result.admitted:
                admitted_records.append(record)
                admitted_results.append(result)
            else:
                rejected_results.append(result)

        spoof_count = sum(1 for r in rejected_results if r.is_spoof_flagged)
        logger.info(
            "GATE BATCH: %d/%d admitted | %d rejected | %d spoof flags",
            len(admitted_records), len(records), len(rejected_results), spoof_count,
        )
        return admitted_records, admitted_results, rejected_results

    def annotate(self, record: Any) -> dict:
        """
        Verify a record and return it as a plain dict annotated with gate metadata.

        Convenience helper for dict-centric pipelines.  The gate fields
        (_sha256, _gate_admitted, _gate_reason, _gate_trust) are stripped
        before hashing so repeated calls remain idempotent.
        """
        result = self.verify(record)
        if isinstance(record, dict):
            out = dict(record)
        elif hasattr(record, "to_dict"):
            out = record.to_dict()
        else:
            out = {"value": str(record)}
        out["_sha256"]         = result.sha256
        out["_gate_admitted"]  = result.admitted
        out["_gate_reason"]    = result.reason
        out["_gate_trust"]     = result.trust_score
        return out

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    @property
    def stats(self) -> Dict[str, int]:
        """Cumulative gate statistics since instantiation."""
        return dict(self._stats)

    def summary(self) -> str:
        """Return a human-readable one-line summary of gate activity."""
        s     = self._stats
        total = s["admitted"] + s["rejected"]
        rate  = (s["admitted"] / total * 100) if total else 0.0
        return (
            f"IngestionGate [{self.mode.upper()}] | "
            f"Registered: {len(self.registry)} | "
            f"Processed: {total} | "
            f"Admitted: {s['admitted']} ({rate:.1f}%) | "
            f"Rejected: {s['rejected']} | "
            f"New (auto-reg): {s['new']} | "
            f"Spoof Flags: {s['spoof_flags']}"
        )
