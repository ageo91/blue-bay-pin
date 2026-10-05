-- Blue Bay Pin leaderboard (Cloudflare D1). Apply with: npx wrangler d1 execute blue-bay-pin --remote --file=schema.sql
-- Players have no account. The Worker gives each device a secret token and stores only its SHA-256 as the player id.

CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,                 -- sha256(device token)
  name       TEXT NOT NULL,
  tag        INTEGER NOT NULL,                 -- shown as Name#1234
  hidden     INTEGER NOT NULL DEFAULT 0,       -- set to 1 to remove a player from the boards
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS players_name_tag ON players (name COLLATE NOCASE, tag);

CREATE TABLE IF NOT EXISTS scores (
  player_id  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  hole       INTEGER NOT NULL,
  day        TEXT NOT NULL,                    -- Curaçao date (UTC-4), set by the Worker
  strokes    INTEGER NOT NULL,
  best_m     REAL NOT NULL,                    -- closest any shot stopped to the pin, 0 for a hole in one
  attempts   INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,                 -- ms since epoch
  PRIMARY KEY (player_id, hole, day)
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (hole, day, strokes, best_m);

-- New names per IP address (hashed), to slow down bots creating players
CREATE TABLE IF NOT EXISTS signups (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS signups_ip ON signups (ip, at);
