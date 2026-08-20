package store

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

func NewRedis(redisURL string) *redis.Client {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		// Fallback to defaults
		opt = &redis.Options{
			Addr:     "localhost:6379",
			Password: "",
			DB:       0,
		}
	}

	client := redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		// Log but don't fail - Redis might not be ready yet
		// In production, you might want to handle this differently
	}

	return client
}