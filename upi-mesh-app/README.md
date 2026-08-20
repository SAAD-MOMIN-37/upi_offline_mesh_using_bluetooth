# UPI Mesh Pay — Offline-First PWA Payment App

A consumer-facing UPI payment application that works offline using Bluetooth mesh networking. Send, request, and split payments without internet — transactions automatically settle when any device in the mesh reaches connectivity.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PWA (React + TypeScript)                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Wallet    │ │   Mesh UI   │ │  Settings   │           │
│  │  (Send/Req) │ │  (Visual)   │ │             │           │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘           │
│         │               │               │                   │
│  ┌──────▼───────────────▼───────────────▼──────┐           │
│  │         Service Worker (Offline Cache)       │           │
│  └──────┬───────────────┬───────────────┬──────┘           │
│         │               │               │                   │
│  ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐           │
│  │ Web Bluetooth│ │  IndexedDB  │ │  Web Crypto │           │
│  │    API      │ │  (Storage)  │ │    API      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS/WSS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Go + WebSocket)                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Gateway    │ │  Settlement │ │   Mesh      │           │
│  │  (Auth/API) │ │  Service    │ │  Coordinator│           │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘           │
│         │               │               │                   │
│  ┌──────▼───────────────▼───────────────▼──────┐           │
│  │         PostgreSQL + Redis (Idempotency)     │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Offline Payments**: Send money in basements, flights, remote areas
- **Bluetooth Mesh**: Automatic gossip protocol via Web Bluetooth API
- **QR Code Bootstrap**: Scan to initiate mesh connections
- **Split Bills**: One sender, multiple recipients
- **Request Money**: Pull payments via mesh
- **Real-time Settlement**: WebSocket ack delivery when online
- **Journey Visualization**: See packet path through mesh
- **PWA**: Installable, works offline, push notifications

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite + PWA (Workbox) |
| Backend | Go 1.22 + Gin + WebSocket + PostgreSQL + Redis |
| Protocol | Protobuf (CBOR wire format) |
| Crypto | Web Crypto API (RSA-OAEP + AES-256-GCM) |
| Mesh | Web Bluetooth API (GATT) |
| Styling | Tailwind CSS |
| State | Zustand |
| CI/CD | GitHub Actions |

## Quick Start

### Prerequisites

- Node.js 20+
- Go 1.22+
- Docker & Docker Compose
- buf (for protobuf): `go install github.com/bufbuild/buf/cmd/buf@latest`

### Development

```bash
# Clone and enter
cd upi-mesh-app

# Start all services (PostgreSQL, Redis, frontend, backend)
make up

# Or run individually:
# Terminal 1: Backend with hot reload
make backend

# Terminal 2: Frontend dev server
make frontend

# Generate protobuf code
make proto

# Run tests
make test

# Lint
make lint
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend (PWA) | https://localhost:3000 |
| Backend API | http://localhost:8080 |
| WebSocket | ws://localhost:8080/ws |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### HTTPS for Web Bluetooth

The frontend dev server runs on HTTPS (required for Web Bluetooth API). Accept the self-signed certificate warning on first visit.

## Project Structure

```
upi-mesh-app/
├── frontend/                 # PWA (React + TS)
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # bluetooth, crypto, storage
│   │   ├── pages/            # Route pages
│   │   ├── workers/          # Service worker, mesh worker
│   │   ├── types/            # TypeScript types
│   │   └── utils/            # Helpers
│   ├── public/               # Static assets, manifest, SW
│   └── package.json
├── backend/                  # Go API Server
│   ├── cmd/server/           # Entry point
│   ├── internal/
│   │   ├── api/              # HTTP + WebSocket handlers
│   │   ├── crypto/           # Hybrid encryption
│   │   ├── mesh/             # Gossip coordinator
│   │   ├── settlement/       # Ledger + idempotency
│   │   ├── store/            # PostgreSQL + Redis
│   │   └── config/           # Configuration
│   ├── go.mod
│   └── Dockerfile
├── shared/                   # Protobuf contracts
│   ├── proto/
│   └── buf.yaml
├── docker-compose.yml
├── Makefile
└── .github/workflows/
```

## Protobuf Contracts

Located in `shared/proto/`:
- `packet.proto` — Mesh packet formats
- `crypto.proto` — Encryption types
- `settlement.proto` — Settlement request/response
- `mesh.proto` — Mesh coordination messages

Generate code:
```bash
make proto  # Generates TypeScript + Go code
```

## Deployment

```bash
# Build production images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Deploy to Kubernetes (example)
kubectl apply -f k8s/
```

## Security

- **Hybrid Encryption**: RSA-OAEP (2048) + AES-256-GCM per packet
- **Idempotency**: Atomic Redis SETNX (72h TTL) prevents double-spend
- **Replay Protection**: 24h freshness window, 5min clock skew
- **Authentication**: WebAuthn/PIN before sending
- **Transport**: HTTPS/WSS only

## License

MIT