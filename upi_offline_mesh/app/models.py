"""
Domain models.

Original Java version used JPA entities (@Entity, @Version for optimistic
locking) backed by an in-memory H2 database. This demo doesn't need a real
database, so these are plain Python objects held in in-memory dicts, guarded
by locks where concurrent access matters (see settlement_service.py).
"""
from dataclasses import dataclass, field
from decimal import Decimal
from datetime import datetime
from enum import Enum
import threading


@dataclass
class Account:
    vpa: str            # Virtual Payment Address, e.g. "alice@demo"
    holder_name: str
    balance: Decimal
    # Per-account lock stands in for JPA's @Version optimistic locking.
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def to_dict(self):
        return {
            "vpa": self.vpa,
            "holderName": self.holder_name,
            "balance": str(self.balance),
        }


class TxStatus(str, Enum):
    SETTLED = "SETTLED"
    REJECTED = "REJECTED"


@dataclass
class Transaction:
    id: int
    packet_hash: str          # SHA-256 hex of the encrypted packet (idempotency key)
    sender_vpa: str
    receiver_vpa: str
    amount: Decimal
    signed_at: datetime       # when the sender originally signed it (offline)
    settled_at: datetime      # when the backend actually processed it
    bridge_node_id: str       # which mesh node finally delivered it
    hop_count: int
    status: TxStatus

    def to_dict(self):
        return {
            "id": self.id,
            "packetHash": self.packet_hash,
            "senderVpa": self.sender_vpa,
            "receiverVpa": self.receiver_vpa,
            "amount": str(self.amount),
            "signedAt": self.signed_at.isoformat(),
            "settledAt": self.settled_at.isoformat(),
            "bridgeNodeId": self.bridge_node_id,
            "hopCount": self.hop_count,
            "status": self.status.value,
        }
