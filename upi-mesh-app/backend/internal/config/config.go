package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port         string
	DatabaseURL  string
	RedisURL     string
	LogLevel     string
	GinMode      string
	
	// Crypto
	RSAKeySize   int
	
	// Settlement
	MaxAgeSeconds int
	IdempotencyTTL int
}

func Load() *Config {
	// Load .env file if exists
	godotenv.Load()

	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://upimesh:upimesh@localhost:5432/upimesh?sslmode=disable")
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379")
	logLevel := getEnv("LOG_LEVEL", "debug")
	ginMode := getEnv("GIN_MODE", "debug")
	
	rsaKeySize := getEnvInt("RSA_KEY_SIZE", 2048)
	maxAgeSeconds := getEnvInt("MAX_AGE_SECONDS", 86400) // 24 hours
	idempotencyTTL := getEnvInt("IDEMPOTENCY_TTL", 259200) // 72 hours

	return &Config{
		Port:           port,
		DatabaseURL:    dbURL,
		RedisURL:       redisURL,
		LogLevel:       logLevel,
		GinMode:        ginMode,
		RSAKeySize:     rsaKeySize,
		MaxAgeSeconds:  maxAgeSeconds,
		IdempotencyTTL: idempotencyTTL,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}