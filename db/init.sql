-- ---------------------------------------------------------------------------
-- This file runs ONLY the very first time the postgres container initialises an
-- EMPTY data directory. Docker's official postgres image executes everything in
-- /docker-entrypoint-initdb.d on startup.
--
-- Key learning point: if the `pgdata` volume already has data, this file is
-- SKIPPED. To re-run it you must delete the volume:
--     docker compose down -v
-- That single fact explains 90% of "why isn't my DB schema updating?" confusion.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- Seed a few rows so GET /users returns something on first run.
INSERT INTO users (name, email) VALUES
  ('Ada Lovelace',  'ada@example.com'),
  ('Alan Turing',   'alan@example.com'),
  ('Grace Hopper',  'grace@example.com'),
  ('Linus Torvalds','linus@example.com')
ON CONFLICT (email) DO NOTHING;
