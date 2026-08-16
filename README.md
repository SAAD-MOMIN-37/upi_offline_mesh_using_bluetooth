# UPI Offline Mesh — Demo (Python port)

This is a **Python (Flask)** conversion of the original Java/Spring Boot
project [`perryvegehan/UPI_Without_Internet`](https://github.com/perryvegehan/UPI_Without_Internet).

Same concept, same architecture, same crypto scheme, same REST API, same
dashboard — just Python instead of Java, with no database/JPA/Maven
dependency chain.

> Offline UPI payments routed through a Bluetooth-style mesh network. You're
> in a basement with zero connectivity. You send your friend ₹500. Your
> phone encrypts the payment, broadcasts it to nearby phones, and the packet
> hops device-to-device until *some* phone walks outside, gets 4G, and
> silently uploads it to this backend. The backend decrypts, deduplicates,
> and settles.

## How to run

```bash
pip install -r requirements.txt
python run.py
```

Then open **http://localhost:8080** — same dashboard, same buttons
(Inject into Mesh → Run Gossip Round → Bridges Upload to Backend).

## Run the tests

```bash
pip install pytest
python -m pytest tests/test_idempotency.py -v
```

Includes the "killer test": one packet delivered by 3 bridges at the exact
same instant, asserting exactly one settles and the other two are dropped
as duplicates.

## Project layout

```
upi_offline_mesh_python/
├── run.py                          Entry point (was UpiMeshApplication.java)
├── requirements.txt
├── app/
│   ├── __init__.py                 App factory / DI wiring (was AppConfig.java)
│   ├── models.py                   Account, Transaction (was model/*.java)
│   ├── crypto_service.py           RSA-OAEP + AES-256-GCM hybrid crypto
│   │                                (was crypto/HybridCryptoService.java + ServerKeyHolder.java)
│   ├── idempotency_service.py      Thread-safe claim-once cache (was service/IdempotencyService.java)
│   ├── mesh_simulator.py           Virtual devices + gossip (was service/VirtualDevice.java + MeshSimulatorService.java)
│   ├── settlement_service.py       Debit/credit + ledger (was service/SettlementService.java)
│   ├── bridge_ingestion_service.py Hash → claim → decrypt → freshness → settle
│   │                                (was service/BridgeIngestionService.java)
│   ├── demo_service.py             Seed accounts + simulate sender phone (was service/DemoService.java)
│   ├── routes.py                   REST endpoints (was controller/ApiController.java + DashboardController.java)
│   └── templates/
│       └── dashboard.html          Same dashboard UI/JS, served via Flask/Jinja instead of Thymeleaf
└── tests/
    └── test_idempotency.py         Port of IdempotencyConcurrencyTest.java
```

## What changed vs. the Java version

| Java/Spring version                    | Python version                                              |
| --------------------------------------- | ------------------------------------------------------------- |
| Spring Boot + embedded Tomcat           | Flask dev server (`threaded=True`)                            |
| H2 in-memory DB via JPA/Hibernate       | Plain Python dicts, guarded with `threading.Lock`             |
| `@Version` optimistic locking           | A lock around the debit/credit critical section               |
| `ConcurrentHashMap.putIfAbsent`         | `dict` + `threading.Lock` (same atomicity guarantee)           |
| `javax.crypto` (RSA-OAEP, AES-GCM)      | Python `cryptography` library (same algorithms, same wire format) |
| `@Scheduled` cache eviction             | A daemon thread that sleeps 60s and evicts                     |
| Maven (`pom.xml`, `mvnw`)               | `requirements.txt` (`pip install`)                              |
| JUnit 5 + `@SpringBootTest`             | plain `pytest`                                                 |

The wire-level ciphertext format (`[256-byte RSA-wrapped AES key][12-byte IV][AES-GCM ciphertext+tag]`,
base64-encoded) and the REST API (paths, request/response JSON shape) are
**unchanged**, so the dashboard's JavaScript works without modification.

## Honest limitations (same as the original)

This is a teaching/portfolio demo, not production-ready offline UPI. The
"[Honest limitations of the concept](https://github.com/perryvegehan/UPI_Without_Internet#honest-limitations-of-the-concept)"
section of the original README applies unchanged: no offline proof of
funds, possible double-spend across basements, real BLE mesh is much harder
than this simulator, and packet metadata (who's carrying what) is a privacy
consideration in a real deployment.

## License

Demo code, no license — same as upstream. Use it however you want for learning.
