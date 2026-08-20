"""
Mesh Event Log — central source of truth for all mesh activity.

Captures:
  - gossip_hop: packet forwarded from one device to another
  - bridge_upload: bridge node attempted to upload packet to backend

Frontend consumes this via GET /api/mesh/events (polling) or
GET /api/mesh/events/stream (SSE) to drive live visualization.
"""
import threading
import time
from dataclasses import dataclass, asdict
from typing import Optional
from enum import Enum


class BridgeUploadResult(str, Enum):
    SETTLED = "settled"
    DUPLICATE = "duplicate"
    REJECTED_STALE = "rejected_stale"
    REJECTED_DECRYPT_FAIL = "rejected_decrypt_fail"
    REJECTED_INSUFFICIENT_BALANCE = "rejected_insufficient_balance"
    REJECTED_FUTURE_DATED = "rejected_future_dated"
    INTERNAL_ERROR = "internal_error"


@dataclass
class GossipHopEvent:
    event_type: str = "gossip_hop"
    packet_id: str = ""
    from_device: str = ""
    to_device: str = ""
    ttl: int = 0
    timestamp_ms: int = 0


@dataclass
class BridgeUploadEvent:
    event_type: str = "bridge_upload"
    packet_id: str = ""
    device_id: str = ""
    result: str = ""  # BridgeUploadResult value
    timestamp_ms: int = 0


class MeshEventLog:
    def __init__(self, max_events: int = 10000):
        self._events: list[dict] = []
        self._lock = threading.Lock()
        self.max_events = max_events

    def log_gossip_hop(self, packet_id: str, from_device: str, to_device: str, ttl: int) -> None:
        event = GossipHopEvent(
            packet_id=packet_id,
            from_device=from_device,
            to_device=to_device,
            ttl=ttl,
            timestamp_ms=int(time.time() * 1000),
        )
        self._append(asdict(event))

    def log_bridge_upload(
        self,
        packet_id: str,
        device_id: str,
        result: BridgeUploadResult,
    ) -> None:
        event = BridgeUploadEvent(
            packet_id=packet_id,
            device_id=device_id,
            result=result.value,
            timestamp_ms=int(time.time() * 1000),
        )
        self._append(asdict(event))

    def _append(self, event: dict) -> None:
        with self._lock:
            self._events.append(event)
            if len(self._events) > self.max_events:
                self._events = self._events[-self.max_events :]

    def get_events(self, since_ms: Optional[int] = None, limit: int = 1000) -> list[dict]:
        with self._lock:
            events = self._events
        if since_ms is not None:
            events = [e for e in events if e.get("timestamp_ms", 0) >= since_ms]
        return events[-limit:]

    def clear(self) -> None:
        with self._lock:
            self._events.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._events)