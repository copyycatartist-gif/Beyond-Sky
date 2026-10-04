-- Migration 001: Enable required PostgreSQL extensions
-- Run as superuser / database owner

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Scheduled jobs (pg_cron) - available on Supabase Pro
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Auto-update updated_at timestamps
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Unaccent for search normalization
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Trigram matching for fuzzy search / GIN indexes (gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA extensions;
