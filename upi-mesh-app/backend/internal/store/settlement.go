package store

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type SettlementService struct {
	pgPool    *pgxpool.Pool
	redis     *redis.Client
	idempotencyTTL time.Duration
	maxAgeSeconds int
}

type Transaction struct {
	ID             int64
	PacketHash     string
	SenderVPA      string
	ReceiverVPA    string
	Amount         string
	SignedAt       time.Time
	SettledAt      time.Time
	BridgeNodeID   string
	HopCount       int
	Status         string // SETTLED | REJECTED
	TransactionType string
	CounterpartyName string
	CounterpartyVPA string
	Note           string
	ExpiresAt      *time.Time
}

type SettlementResult struct {
	Outcome        string // SETTLED, DUPLICATE_DROPPED, DECRYPTION_FAILED, STALE_PACKET, FUTURE_DATED, INSUFFICIENT_BALANCE, INTERNAL_ERROR
	PacketHash     string
	Reason         string
	TransactionID  int64
}

type PaymentInstruction struct {
	SenderVPA      string
	ReceiverVPA    string
	Amount         string
	PinHash        string
	Nonce          string
	SignedAt       int64
	ACKKey         []byte
	OriginalPacketID string
}

func NewSettlementService(pgPool *pgxpool.Pool, redisClient *redis.Client) *SettlementService {
	return &SettlementService{
		pgPool: pgPool,
		redis: redisClient,
		idempotencyTTL: 72 * time.Hour,
		maxAgeSeconds: 86400, // 24 hours
	}
}

// ClaimIdempotency tries to claim a packet hash atomically
// Returns true if this is the first claim, false if already claimed
func (s *SettlementService) ClaimIdempotency(ctx context.Context, packetHash string) (bool, error) {
	key := "idempotency:" + packetHash
	
	// Try to set with NX (only if not exists) and EX (expiry)
	claimed, err := s.redis.SetNX(ctx, key, "1", s.idempotencyTTL).Result()
	if err != nil {
		return false, fmt.Errorf("redis setnx: %w", err)
	}
	
	return claimed, nil
}

