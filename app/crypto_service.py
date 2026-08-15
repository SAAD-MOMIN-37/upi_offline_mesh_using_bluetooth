"""
Port of HybridCryptoService.java + ServerKeyHolder.java.

Hybrid encryption — the same pattern used by TLS, PGP, Signal, etc.

Why hybrid? RSA can only encrypt small data (~245 bytes for a 2048-bit key).
Our payment instruction (JSON) might be ~300 bytes, and in real use we might
include device certificates and signatures pushing it well over.

Solution: generate a fresh AES key per packet, encrypt the JSON with AES-GCM
(fast + authenticated), then encrypt JUST the AES key with RSA-OAEP.

Wire format (after base64 encoding):
    [ 256 bytes RSA-encrypted AES key ][ 12 bytes GCM IV ][ ciphertext + 16-byte tag ]

AES-GCM is authenticated encryption: any single-bit tampering with the
ciphertext causes decryption to fail with an exception. This is what makes it
safe for untrusted intermediates to hold.
"""
import base64
import hashlib
import json
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

RSA_ENCRYPTED_KEY_BYTES = 256  # for a 2048-bit RSA key
GCM_IV_BYTES = 12
GCM_TAG_BYTES = 16
AES_KEY_BYTES = 32  # AES-256


class ServerKeyHolder:
    """
    Holds the server's RSA keypair.

    In production, the private key would live in an HSM (Hardware Security
    Module) or at least a KMS like AWS KMS / HashiCorp Vault. NEVER in source
    control. For this demo we generate a fresh keypair on every startup, just
    like the original Java version.
    """

    def __init__(self):
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.public_key = self.private_key.public_key()

    def public_key_base64(self) -> str:
        der = self.public_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return base64.b64encode(der).decode()


class HybridCryptoService:
    def __init__(self, server_key: ServerKeyHolder):
        self.server_key = server_key

    def _oaep(self):
        return padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        )

    def encrypt(self, instruction: dict) -> str:
        """Encrypt a payment instruction dict with the server's public key."""
        plaintext = json.dumps(instruction, separators=(",", ":")).encode("utf-8")

        aes_key = os.urandom(AES_KEY_BYTES)
        iv = os.urandom(GCM_IV_BYTES)
        aesgcm = AESGCM(aes_key)
        # AESGCM.encrypt appends the 16-byte auth tag to the ciphertext already.
        aes_ciphertext = aesgcm.encrypt(iv, plaintext, None)

        encrypted_aes_key = self.server_key.public_key.encrypt(aes_key, self._oaep())

        packed = encrypted_aes_key + iv + aes_ciphertext
        return base64.b64encode(packed).decode("utf-8")

    def decrypt(self, b64_ciphertext: str) -> dict:
        """
        Decrypt with the server's private key. If anything has been tampered
        with — wrong key, modified ciphertext, truncated input — this raises.
        """
        all_bytes = base64.b64decode(b64_ciphertext)

        min_len = RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES + GCM_TAG_BYTES
        if len(all_bytes) < min_len:
            raise ValueError("Ciphertext too short")

        encrypted_aes_key = all_bytes[:RSA_ENCRYPTED_KEY_BYTES]
        iv = all_bytes[RSA_ENCRYPTED_KEY_BYTES:RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES]
        aes_ciphertext = all_bytes[RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES:]

        aes_key = self.server_key.private_key.decrypt(encrypted_aes_key, self._oaep())

        aesgcm = AESGCM(aes_key)
        plaintext = aesgcm.decrypt(iv, aes_ciphertext, None)  # raises if tag invalid

        return json.loads(plaintext)

    @staticmethod
    def hash_ciphertext(b64_ciphertext: str) -> str:
        """
        SHA-256 of the ciphertext. THIS is the idempotency key.

        Why ciphertext and not packetId? Intermediates can rewrite packetId,
        but cannot forge a valid ciphertext for a different payload. Two
        delivered copies of the same packet have identical ciphertexts, hence
        identical hashes.
        """
        return hashlib.sha256(b64_ciphertext.encode("utf-8")).hexdigest()
