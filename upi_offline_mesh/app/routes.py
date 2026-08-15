"""
Port of ApiController.java + DashboardController.java.

Endpoint groups, same as the original:
  /api/server-key      -> so simulated senders can fetch the server's public key
  /api/mesh/*          -> simulator endpoints (inject, gossip, flush, reset)
  /api/bridge/ingest   -> THE real production endpoint a real bridge node would hit
  /api/accounts, /api/transactions -> for the dashboard
  /                    -> dashboard HTML
"""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from flask import Flask, jsonify, render_template, request


def register_routes(app: Flask, ctx) -> None:

    # ------------------------------------------------------------ dashboard
    @app.route("/")
    def dashboard():
        return render_template("dashboard.html")

    # ------------------------------------------------------------------ key
    @app.route("/api/server-key")
    def server_key():
        return jsonify({
            "publicKey": ctx.server_key.public_key_base64(),
            "algorithm": "RSA-2048 / OAEP-SHA256",
            "hybridScheme": "RSA-OAEP encrypts an AES-256-GCM session key",
        })

    # ---------------------------------------------------------------- demo
    @app.route("/api/demo/send", methods=["POST"])
    def demo_send():
        body = request.get_json(force=True)
        amount = Decimal(str(body["amount"]))
        ttl = body.get("ttl") if body.get("ttl") is not None else 5
        start_device = body.get("startDevice") or "phone-alice"

        packet = ctx.demo.create_packet(
            body["senderVpa"], body["receiverVpa"], amount, body["pin"], ttl)
        ctx.mesh.inject(start_device, packet)

        return jsonify({
            "packetId": packet["packetId"],
            "ciphertextPreview": packet["ciphertext"][:64] + "...",
            "ttl": packet["ttl"],
            "injectedAt": start_device,
        })

    # -------------------------------------------------------------- mesh sim
    @app.route("/api/mesh/state")
    def mesh_state():
        device_data = []
        for d in ctx.mesh.devices.values():
            device_data.append({
                "deviceId": d.device_id,
                "hasInternet": d.has_internet,
                "packetCount": d.packet_count(),
                "packetIds": [p["packetId"][:8] for p in d.held_packets()],
            })
        return jsonify({
            "devices": device_data,
            "idempotencyCacheSize": ctx.idempotency.size(),
        })

    @app.route("/api/mesh/gossip", methods=["POST"])
    def mesh_gossip():
        transfers, counts = ctx.mesh.gossip_once()
        return jsonify({"transfers": transfers, "deviceCounts": counts})

    @app.route("/api/mesh/flush", methods=["POST"])
    def mesh_flush():
        """
        "All bridge nodes simultaneously walk outside and get 4G." They all
        upload everything they hold to /api/bridge/ingest, in parallel — this
        is the moment the duplicate-storm idempotency case is exercised.
        """
        uploads = ctx.mesh.collect_bridge_uploads()

        def do_upload(item):
            bridge_node_id, pkt = item
            hop_count = 5 - pkt["ttl"]
            r = ctx.bridge.ingest(pkt, bridge_node_id, hop_count)
            return {
                "bridgeNode": bridge_node_id,
                "packetId": pkt["packetId"][:8],
                "outcome": r["outcome"],
                "reason": r["reason"] or "",
                "transactionId": r["transactionId"] if r["transactionId"] is not None else -1,
            }

        if uploads:
            with ThreadPoolExecutor(max_workers=len(uploads)) as ex:
                results = list(ex.map(do_upload, uploads))
        else:
            results = []

        return jsonify({"uploadsAttempted": len(uploads), "results": results})

    @app.route("/api/mesh/reset", methods=["POST"])
    def mesh_reset():
        ctx.mesh.reset_mesh()
        ctx.idempotency.clear()
        return jsonify({"status": "mesh and idempotency cache cleared"})

    # -------------------------------------------------------------- bridge
    @app.route("/api/bridge/ingest", methods=["POST"])
    def bridge_ingest():
        """THE PRODUCTION ENDPOINT. A real bridge node POSTs here."""
        packet = request.get_json(force=True)
        bridge_node_id = request.headers.get("X-Bridge-Node-Id", "unknown")
        hop_count = int(request.headers.get("X-Hop-Count", 0))

        result = ctx.bridge.ingest(packet, bridge_node_id, hop_count)
        return jsonify(result)

    # ------------------------------------------------------------- accounts
    @app.route("/api/accounts")
    def list_accounts():
        return jsonify([a.to_dict() for a in ctx.accounts.values()])

    @app.route("/api/transactions")
    def list_transactions():
        return jsonify([t.to_dict() for t in ctx.tx_store.top20()])