// Ingest processes a packet from a bridge node
func (s *SettlementService) Ingest(ctx context.Context, packetHash string, instruction *PaymentInstruction, bridgeNodeID string, hopCount int) (*SettlementResult, error) {
	// 1. Try to claim idempotency
	claimed, err := s.ClaimIdempotency(ctx, packetHash)
	if err != nil {
		log.Printf("Idempotency check failed: %v", err)
		return nil, err
	}
	if !claimed {
		return &SettlementResult{
			Outcome:       "DUPLICATE_DROPPED",
			PacketHash:    packetHash,
			Reason:        "duplicate",
			TransactionID: 0,
		}, nil
	}
	
	// 2. Freshness check (replay protection)
	nowMs := time.Now().UnixMilli()
	ageSeconds := float64(nowMs - instruction.SignedAt) / 1000
	
	if ageSeconds > float64(s.maxAgeSeconds) {
		return &SettlementResult{
			Outcome:       "STALE_PACKET",
			PacketHash:    packetHash,
			Reason:        "stale_packet",
			TransactionID: 0,
		}, nil
	}
	
	if ageSeconds < -300 { // 5 min clock skew tolerance
		return &SettlementResult{
			Outcome:       "FUTURE_DATED",
			PacketHash:    packetHash,
			Reason:        "future_dated",
			TransactionID: 0,
		}, nil
	}
	
	// 3. Check sender account and balance
	sender, err := s.getAccount(ctx, instruction.SenderVPA)
	if err != nil {
		return &SettlementResult{
			Outcome:       "INTERNAL_ERROR",
			PacketHash:    packetHash,
			Reason:        "internal_error: sender account not found",
			TransactionID: 0,
		}, nil
	}
	
	receiver, err := s.getAccount(ctx, instruction.ReceiverVPA)
	if err != nil {
		return &SettlementResult{
			Outcome:       "INTERNAL_ERROR",
			PacketHash:    packetHash,
			Reason:        "internal_error: receiver account not found",
			TransactionID: 0,
		}, nil
	}
	
	// 4. Check amount
	amount := new(big.Int)
	amount.SetString(instruction.Amount, 10)
	
	balance := new(big.Int)
	balance.SetString(sender.Balance, 10)
	
	if balance.Cmp(amount) < 0 {
		// Insufficient balance - still record transaction as REJECTED
		tx, err := s.recordTransaction(ctx, &Transaction{
			PacketHash:       packetHash,
			SenderVPA:        instruction.SenderVPA,
			ReceiverVPA:      instruction.ReceiverVPA,
			Amount:           instruction.Amount,
			SignedAt:         time.UnixMilli(instruction.SignedAt),
			BridgeNodeID:     bridgeNodeID,
			HopCount:         hopCount,
			Status:           "REJECTED",
			TransactionType:  "SEND",
			CounterpartyName: "",
			CounterpartyVPA:  instruction.ReceiverVPA,
		})
		if err != nil {
			return &SettlementResult{
				Outcome:       "INTERNAL_ERROR",
				PacketHash:    packetHash,
				Reason:        "internal_error: failed to record rejected transaction",
				TransactionID: 0,
			}, nil
		}
		
		return &SettlementResult{
			Outcome:       "INSUFFICIENT_BALANCE",
			PacketHash:    packetHash,
			Reason:        "insufficient_balance",
			TransactionID: tx.ID,
		}, nil
	}
	
	// 5. Perform settlement (debit sender, credit receiver)
	tx, err := s.performSettlement(ctx, sender, receiver, amount, instruction, bridgeNodeID, hopCount, packetHash)
	if err != nil {
		return &SettlementResult{
			Outcome:       "INTERNAL_ERROR",
			PacketHash:    packetHash,
			Reason:        "internal_error: " + err.Error(),
			TransactionID: 0,
		}, nil
	}
	
	return &SettlementResult{
		Outcome:       "SETTLED",
		PacketHash:    packetHash,
		Reason:        "",
		TransactionID: tx.ID,
	}, nil
}

func (s *SettlementService) getAccount(ctx context.Context, vpa string) (*Account, error) {
	var acc Account
	err := s.pgPool.QueryRow(ctx, `
		SELECT id, vpa, holder_name, balance, bank_name, ifsc, is_primary
		FROM accounts WHERE vpa = $1
	`, vpa).Scan(&acc.ID, &acc.VPA, &acc.HolderName, &acc.Balance, &acc.BankName, &acc.IFSC, &acc.IsPrimary)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("account not found: %s", vpa)
	}
	return &acc, err
}

type Account struct {
	ID          string
	VPA         string
	HolderName  string
	Balance     string
	BankName    string
	IFSC        string
	IsPrimary   bool
}

