"""
Port of IdempotencyConcurrencyTest.java.

The killer test: simulates the "three bridges deliver at the same instant"
scenario — a single packet, delivered concurrently by 3 threads, must settle
exactly once.

Run with:
    python -m pytest tests/test_idempotency.py -v
"""
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.bridge_ingestion_service import BridgeIngestionService
from app.crypto_service import HybridCryptoService, ServerKeyHolder
from app.demo_service import DemoService
from app.idempotency_service import IdempotencyService
from app.settlement_service import SettlementService, TransactionStore


def make_context():
    server_key = ServerKeyHolder()
    crypto = HybridCryptoService(server_key)
    idempotency = IdempotencyService()
    accounts = {}
    tx_store = TransactionStore()
    settlement = SettlementService(accounts, tx_store)
    bridge = BridgeIngestionService(crypto, idempotency, settlement)
    demo = DemoService(crypto, accounts)
    demo.seed_accounts()
    return crypto, server_key, idempotency, accounts, bridge, demo


def test_single_packet_delivered_by_three_bridges_settles_exactly_once():
    crypto, server_key, idempotency, accounts, bridge, demo = make_context()

    alice_before = accounts["alice@demo"].balance
    bob_before = accounts["bob@demo"].balance

    # One packet, delivered from 3 "bridges" simultaneously.
    packet = demo.create_packet("alice@demo", "bob@demo", Decimal("100.00"), "1234", 5)

    settled = 0
    duplicates = 0

    def deliver(node_id):
        return bridge.ingest(packet, node_id, 3)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(deliver, f"bridge-{i}") for i in range(3)]
        for f in as_completed(futures):
            result = f.result(timeout=5)
            if result["outcome"] == "SETTLED":
                settled += 1
            elif result["outcome"] == "DUPLICATE_DROPPED":
                duplicates += 1

    assert settled == 1, "exactly one bridge should settle"
    assert duplicates == 2, "the other two should be duplicates"

    alice_after = accounts["alice@demo"].balance
    bob_after = accounts["bob@demo"].balance
    assert alice_after == alice_before - Decimal("100.00")
    assert bob_after == bob_before + Decimal("100.00")


def test_tampered_ciphertext_is_rejected():
    crypto, server_key, idempotency, accounts, bridge, demo = make_context()

    packet = demo.create_packet("alice@demo", "bob@demo", Decimal("50.00"), "1234", 5)

    # Flip a character in the middle of the ciphertext.
    chars = list(packet["ciphertext"])
    mid = len(chars) // 2
    chars[mid] = "B" if chars[mid] == "A" else "A"
    packet["ciphertext"] = "".join(chars)

    result = bridge.ingest(packet, "bridge-x", 1)
    assert result["outcome"] == "INVALID"


def test_encrypt_decrypt_round_trip():
    crypto, server_key, idempotency, accounts, bridge, demo = make_context()

    original = {
        "senderVpa": "alice@demo",
        "receiverVpa": "bob@demo",
        "amount": 123.45,
        "pinHash": "abcdef",
        "nonce": "nonce-1",
        "signedAt": 1_700_000_000_000,
    }

    ct = crypto.encrypt(original)
    decrypted = crypto.decrypt(ct)

    assert decrypted["senderVpa"] == original["senderVpa"]
    assert decrypted["receiverVpa"] == original["receiverVpa"]
    assert decrypted["amount"] == original["amount"]
    assert decrypted["nonce"] == original["nonce"]


if __name__ == "__main__":
    test_single_packet_delivered_by_three_bridges_settles_exactly_once()
    print("test_single_packet_delivered_by_three_bridges_settles_exactly_once PASSED")
    test_tampered_ciphertext_is_rejected()
    print("test_tampered_ciphertext_is_rejected PASSED")
    test_encrypt_decrypt_round_trip()
    print("test_encrypt_decrypt_round_trip PASSED")
