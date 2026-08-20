-- UPI Mesh Pay Database Schema
-- Version: 1

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vpa VARCHAR(255) UNIQUE NOT NULL,
    holder_name VARCHAR(255) NOT NULL,
    balance DECIMAL(19, 2) NOT NULL DEFAULT 0,
    bank_name VARCHAR(255),
    ifsc VARCHAR(11),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    vpa VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    last_interaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, vpa)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    packet_hash VARCHAR(64) UNIQUE NOT NULL,
    sender_vpa VARCHAR(255) NOT NULL,
    receiver_vpa VARCHAR(255) NOT NULL,
    amount DECIMAL(19, 2) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    bridge_node_id VARCHAR(255),
    hop_count INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SETTLED', 'REJECTED')),
    transaction_type VARCHAR(20) NOT NULL DEFAULT 'SEND' CHECK (transaction_type IN ('SEND', 'REQUEST', 'SPLIT', 'RECEIVE')),
    counterparty_name VARCHAR(255),
    counterparty_vpa VARCHAR(255),
    note TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_sender_vpa ON transactions(sender_vpa);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver_vpa ON transactions(receiver_vpa);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty_vpa ON transactions(counterparty_vpa);

-- Idempotency cache table (backed by Redis in production)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    packet_hash VARCHAR(64) PRIMARY KEY,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys(expires_at);

-- Mesh devices table
CREATE TABLE IF NOT EXISTS mesh_devices (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    has_internet BOOLEAN DEFAULT FALSE,
    is_current_device BOOLEAN DEFAULT FALSE,
    packet_count INTEGER DEFAULT 0,
    last_seen TIMESTAMPTZ,
    rssi INTEGER,
    is_killed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mesh events table (for audit/logging)
CREATE TABLE IF NOT EXISTS mesh_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    packet_id VARCHAR(255),
    from_device VARCHAR(255),
    to_device VARCHAR(255),
    device_id VARCHAR(255),
    ttl INTEGER,
    result VARCHAR(50),
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mesh_events_packet_id ON mesh_events(packet_id);
CREATE INDEX IF NOT EXISTS idx_mesh_events_timestamp ON mesh_events(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_mesh_events_device_id ON mesh_events(device_id);

-- Settlement audit log
CREATE TABLE IF NOT EXISTS settlement_audit (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT REFERENCES transactions(id),
    packet_hash VARCHAR(64) NOT NULL,
    bridge_node_id VARCHAR(255),
    hop_count INTEGER,
    outcome VARCHAR(50) NOT NULL,
    reason VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_audit_transaction ON settlement_audit(transaction_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_packet_hash ON settlement_audit(packet_hash);