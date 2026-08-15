"""
Entry point for the offline UPI mesh demo (Python port).

Run from terminal:
    python run.py

Then open http://localhost:8080
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    # threaded=True matters here: /api/mesh/flush uploads bridge packets in
    # parallel to exercise the idempotency race, and the dashboard polls
    # every 3 seconds while that happens.
    app.run(host="0.0.0.0", port=8080, debug=False, threaded=True)
