package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"upi-mesh-app/backend/internal/api"
	"upi-mesh-app/backend/internal/config"
	"upi-mesh-app/backend/internal/store"
)

func main() {
	cfg := config.Load()

	// Initialize PostgreSQL
	pgPool, err := store.NewPostgres(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer pgPool.Close()

	// Initialize Redis
	redisClient := store.NewRedis(cfg.RedisURL)
	defer redisClient.Close()

	// Run migrations
	if err := store.RunMigrations(pgPool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize services
	settlement := store.NewSettlementService(pgPool, redisClient)
	meshCoord := store.NewMeshCoordinator(settlement)

	// HTTP router
	router := api.NewRouter(settlement, meshCoord)

	// HTTP server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Printf("Server started on port %s", cfg.Port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}