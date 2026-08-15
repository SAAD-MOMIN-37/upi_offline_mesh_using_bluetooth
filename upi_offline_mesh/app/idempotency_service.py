"""
Port of IdempotencyService.java.

In-memory idempotency cache. In production this would be Redis with
`SET key NX EX <ttl>` — exactly the same semantics, just distributed across
instances.

Contract:
  - claim(hash) returns True on the first call, False on every call after
    that (within the TTL window).
  - The operation is atomic — even if 100 threads call claim(hash) at the
    same instant, exactly one returns True.

This is what kills the "three bridges deliver simultaneously" problem. A
plain dict guarded by a `threading.Lock` is the local equivalent of
ConcurrentHashMap.putIfAbsent / Redis SETNX.
"""
import threading
import time


class IdempotencyService:
    def __init__(self, ttl_seconds: int = 86400):
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()
        self.ttl_seconds = ttl_seconds

    def claim(self, packet_hash: str) -> bool:
        """Try to claim a hash. True = first claimer, False = duplicate."""
        with self._lock:
            if packet_hash in self._seen:
                return False
            self._seen[packet_hash] = time.time()
            return True

    def size(self) -> int:
        with self._lock:
            return len(self._seen)

    def clear(self) -> None:
        with self._lock:
            self._seen.clear()

    def evict_expired(self) -> None:
        """Periodically called from a background thread (see app/__init__.py)."""
        cutoff = time.time() - self.ttl_seconds
        with self._lock:
            expired = [k for k, v in self._seen.items() if v < cutoff]
            for k in expired:
                del self._seen[k]
