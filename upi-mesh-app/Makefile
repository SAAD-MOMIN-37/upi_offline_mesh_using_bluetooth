# UPI Mesh Pay — Common Commands
.PHONY: dev up down logs proto frontend backend test lint clean install help

# Default target
help:
	@echo "UPI Mesh Pay — Development Commands"
	@echo ""
	@echo "Docker Compose:"
	@echo "  make up          Start all services (PostgreSQL, Redis, frontend, backend)"
	@echo "  make down        Stop all services and remove volumes"
	@echo "  make logs        Follow logs from all services"
	@echo "  make restart     Restart all services"
	@echo ""
	@echo "Development:"
	@echo "  make frontend    Run frontend dev server (port 3000)"
	@echo "  make backend     Run backend with hot reload (port 8080)"
	@echo "  make proto       Generate protobuf code (TS + Go)"
	@echo ""
	@echo "Quality:"
	@echo "  make test        Run all tests"
	@echo "  make lint        Run linters (frontend + backend)"
	@echo "  make typecheck   TypeScript type checking"
	@echo ""
	@echo "Setup:"
	@echo "  make install     Install all dependencies"
	@echo "  make clean       Clean build artifacts and node_modules"
	@echo ""

# Docker Compose
up:
	docker compose up -d

down:
	docker compose down -v

logs:
	docker compose logs -f

restart: down up

# Frontend
frontend:
	cd frontend && npm run dev

# Backend
backend:
	cd backend && air -c .air.toml

# Protobuf
proto:
	buf generate

# Install dependencies
install:
	cd frontend && npm ci
	cd backend && go mod download
	go install github.com/bufbuild/buf/cmd/buf@latest
	go install github.com/cosmtrek/air@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Test
test:
	cd frontend && npm run test
	cd backend && go test ./...

# Lint
lint:
	cd frontend && npm run lint
	cd backend && golangci-lint run

# Type check
typecheck:
	cd frontend && npm run typecheck

# Clean
clean:
	docker compose down -v --rmi all 2>/dev/null || true
	rm -rf frontend/node_modules frontend/dist
	rm -rf backend/bin backend/vendor
	rm -rf shared/proto/**/*.ts shared/proto/**/*.go
	find . -name "*.tsbuildinfo" -delete

# Build production
build:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Database
db-migrate:
	cd backend && go run cmd/migrate/main.go

db-seed:
	cd backend && go run cmd/seed/main.go

# Generate certificates for HTTPS dev
certs:
	@mkdir -p frontend/public/certs
	@if [ ! -f frontend/public/certs/localhost.pem ]; then \
		openssl req -x509 -newkey rsa:2048 -keyout frontend/public/certs/localhost-key.pem \
			-out frontend/public/certs/localhost.pem -days 365 -nodes \
			-subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"; \
		echo "Certificates generated in frontend/public/certs/"; \
	fi