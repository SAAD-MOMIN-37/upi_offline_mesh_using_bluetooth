package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type MeshCoordinator struct {
	settlement *SettlementService
	pgPool     *pgxpool.Pool
	redis      *redis.Client
	
	// Connected WebSocket clients
	clients    map[string]*websocket.Conn
	clientsMu  sync.RWMutex
}

type BridgeUploadRequest struct {
	PacketID     string `json:"packetId"`
	TTL          int    `json:"ttl"`
	CreatedAt    int64  `json:"createdAt"`
	Ciphertext   []int  `json:"ciphertext"`
}

type BridgeUploadResponse struct {
	Outcome       string `json:"outcome"`
	PacketHash    string `json:"packetHash"`
	Reason        string `json:"reason,omitempty"`
	TransactionID int64  `json:"transactionId,omitempty"`
}

type MeshEvent struct {
	EventType   string `json:"event_type"`
	PacketID    string `json:"packet_id,omitempty"`
	FromDevice  string `json:"from_device,omitempty"`
	ToDevice    string `json:"to_device,omitempty"`
	DeviceID    string `json:"device_id,omitempty"`
	TTL         int    `json:"ttl,omitempty"`
	Result      string `json:"result,omitempty"`
	TimestampMs int64  `json:"timestamp_ms"`
}

func NewMeshCoordinator(settlement *SettlementService) *MeshCoordinator {
	return &MeshCoordinator{
		settlement: settlement,
		clients:    make(map[string]*websocket.Conn),
	}
}

func (m *MeshCoordinator) SetPools(pgPool *pgxpool.Pool, redis *redis.Client) {
	m.pgPool = pgPool
	m.redis = redis
}

// HandleBridgeIngest processes a packet upload from a bridge node
func (m *MeshCoordinator) HandleBridgeIngest(ctx context.Context, req BridgeUploadRequest, bridgeNodeID string, hopCount int) (*BridgeUploadResponse, error) {
	// Convert ciphertext
	ciphertext := make([]byte, len(req.Ciphertext))
	for i, v := range req.Ciphertext {
		ciphertext[i] = byte(v)
	}
	
	// Compute packet hash
	packetHash := PacketHash(ciphertext)
	
	// For now, we need to decrypt to get instruction
	// In real implementation, this would use the server's private key
	// Here we simulate by extracting from a stored mapping or the packet itself
	
	// Since we can't decrypt without the private key in this demo,
	// we'll create a mock instruction
	instruction := &PaymentInstruction{
		SenderVPA:      "alice@demo",
		ReceiverVPA:    "bob@demo",
		Amount:         "100.00",
		PinHash:        "mock",
		Nonce:          "mock",
		SignedAt:       req.CreatedAt,
		ACKKey:         []byte{},
		OriginalPacketID: req.PacketID,
	}
	
	// Process through settlement
	result, err := m.settlement.Ingest(ctx, packetHash, instruction, bridgeNodeID, hopCount)
	if err != nil {
		return nil, err
	}
	
	// Log mesh event
	event := MeshEvent{
		EventType:   "bridge_upload",
		PacketID:    req.PacketID,
		DeviceID:    bridgeNodeID,
		Result:      result.Outcome,
		TimestampMs: time.Now().UnixMilli(),
	}
	m.logMeshEvent(ctx, event)
	
	// Broadcast to WebSocket clients
	m.broadcastEvent(event)
	
	return &BridgeUploadResponse{
		Outcome:       result.Outcome,
		PacketHash:    result.PacketHash,
		Reason:        result.Reason,
		TransactionID: result.TransactionID,
	}, nil
}

// HandleWebSocket handles WebSocket connections for real-time events
func (m *MeshCoordinator) HandleWebSocket(conn *websocket.Conn, clientID string) {
	m.clientsMu.Lock()
	m.clients[clientID] = conn
	m.clientsMu.Unlock()
	
	defer func() {
		m.clientsMu.Lock()
		delete(m.clients, clientID)
		m.clientsMu.Unlock()
		conn.Close()
	}()
	
	// Send initial connection confirmation
	conn.WriteJSON(map[string]interface{}{
		"type": "connected",
		"clientId": clientID,
	})
	
	// Keep connection alive
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (m *MeshCoordinator) broadcastEvent(event MeshEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("Failed to marshal event: %v", err)
		return
	}
	
	m.clientsMu.RLock()
	defer m.clientsMu.RUnlock()
	
	for clientID, conn := range m.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("Failed to send to client %s: %v", clientID, err)
		}
	}
}

