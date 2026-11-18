-- Migration 001 — AI Orchestrator training sessions.
-- Safe & additive (brief §13.10): creates a new table only; touches no existing
-- data. Idempotent via IF NOT EXISTS. Apply with:
--   psql "$DATABASE_URL" -f backend/migrations/001_ai_training_sessions.sql
-- (createTables()/ensureSchema() also create it automatically on boot.)

CREATE TABLE IF NOT EXISTS ai_training_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
    skill VARCHAR(100),
    state VARCHAR(32) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_user_id ON ai_training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_sessions_institution ON ai_training_sessions(institution_id);
