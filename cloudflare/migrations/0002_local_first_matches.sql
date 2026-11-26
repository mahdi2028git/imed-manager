-- Local-first match synchronization.
-- The original match_allocations table was verified empty before this migration.
-- Source IMED and Sepidar rows remain on each device; this table stores stable business keys.
DROP TABLE IF EXISTS match_allocations;

CREATE TABLE match_allocations (
  id TEXT PRIMARY KEY,
  distribution_key TEXT NOT NULL,
  sepidar_item_key TEXT NOT NULL,
  distribution_local_id TEXT,
  sepidar_item_local_id TEXT,
  matched_quantity REAL NOT NULL DEFAULT 0 CHECK (matched_quantity >= 0),
  match_method TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  device_id TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (distribution_key, sepidar_item_key)
);

CREATE INDEX idx_match_allocations_updated_at ON match_allocations(updated_at);
CREATE INDEX idx_match_allocations_device_id ON match_allocations(device_id);
