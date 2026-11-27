-- Runtime tables required by the current Worker API.
-- Non-destructive: preserves existing snapshot metadata and matching data.
CREATE TABLE IF NOT EXISTS app_state_uploads (
  upload_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id, part_index)
);
CREATE TABLE IF NOT EXISTS app_state_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  upload_id TEXT NOT NULL,
  total_parts INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS match_jobs (
  id TEXT PRIMARY KEY,
  base_hash TEXT NOT NULL UNIQUE,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  percent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS match_suggestion_cache (
  base_hash TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_hash, doc_key)
);