func (s *SettlementService) performSettlement(
	ctx context.Context,
	sender, receiver *Account,
	amount *big.Int,
	instruction *PaymentInstruction,
	bridgeNodeID string,
	hopCount int,
	packetHash string,
) (*Transaction, error) {
	
	tx, err := s.pgPool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)
	
	// Update balances
	newSenderBalance := new(big.Int).Sub(
		func() *big.Int { b := new(big.Int); b.SetString(sender.Balance, 10); return b }(),
		amount,
	)
	
	newReceiverBalance := new(big.Int).Add(
		func() *big.Int { b := new(big.Int); b.SetString(receiver.Balance, 10); return b }(),
		amount,
	)
	
	_, err = tx.Exec(ctx, "UPDATE accounts SET balance = $1, updated_at = NOW() WHERE vpa = $2",
		newSenderBalance.String(), sender.VPA)
	if err != nil {
		return nil, fmt.Errorf("update sender balance: %w", err)
	}
	
	_, err = tx.Exec(ctx, "UPDATE accounts SET balance = $1, updated_at = NOW() WHERE vpa = $2",
		newReceiverBalance.String(), receiver.VPA)
	if err != nil {
		return nil, fmt.Errorf("update receiver balance: %w", err)
	}
	
	// Record transaction
	settledAt := time.Now()
	_, err = tx.Exec(ctx, `
		INSERT INTO transactions (packet_hash, sender_vpa, receiver_vpa, amount, signed_at, settled_at, bridge_node_id, hop_count, status, transaction_type, counterparty_name, counterparty_vpa)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id
	`, packetHash, instruction.SenderVPA, instruction.ReceiverVPA, instruction.Amount,
		time.UnixMilli(instruction.SignedAt), settledAt, bridgeNodeID, hopCount,
		"SETTLED", "SEND", "", instruction.ReceiverVPA)
	
	if err != nil {
		return nil, fmt.Errorf("insert transaction: %w", err)
	}
	
	// Get the transaction ID
	var txID int64
	err = tx.QueryRow(ctx, `
		SELECT id FROM transactions WHERE packet_hash = $1
	`, packetHash).Scan(&txID)
	if err != nil {
		return nil, fmt.Errorf("get transaction id: %w", err)
	}
	
	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	
	// Log settlement audit
	auditData, _ := json.Marshal(map[string]interface{}{
		"packet_hash": packetHash,
		"bridge_node_id": bridgeNodeID,
		"hop_count": hopCount,
		"outcome": "SETTLED",
	})
	
	_, err = s.pgPool.Exec(ctx, `
		INSERT INTO settlement_audit (transaction_id, packet_hash, bridge_node_id, hop_count, outcome, reason)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, txID, packetHash, bridgeNodeID, hopCount, "SETTLED", "")
	
	if err != nil {
		log.Printf("Failed to log settlement audit: %v", err)
	}
	
	return &Transaction{
		ID:             txID,
		PacketHash:     packetHash,
		SenderVPA:      instruction.SenderVPA,
		ReceiverVPA:    instruction.ReceiverVPA,
		Amount:         instruction.Amount,
		SignedAt:       time.UnixMilli(instruction.SignedAt),
		SettledAt:      settledAt,
		BridgeNodeID:   bridgeNodeID,
		HopCount:       hopCount,
		Status:         "SETTLED",
		TransactionType: "SEND",
	}, nil
}

func (s *SettlementService) recordTransaction(ctx context.Context, tx *Transaction) (*Transaction, error) {
	var id int64
	err := s.pgPool.QueryRow(ctx, `
		INSERT INTO transactions (packet_hash, sender_vpa, receiver_vpa, amount, signed_at, settled_at, bridge_node_id, hop_count, status, transaction_type, counterparty_name, counterparty_vpa)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id
	`, tx.PacketHash, tx.SenderVPA, tx.ReceiverVPA, tx.Amount, tx.SignedAt, tx.SettledAt, tx.BridgeNodeID, tx.HopCount, tx.Status, tx.TransactionType, tx.CounterpartyName, tx.CounterpartyVPA).Scan(&id)
	
	if err != nil {
		return nil, err
	}
	
	tx.ID = id
	return tx, nil
}

// GetTransactions returns recent transactions for an account
func (s *SettlementService) GetTransactions(ctx context.Context, vpa string, limit int) ([]Transaction, error) {
	rows, err := s.pgPool.Query(ctx, `
		SELECT id, packet_hash, sender_vpa, receiver_vpa, amount, signed_at, settled_at, bridge_node_id, hop_count, status, transaction_type, counterparty_name, counterparty_vpa, note, expires_at
		FROM transactions
		WHERE sender_vpa = $1 OR receiver_vpa = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, vpa, limit)
	
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var transactions []Transaction
	for rows.Next() {
		var tx Transaction
		var settledAt sql.NullTime
		var expiresAt sql.NullTime
		var note sql.NullString
		var counterpartyName sql.NullString
		
		err := rows.Scan(
			&tx.ID, &tx.PacketHash, &tx.SenderVPA, &tx.ReceiverVPA, &tx.Amount,
			&tx.SignedAt, &settledAt, &tx.BridgeNodeID, &tx.HopCount, &tx.Status,
			&tx.TransactionType, &counterpartyName, &tx.CounterpartyVPA, &note, &expiresAt,
		)
		if err != nil {
			return nil, err
		}
		
		if settledAt.Valid {
			tx.SettledAt = settledAt.Time
		}
		if expiresAt.Valid {
			tx.ExpiresAt = &expiresAt.Time
		}
		if note.Valid {
			tx.Note = note.String
		}
		if counterpartyName.Valid {
			tx.CounterpartyName = counterpartyName.String
		}
		
		transactions = append(transactions, tx)
	}
	
	return transactions, rows.Err()
}

