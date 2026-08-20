"""
Port of BridgeIngestionService.java.

Orchestrates the full server-side pipeline for one inbound packet from a
bridge node:

  1. Hash the ciphertext.
  2. Try to claim that hash via the idempotency cache.
     - If already claimed: this is a duplicate. Drop it.
  3. Decrypt the ciphertext with the server's private key.
     - If decryption fails: tampered or junk. Reject.
  4. Check freshness — reject if signedAt is too old (replay protection).
  5. Hand off to SettlementService for the actual debit/credit.

NOTE (kept faithful to the original): just like the Java version, a
settlement that comes back REJECTED (e.g. insufficient balance) is still
reported here as outcome "SETTLED" with the transactionId populated — the
actual SETTLED/REJECTED status lives on the transaction record itself
(visible in the ledger). This mirrors the original IngestResult.settled(...)
call, which unconditionally used that outcome regardless of tx.status.
"""
import logging
from datetime import datetime, timezone

from .event_log import BridgeUploadResult, MeshEventLog

logger = logging.getLogger("upimesh.bridge")


class BridgeIngestionService:
    def __init__(self, crypto, idempotency, settlement, max_age_seconds: int = 86400, event_log: MeshEventLog | None = None):
        self.crypto = crypto
        self.idempotency = idempotency
        self.settlement = settlement
        self.max_age_seconds = max_age_seconds
        self.event_log = event_log

    def ingest(self, packet: dict, bridge_node_id: str, hop_count: int) -> dict:
        packet_id = packet.get("packetId", "unknown")
        try:
            packet_hash = self.crypto.hash_ciphertext(packet["ciphertext"])

            # ---- Idempotency gate ----
            if not self.idempotency.claim(packet_hash):
                logger.info("DUPLICATE packet %s from bridge %s — dropped",
                            packet_hash[:12] + "...", bridge_node_id)
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.DUPLICATE)
                return {"outcome": "DUPLICATE_DROPPED", "packetHash": packet_hash,
                        "reason": "duplicate", "transactionId": None}

            # ---- Decrypt ----
            try:
                instruction = self.crypto.decrypt(packet["ciphertext"])
            except Exception as e:
                logger.warning("Decryption failed for packet %s: %s", packet_hash[:12] + "...", e)
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.REJECTED_DECRYPT_FAIL)
                return {"outcome": "DECRYPTION_FAILED", "packetHash": packet_hash,
                        "reason": "decryption_failed", "transactionId": None}

            # ---- Freshness check (replay protection) ----
            now_ms = datetime.now(timezone.utc).timestamp() * 1000
            age_seconds = (now_ms - instruction["signedAt"]) / 1000
            if age_seconds > self.max_age_seconds:
                logger.warning("Packet %s too old (%ss), rejected", packet_hash[:12] + "...", age_seconds)
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.REJECTED_STALE)
                return {"outcome": "STALE_PACKET", "packetHash": packet_hash,
                        "reason": "stale_packet", "transactionId": None}
            if age_seconds < -300:  # small clock-skew tolerance
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.REJECTED_FUTURE_DATED)
                return {"outcome": "FUTURE_DATED", "packetHash": packet_hash,
                        "reason": "future_dated", "transactionId": None}

            # ---- Settle ----
            original_packet_id = instruction.get("originalPacketId", "")
            ack_key_b64 = instruction.get("ackKey", "")
            tx = self.settlement.settle(
                instruction, packet_hash, bridge_node_id, hop_count,
                original_packet_id=original_packet_id,
                ack_key_b64=ack_key_b64,
            )
            if tx.status.value == "REJECTED":
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.REJECTED_INSUFFICIENT_BALANCE)
                return {"outcome": "INSUFFICIENT_BALANCE", "packetHash": packet_hash,
                        "reason": "insufficient_balance", "transactionId": tx.id}
            else:
                if self.event_log:
                    self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.SETTLED)
                return {"outcome": "SETTLED", "packetHash": packet_hash,
                        "reason": None, "transactionId": tx.id}

        except Exception as e:
            logger.error("Ingestion error: %s", e, exc_info=True)
            if self.event_log:
                self.event_log.log_bridge_upload(packet_id, bridge_node_id, BridgeUploadResult.INTERNAL_ERROR)
            return {"outcome": "INTERNAL_ERROR", "packetHash": "?",
                     "reason": f"internal_error: {e}", "transactionId": None}