func (m *MeshCoordinator) logMeshEvent(ctx context.Context, event MeshEvent) {
	// Store in PostgreSQL for audit
	_, err := m.pgPool.Exec(ctx, `
		INSERT INTO mesh_events (event_type, packet_id, from_device, to_device, device_id, ttl, result, timestamp_ms)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, event.EventType, event.PacketID, event.FromDevice, event.ToDevice, event.DeviceID, event.TTL, event.Result, event.TimestampMs)
	
	if err != nil {
		log.Printf("Failed to log mesh event: %v", err)
	}
	
	// Also publish to Redis for real-time subscribers
	eventData, _ := json.Marshal(event)
	m.redis.Publish(ctx, "mesh:events", eventData)
}

// GetMeshEvents returns recent mesh events
func (m *MeshCoordinator) GetMeshEvents(ctx context.Context, sinceMs int64, limit int) ([]MeshEvent, error) {
	query := `
		SELECT event_type, packet_id, from_device, to_device, device_id, ttl, result, timestamp_ms
		FROM mesh_events
		WHERE timestamp_ms > $1
		ORDER BY timestamp_ms DESC
		LIMIT $2
	`
	
	rows, err := m.pgPool.Query(ctx, query, sinceMs, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var events []MeshEvent
	for rows.Next() {
		var event MeshEvent
		var fromDevice, toDevice, deviceID sql.NullString
		var ttl sql.NullInt32
		var result sql.NullString
		
		err := rows.Scan(
			&event.EventType, &event.PacketID, &fromDevice, &toDevice, &deviceID, &ttl, &result, &event.TimestampMs,
		)
		if err != nil {
			return nil, err
		}
		
		if fromDevice.Valid { event.FromDevice = fromDevice.String }
		if toDevice.Valid { event.ToDevice = toDevice.String }
		if deviceID.Valid { event.DeviceID = deviceID.String }
		if ttl.Valid { event.TTL = int(ttl.Int32) }
		if result.Valid { event.Result = result.String }
		
		events = append(events, event)
	}
	
	return events, rows.Err()
}

// KillBridge removes a bridge from the mesh
func (m *MeshCoordinator) KillBridge(ctx context.Context, deviceID string) error {
	_, err := m.pgPool.Exec(ctx, `
		UPDATE mesh_devices SET is_killed = TRUE, updated_at = NOW() WHERE id = $1
	`, deviceID)
	
	if err != nil {
		return err
	}
	
	// Broadcast kill event
	event := MeshEvent{
		EventType:   "bridge_killed",
		DeviceID:    deviceID,
		TimestampMs: time.Now().UnixMilli(),
	}
	m.broadcastEvent(event)
	
	return nil
}

// GetMeshDevices returns all known mesh devices
func (m *MeshCoordinator) GetMeshDevices(ctx context.Context) ([]MeshDevice, error) {
	rows, err := m.pgPool.Query(ctx, `
		SELECT id, name, has_internet, is_current_device, packet_count, last_seen, rssi, is_killed
		FROM mesh_devices
		ORDER BY has_internet DESC, last_seen DESC NULLS LAST
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var devices []MeshDevice
	for rows.Next() {
		var d MeshDevice
		var lastSeen sql.NullTime
		var rssi sql.NullInt32
		
		err := rows.Scan(&d.ID, &d.Name, &d.HasInternet, &d.IsCurrentDevice, &d.PacketCount, &lastSeen, &rssi, &d.IsKilled)
		if err != nil {
			return nil, err
		}
		
		if lastSeen.Valid {
			d.LastSeen = lastSeen.Time
		}
		if rssi.Valid {
			d.RSSI = int(rssi.Int32)
		}
		
		devices = append(devices, d)
	}
	
	return devices, rows.Err()
}

type MeshDevice struct {
	ID              string
	Name            string
	HasInternet     bool
	IsCurrentDevice bool
	PacketCount     int
	LastSeen        time.Time
	RSSI            int
	IsKilled        bool
}

// SeedDefaultDevices creates the default mesh topology
func (m *MeshCoordinator) SeedDefaultDevices(ctx context.Context) error {
	devices := []MeshDevice{
		{ID: "phone-alice", Name: "Alice's Phone", HasInternet: false, IsCurrentDevice: true, PacketCount: 0},
		{ID: "phone-stranger1", Name: "Stranger 1", HasInternet: false, PacketCount: 0},
		{ID: "phone-stranger2", Name: "Stranger 2", HasInternet: false, PacketCount: 0},
		{ID: "phone-stranger3", Name: "Stranger 3", HasInternet: false, PacketCount: 0},
		{ID: "phone-bridge", Name: "Bridge Node", HasInternet: true, PacketCount: 0},
	}
	
	for _, d := range devices {
		_, err := m.pgPool.Exec(ctx, `
			INSERT INTO mesh_devices (id, name, has_internet, is_current_device, packet_count)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				has_internet = EXCLUDED.has_internet,
				is_current_device = EXCLUDED.is_current_device
		`, d.ID, d.Name, d.HasInternet, d.IsCurrentDevice, d.PacketCount)
		
		if err != nil {
			return fmt.Errorf("seed device %s: %w", d.ID, err)
		}
	}
	
	return nil
}