// GetTransactionByID returns a transaction by ID
func (s *SettlementService) GetTransactionByID(ctx context.Context, id int64) (*Transaction, error) {
	var tx Transaction
	var settledAt sql.NullTime
	var expiresAt sql.NullTime
	var note sql.NullString
	var counterpartyName sql.NullString
	
	err := s.pgPool.QueryRow(ctx, `
		SELECT id, packet_hash, sender_vpa, receiver_vpa, amount, signed_at, settled_at, bridge_node_id, hop_count, status, transaction_type, counterparty_name, counterparty_vpa, note, expires_at
		FROM transactions WHERE id = $1
	`, id).Scan(
		&tx.ID, &tx.PacketHash, &tx.SenderVPA, &tx.ReceiverVPA, &tx.Amount,
		&tx.SignedAt, &settledAt, &tx.BridgeNodeID, &tx.HopCount, &tx.Status,
		&tx.TransactionType, &counterpartyName, &tx.CounterpartyVPA, &note, &expiresAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	
	if settledAt.Valid {
		tx.SettledAt = settledAt.Time
	}
	if expiresAt.Valid {
		tx.ExpiresAt = &expiresAt.Time
	}
	if note.Valid {
		tx.Note = note.String
	}
	if counterpartyName.Valid {
		tx.CounterpartyName = counterpartyName.String
	}
	
	return &tx, nil
}

// GetJourney returns the mesh journey for a transaction
func (s *SettlementService) GetJourney(ctx context.Context, transactionID int64) ([]MeshJourneyStep, error) {
	// Get transaction details
	tx, err := s.GetTransactionByID(ctx, transactionID)
	if err != nil || tx == nil {
		return nil, fmt.Errorf("transaction not found")
	}
	
	// Build journey from mesh events
	rows, err := s.pgPool.Query(ctx, `
		SELECT event_type, packet_id, from_device, to_device, device_id, ttl, result, timestamp_ms
		FROM mesh_events
		WHERE packet_id = $1 OR packet_id LIKE $2
		ORDER BY timestamp_ms ASC
	`, tx.PacketHash[:12]+"%", tx.PacketHash[:12]+"%")
	
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var journey []MeshJourneyStep
	for rows.Next() {
		var step MeshJourneyStep
		var result sql.NullString
		var fromDevice, toDevice, deviceID sql.NullString
		var ttl sql.NullInt32
		
		err := rows.Scan(
			&step.Event, &step.PacketID, &fromDevice, &toDevice, &deviceID, &ttl, &result, &step.TimestampMs,
		)
		if err != nil {
			return nil, err
		}
		
		if fromDevice.Valid {
			step.FromDevice = fromDevice.String
		}
		if toDevice.Valid {
			step.ToDevice = toDevice.String
		}
		if deviceID.Valid {
			step.DeviceID = deviceID.String
		}
		if ttl.Valid {
			step.TTL = int(ttl.Int32)
		}
		if result.Valid {
			step.Result = result.String
		}
		
		journey = append(journey, step)
	}
	
	return journey, rows.Err()
}

type MeshJourneyStep struct {
	Event         string
	PacketID      string
	FromDevice    string
	ToDevice      string
	DeviceID      string
	TTL           int
	Result        string
	TimestampMs   int64
}

// PacketHash computes SHA-256 hash of ciphertext
func PacketHash(ciphertext []byte) string {
	// This would use crypto/sha256 in real implementation
	// For now, return hex encoded
	return hex.EncodeToString(ciphertext)[:64]
}