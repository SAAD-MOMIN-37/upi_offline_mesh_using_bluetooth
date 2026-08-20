"""
Port of SettlementService.java.

Where the actual ledger update happens. `_lock` here stands in for the DB
transaction + @Version optimistic locking in the Java version: either both
the debit and credit happen, or neither does, and no two settlements can
race each other on the same accounts. (In this demo the idempotency layer
should always catch true duplicates first — this lock is defense in depth,
same as the original.)
"""
import itertools
import threading
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from .models import Transaction, TxStatus


class TransactionStore:
    """
    In-memory stand-in for TransactionRepository.java (JPA). Enforces the
    same unique constraint the DB had on packet_hash, as a defense-in-depth
    fallback if the idempotency cache layer were ever bypassed.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._id_counter = itertools.count(1)
        self._by_id: dict[int, Transaction] = {}
        self._by_hash: dict[str, Transaction] = {}

    def record(self, packet_hash, sender_vpa, receiver_vpa, amount,
               signed_at, bridge_node_id, hop_count, status: TxStatus) -> Transaction:
        with self._lock:
            if packet_hash in self._by_hash:
                raise ValueError(f"duplicate packet_hash: {packet_hash}")
            tx_id = next(self._id_counter)
            tx = Transaction(
                id=tx_id,
                packet_hash=packet_hash,
                sender_vpa=sender_vpa,
                receiver_vpa=receiver_vpa,
                amount=amount,
                signed_at=signed_at,
                settled_at=datetime.now(timezone.utc),
                bridge_node_id=bridge_node_id,
                hop_count=hop_count,
                status=status,
            )
            self._by_id[tx_id] = tx
            self._by_hash[packet_hash] = tx
            return tx

    def top20(self) -> list[Transaction]:
        with self._lock:
            ids = sorted(self._by_id.keys(), reverse=True)[:20]
            return [self._by_id[i] for i in ids]


class SettlementService:
    def __init__(
        self,
        accounts: dict,
        tx_store: TransactionStore,
        ack_service: Optional["AckService"] = None,
    ):
        self.accounts = accounts        # vpa -> Account
        self.tx_store = tx_store
        self._lock = threading.Lock()   # simulates the @Transactional boundary
        self.ack_service = ack_service

    def settle(
        self,
        instruction: dict,
        packet_hash: str,
        bridge_node_id: str,
        hop_count: int,
        original_packet_id: str = "",
        ack_key_b64: str = "",
    ) -> Transaction:
        sender_vpa = instruction["senderVpa"]
        receiver_vpa = instruction["receiverVpa"]
        amount = Decimal(str(instruction["amount"]))
        signed_at = datetime.fromtimestamp(instruction["signedAt"] / 1000, tz=timezone.utc)

        with self._lock:
            sender = self.accounts.get(sender_vpa)
            if sender is None:
                raise ValueError(f"Unknown sender VPA: {sender_vpa}")

            receiver = self.accounts.get(receiver_vpa)
            if receiver is None:
                raise ValueError(f"Unknown receiver VPA: {receiver_vpa}")

            if amount <= 0:
                raise ValueError("Amount must be positive")

            if sender.balance < amount:
                tx = self.tx_store.record(
                    packet_hash, sender_vpa, receiver_vpa, amount,
                    signed_at, bridge_node_id, hop_count, TxStatus.REJECTED)
                if self.ack_service and ack_key_b64:
                    self.ack_service.generate_and_inject_ack(
                        transaction_id=tx.id,
                        status=TxStatus.REJECTED,
                        amount=float(amount),
                        original_packet_id=original_packet_id,
                        ack_key_b64=ack_key_b64,
                        bridge_node_id=bridge_node_id,
                        hop_count=hop_count,
                    )
                return tx

            sender.balance -= amount
            receiver.balance += amount

            tx = self.tx_store.record(
                packet_hash, sender_vpa, receiver_vpa, amount,
                signed_at, bridge_node_id, hop_count, TxStatus.SETTLED)
            if self.ack_service and ack_key_b64:
                self.ack_service.generate_and_inject_ack(
                    transaction_id=tx.id,
                    status=TxStatus.SETTLED,
                    amount=float(amount),
                    original_packet_id=original_packet_id,
                    ack_key_b64=ack_key_b64,
                    bridge_node_id=bridge_node_id,
                    hop_count=hop_count,
                )
            return tx
