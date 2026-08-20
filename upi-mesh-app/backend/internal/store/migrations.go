package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func RunMigrations(pool *pgxpool.Pool) error {
	ctx := context.Background()
	
	// Create migrations table if not exists
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}
	
	// Get applied migrations
	rows, err := pool.Query(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return fmt.Errorf("query applied migrations: %w", err)
	}
	defer rows.Close()
	
	applied := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("scan migration version: %w", err)
		}
		applied[version] = true
	}
	
	// Read migration files
	migrationsDir := "migrations"
	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		// If migrations directory doesn't exist, try relative to binary
		migrationsDir = filepath.Join("..", "migrations")
		files, err = os.ReadDir(migrationsDir)
		if err != nil {
			return fmt.Errorf("read migrations dir: %w", err)
		}
	}
	
	var migrationFiles []string
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".sql") {
			migrationFiles = append(migrationFiles, f.Name())
		}
	}
	
	sort.Strings(migrationFiles)
	
	// Apply unapplied migrations
	for _, file := range migrationFiles {
		version := strings.TrimSuffix(file, ".sql")
		
		if applied[version] {
			continue
		}
		
		content, err := os.ReadFile(filepath.Join(migrationsDir, file))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file, err)
		}
		
		// Execute migration
		_, err = pool.Exec(ctx, string(content))
		if err != nil {
			return fmt.Errorf("execute migration %s: %w", file, err)
		}
		
		// Record migration
		_, err = pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version)
		if err != nil {
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		
		fmt.Printf("Applied migration: %s\n", version)
	}
	
	return nil
}