package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"upi-mesh-app/backend/internal/store"
)

type Router struct {
	settlement *store.SettlementService
	meshCoord  *store.MeshCoordinator
	upgrader   websocket.Upgrader
}

func NewRouter(settlement *store.SettlementService, meshCoord *store.MeshCoordinator) *gin.Engine {
	r := &Router{
		settlement: settlement,
		meshCoord:  meshCoord,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)
	
	router := gin.Default()
	
	// CORS
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Node-Id, X-Hop-Count")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	
	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "timestamp": time.Now().UnixMilli()})
	})
	
	// Server public key
	router.GET("/api/server-key", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"publicKey":       "MOCK_PUBLIC_KEY_BASE64", // In real impl, return actual key
			"algorithm":       "RSA-2048 / OAEP-SHA256",
			"hybridScheme":    "RSA-OAEP encrypts an AES-256-GCM session key",
		})
	})
	
	// Demo send (simulates sender phone creating packet)
	router.POST("/api/demo/send", r.handleDemoSend)
	
	// Mesh simulation endpoints
	router.GET("/api/mesh/state", r.handleMeshState)
	router.POST("/api/mesh/gossip", r.handleMeshGossip)
	router.POST("/api/mesh/flush", r.handleMeshFlush)
	router.POST("/api/mesh/reset", r.handleMeshReset)
	router.GET("/api/mesh/events", r.handleMeshEvents)
	router.GET("/api/mesh/events/stream", r.handleMeshEventsStream)
	router.POST("/api/mesh/kill-bridge", r.handleKillBridge)
	
	// Bridge ingestion (THE production endpoint)
	router.POST("/api/bridge/ingest", r.handleBridgeIngest)
	
	// Accounts
	router.GET("/api/accounts", r.handleListAccounts)
	
	// Transactions
	router.GET("/api/transactions", r.handleListTransactions)
	router.GET("/api/transactions/status", r.handleTransactionStatus)
	router.GET("/api/transactions/journey", r.handleTransactionJourney)
	
	// WebSocket for real-time events
	router.GET("/ws", r.handleWebSocket)
	
	return router
}

func (r *Router) handleDemoSend(c *gin.Context) {
	var req struct {
		SenderVPA   string  `json:"senderVpa" binding:"required"`
		ReceiverVPA string  `json:"receiverVpa" binding:"required"`
		Amount      float64 `json:"amount" binding:"required,gt=0"`
		PIN         string  `json:"pin" binding:"required,len=4"`
		TTL         int     `json:"ttl"`
		StartDevice string  `json:"startDevice"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	
	if req.TTL == 0 {
		req.TTL = 5
	}
	if req.StartDevice == "" {
		req.StartDevice = "phone-alice"
	}
	
	// In a real implementation, this would create an encrypted packet
	// For demo, we return a mock packet
	packetID := "mock-" + time.Now().Format("20060102150405.000")
	
	c.JSON(200, gin.H{
		"packetId":            packetID,
		"ciphertextPreview":   "mock_ciphertext_base64...",
		"ttl":                 req.TTL,
		"injectedAt":          req.StartDevice,
	})
}

func (r *Router) handleMeshState(c *gin.Context) {
	ctx := context.Background()
	devices, err := r.meshCoord.GetMeshDevices(ctx)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	deviceData := make([]gin.H, len(devices))
	for i, d := range devices {
		deviceData[i] = gin.H{
			"deviceId":     d.ID,
			"hasInternet":  d.HasInternet,
			"packetCount":  d.PacketCount,
			"packetIds":    []string{}, // Would populate from mesh state
		}
	}
	
	c.JSON(200, gin.H{
		"devices":             deviceData,
		"idempotencyCacheSize": 0, // Would get from Redis
	})
}

func (r *Router) handleMeshGossip(c *gin.Context) {
	// Simulate gossip round
	ctx := context.Background()
	
	// In real implementation, this would trigger mesh gossip
	// For demo, return mock data
	c.JSON(200, gin.H{
		"transfers": 3,
		"deviceCounts": gin.H{
			"phone-alice":        1,
			"phone-stranger1":    1,
			"phone-stranger2":    1,
			"phone-stranger3":    1,
			"phone-bridge":       1,
		},
	})
}

func (r *Router) handleMeshFlush(c *gin.Context) {
	ctx := context.Background()
	
	// Get devices with internet (bridges)
	devices, err := r.meshCoord.GetMeshDevices(ctx)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	var results []gin.H
	uploadsAttempted := 0
	
	for _, d := range devices {
		if !d.HasInternet || d.IsKilled {
			continue
		}
		
		uploadsAttempted++
		
		// In real implementation, each bridge would upload all packets it holds
		// For demo, simulate a single packet upload
		req := store.BridgeUploadRequest{
			PacketID:  "mock-packet-" + d.ID,
			TTL:       2,
			CreatedAt: time.Now().UnixMilli() - 10000,
			Ciphertext: []int{1, 2, 3, 4, 5},
		}
		
		resp, err := r.meshCoord.HandleBridgeIngest(ctx, req, d.ID, 3)
		if err != nil {
			results = append(results, gin.H{
				"bridgeNode":    d.ID,
				"packetId":      "mock",
				"outcome":       "INTERNAL_ERROR",
				"reason":        err.Error(),
				"transactionId": -1,
			})
			continue
		}
		
		results = append(results, gin.H{
			"bridgeNode":    d.ID,
			"packetId":      req.PacketID[:8],
			"outcome":       resp.Outcome,
			"reason":        resp.Reason,
			"transactionId": resp.TransactionID,
		})
	}
	
	c.JSON(200, gin.H{
		"uploadsAttempted": uploadsAttempted,
		"results":          results,
	})
}

func (r *Router) handleMeshReset(c *gin.Context) {
	ctx := context.Background()
	
	// Reset mesh devices
	// In real implementation, clear all mesh state
	// For demo, just return success
	c.JSON(200, gin.H{"status": "mesh and idempotency cache cleared"})
}

func (r *Router) handleMeshEvents(c *gin.Context) {
	ctx := context.Background()
	
	sinceMs := int64(0)
	if sinceStr := c.Query("since_ms"); sinceStr != "" {
		if val, err := strconv.ParseInt(sinceStr, 10, 64); err == nil {
			sinceMs = val
		}
	}
	
	limit := 1000
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}
	
	events, err := r.meshCoord.GetMeshEvents(ctx, sinceMs, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	// Convert to JSON-serializable format
	eventData := make([]gin.H, len(events))
	for i, e := range events {
		eventData[i] = gin.H{
			"event_type":    e.EventType,
			"packet_id":     e.PacketID,
			"from_device":   e.FromDevice,
			"to_device":     e.ToDevice,
			"device_id":     e.DeviceID,
			"ttl":           e.TTL,
			"result":        e.Result,
			"timestamp_ms":  e.TimestampMs,
		}
	}
	
	c.JSON(200, gin.H{"events": eventData})
}

func (r *Router) handleMeshEventsStream(c *gin.Context) {
	// SSE stream for real-time events
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
	
	c.Stream(func(w chan<- string) bool {
		// In real implementation, subscribe to Redis pub/sub
		// For demo, send periodic heartbeat
		select {
		case <-c.Request.Context().Done():
			return false
		case <-time.After(1 * time.Second):
			w <- "data: {\"type\":\"heartbeat\",\"timestamp\":" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "}\n\n"
			return true
		}
	})
}

func (r *Router) handleKillBridge(c *gin.Context) {
	ctx := context.Background()
	
	var req struct {
		DeviceID string `json:"deviceId" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "deviceId required"})
		return
	}
	
	err := r.meshCoord.KillBridge(ctx, req.DeviceID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(200, gin.H{"status": "removed", "deviceId": req.DeviceID})
}

