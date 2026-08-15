"""
Port of DemoService.java.

  - Seeds demo accounts on startup.
  - Simulates the "sender phone creates an encrypted packet" flow.
"""
import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from .models import Account


class DemoService:
    def __init__(self, crypto, accounts: dict):
        self.crypto = crypto
        self.accounts = accounts

    def seed_accounts(self) -> None:
        if not self.accounts:
            self.accounts["alice@demo"] = Account("alice@demo", "Alice", Decimal("5000.00"))
            self.accounts["bob@demo"] = Account("bob@demo", "Bob", Decimal("1000.00"))
            self.accounts["carol@demo"] = Account("carol@demo", "Carol", Decimal("2500.00"))
            self.accounts["dave@demo"] = Account("dave@demo", "Dave", Decimal("500.00"))

    def create_packet(self, sender_vpa: str, receiver_vpa: str,
                       amount: Decimal, pin: str, ttl: int = 5) -> dict:
        """
        Simulates the sender's phone:
          1. Build a payment instruction with a fresh nonce + signedAt timestamp.
          2. Encrypt with the server's public key (hybrid RSA+AES).
          3. Wrap in a mesh packet with TTL.

        In a real Android/iOS app, this exact logic (minus the server-side
        reference) would run on the phone itself, using a public key cached
        during a previous online session.
        """
        instruction = {
            "senderVpa": sender_vpa,
            "receiverVpa": receiver_vpa,
            "amount": float(amount),
            "pinHash": hashlib.sha256(pin.encode("utf-8")).hexdigest(),
            "nonce": str(uuid.uuid4()),                                   # guarantees uniqueness
            "signedAt": int(datetime.now(timezone.utc).timestamp() * 1000),  # for freshness check
        }

        ciphertext = self.crypto.encrypt(instruction)

        return {
            "packetId": str(uuid.uuid4()),
            "ttl": ttl,
            "createdAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "ciphertext": ciphertext,
        }
