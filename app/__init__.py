"""
App factory. Wires together the equivalents of every Spring @Service /
@Component bean from the original project, and starts the same background
idempotency-cache eviction that @Scheduled(fixedDelay = 60_000) did.
"""
import threading
import time

from flask import Flask

from .bridge_ingestion_service import BridgeIngestionService
from .crypto_service import HybridCryptoService, ServerKeyHolder
from .demo_service import DemoService
from .event_log import MeshEventLog
from .idempotency_service import IdempotencyService
from .mesh_simulator import MeshSimulatorService
from .settlement_service import SettlementService, TransactionStore


class AppContext:
    """Equivalent of the Spring application context — one instance per process."""

    def __init__(self):
        self.server_key = ServerKeyHolder()
        self.crypto = HybridCryptoService(self.server_key)
        self.idempotency = IdempotencyService(ttl_seconds=259200)
        self.event_log = MeshEventLog()
        self.mesh = MeshSimulatorService(event_log=self.event_log)

        self.accounts: dict = {}
        self.tx_store = TransactionStore()
        self.settlement = SettlementService(self.accounts, self.tx_store)
        self.bridge = BridgeIngestionService(self.crypto, self.idempotency, self.settlement,
                                              max_age_seconds=86400, event_log=self.event_log)
        self.demo = DemoService(self.crypto, self.accounts)
        self.demo.seed_accounts()

    def start_background_eviction(self):
        def loop():
            while True:
                time.sleep(60)
                self.idempotency.evict_expired()
        threading.Thread(target=loop, daemon=True).start()


def create_app() -> Flask:
    app = Flask(__name__)
    ctx = AppContext()
    ctx.start_background_eviction()

    from .routes import register_routes
    register_routes(app, ctx)

    return app