func (r *Router) handleBridgeIngest(c *gin.Context) {
	ctx := context.Background()
	
	var req store.BridgeUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	
	bridgeNodeID := c.GetHeader("X-Bridge-Node-Id")
	if bridgeNodeID == "" {
		bridgeNodeID = "unknown"
	}
	
	hopCount := 0
	if hopStr := c.GetHeader("X-Hop-Count"); hopStr != "" {
		if val, err := strconv.Atoi(hopStr); err == nil {
			hopCount = val
		}
	}
	
	resp, err := r.meshCoord.HandleBridgeIngest(ctx, req, bridgeNodeID, hopCount)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(200, resp)
}

func (r *Router) handleListAccounts(c *gin.Context) {
	ctx := context.Background()
	
	// In real implementation, fetch from database
	// For demo, return mock accounts
	accounts := []gin.H{
		{"vpa": "alice@demo", "holderName": "Alice", "balance": "5000.00"},
		{"vpa": "bob@demo", "holderName": "Bob", "balance": "1000.00"},
		{"vpa": "carol@demo", "holderName": "Carol", "balance": "2500.00"},
		{"vpa": "dave@demo", "holderName": "Dave", "balance": "500.00"},
	}
	
	c.JSON(200, accounts)
}

func (r *Router) handleListTransactions(c *gin.Context) {
	ctx := context.Background()
	
	// Get transactions from settlement service
	// For demo, return empty
	c.JSON(200, []gin.H{})
}

func (r *Router) handleTransactionStatus(c *gin.Context) {
	packetID := c.Query("packetId")
	if packetID == "" {
		c.JSON(400, gin.H{"error": "packetId required"})
		return
	}
	
	// In real implementation, look up transaction by packet ID
	// For demo, return pending
	c.JSON(200, gin.H{
		"transactionId": nil,
		"status":        "PENDING",
		"message":       "Transaction not yet settled or ack not received",
	})
}

func (r *Router) handleTransactionJourney(c *gin.Context) {
	ctx := context.Background()
	
	transactionIDStr := c.Query("transactionId")
	if transactionIDStr == "" {
		c.JSON(400, gin.H{"error": "transactionId required"})
		return
	}
	
	transactionID, err := strconv.ParseInt(transactionIDStr, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid transactionId"})
		return
	}
	
	journey, err := r.settlement.GetJourney(ctx, transactionID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	// Convert journey steps to response format
	hops := make([]gin.H, len(journey))
	for i, step := range journey {
		hops[i] = gin.H{
			"event":        step.Event,
			"deviceId":     step.DeviceID,
			"timestampMs":  step.TimestampMs,
			"ttl":          step.TTL,
			"result":       step.Result,
		}
	}
	
	c.JSON(200, gin.H{
		"transactionId":   transactionID,
		"packetId":        "mock-packet-hash...",
		"hops":            hops,
		"hopCount":        len(hops),
		"bridgeNodeId":    "phone-bridge",
		"totalRoundTripMs": 0,
	})
}

func (r *Router) handleWebSocket(c *gin.Context) {
	conn, err := r.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	
	clientID := "client-" + time.Now().Format("20060102150405.000")
	r.meshCoord.HandleWebSocket(conn, clientID)
}