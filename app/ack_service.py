"""
Settlement Acknowledgment Service.

Generates an ack packet when settlement completes (success or rejection),
encrypts it with the symmetric ackKey from the original packet, and
injects it into the mesh at the bridge node for gossip propagation back
toward the sender.

The ack packet format (encrypted with ackKey via AES-GCM):
{
  "transactionId": int,
  "status": "SETTLED" | "REJECTED",
  "amount": float,
  "timestamp": int (ms since epoch),
  "originalPacketId": str,
  "bridgeNodeId": str
}
"""
import json
import uuid
from datetime import datetime, timezone

from .crypto_service import HybridCryptoService, AESGCM
from .mesh_simulator import MeshSimulatorService
from .event_log import MeshEventLog
from .models import TxStatus


class AckService:
    def __init__(self, crypto: HybridCryptoService, mesh: MeshSimulatorService, event_log: MeshEventLog):
        self.crypto = crypto
        self.mesh = mesh
        self.event_log = event_log

    def _encrypt_ack(self, ack_payload: dict, ack_key: bytes) -> str:
        """Encrypt ack payload with AES-GCM using the ack_key."""
        from .crypto_service import GCM_IV_BYTES
        import os

        plaintext = json.dumps(ack_payload, separators=(",", ":")).encode("utf-8")
        iv = os.urandom(GCM_IV_BYTES)
        aesgcm = AESGCM(ack_key)
        ciphertext = aesgcm.encrypt(iv, plaintext, None)
        # Pack as: iv + ciphertext (no RSA layer since symmetric)
        import base64
        packed = iv + ciphertext
        return base64.b64encode(packed).decode("utf-8")

    def generate_and_inject_ack(
        self,
        transaction_id: int,
        status: TxStatus,
        amount: float,
        original_packet_id: str,
        ack_key_b64: str,
        bridge_node_id: str,
        hop_count: int,
    ) -> None:
        """
        Create ack packet and inject into mesh at the bridge node.
        The ack will gossip back through the mesh toward the sender.
        """
        ack_payload = {
            "transactionId": transaction_id,
            "status": status.value,
            "amount": amount,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "originalPacketId": original_packet_id,
            "bridgeNodeId": bridge_node_id,
        }

        import base64
        ack_key = base64.b64decode(ack_key_b64)
        ack_ciphertext = self._encrypt_ack(ack_payload, ack_key)

        ack_packet = {
            "packetId": str(uuid.uuid4()),
            "ttl": 5,  # Same TTL as forward packets
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "ciphertext": ack_ciphertext,
            "_is_ack": True,  # Marker for frontend filtering
            "_ackTransactionId": transaction_id,
        }

        # Inject at the bridge node that settled the transaction
        bridge_device = self.mesh.get_device(bridge_node_id)
        if bridge_device:
            bridge_device.hold(ack_packet)
            if self.event_log:
                self.event_log.log_gossip_hop(
                    packet_id=ack_packet["packetId"],
                    from_device=bridge_node_id,
                    to_device=bridge_node_id,  # Self-hop = injected at bridge
                    ttl=ack_packet["ttl"],
                )

    def generate_and_inject_ack_from_instruction(
        self,
        instruction: dict,
        transaction_id: int,
        status: TxStatus,
        bridge_node_id: str,
        hop_count: int,
    ) -> None:
        """
        Convenience method that extracts ackKey from instruction and generates ack.
        """
        ack_key_b64 = instruction.get("ackKey")
        if not ack_key_b64:
            return  # No ackKey, can't send ack (shouldn't happen in normal flow)

        original_packet_id = instruction.get("originalPacketId", "")
        amount = float(instruction.get("amount", 0))

        self.generate_and_inject_ack(
            transaction_id=transaction_id,
            status=status,
            amount=amount,
            original_packet_id=original_packet_id,
            ack_key_b64=ack_key_b64,
            bridge_node_id=bridge_node_id,
            hop_count=hop_count,
        )