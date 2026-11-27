-- IMED Manager - Cloudflare D1 schema
-- Bootstrap schema for a fresh D1 database.
-- Existing databases: apply migrations in order; do not rerun 0002 on a populated match_allocations table.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  irc TEXT, gtin TEXT, name TEXT NOT NULL, model TEXT, manufacturer TEXT,
  country TEXT, distinction TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_irc ON products(irc);
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT, name TEXT NOT NULL, type_id INTEGER, customer_type TEXT,
  province TEXT, city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS imed_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_no TEXT, issue_date TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quantity REAL NOT NULL DEFAULT 0, remaining_quantity REAL NOT NULL DEFAULT 0,
  source_file TEXT, raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_imed_doc_no ON imed_distributions(document_no);
CREATE INDEX IF NOT EXISTS idx_imed_issue_date ON imed_distributions(issue_date);
CREATE INDEX IF NOT EXISTS idx_imed_product ON imed_distributions(product_id);

CREATE TABLE IF NOT EXISTS sepidar_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL, invoice_date TEXT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  document_type TEXT, source_file TEXT, raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sepidar_invoice_no ON sepidar_invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_sepidar_invoice_date ON sepidar_invoices(invoice_date);

CREATE TABLE IF NOT EXISTS sepidar_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sepidar_invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, unit_price REAL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sepidar_items_invoice ON sepidar_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sepidar_items_product ON sepidar_invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sepidar_items_name ON sepidar_invoice_items(item_name);

-- Stable business-key model used by POST/GET /api/matches/sync.
CREATE TABLE IF NOT EXISTS match_allocations (
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
CREATE INDEX IF NOT EXISTS idx_match_allocations_updated_at ON match_allocations(updated_at);
CREATE INDEX IF NOT EXISTS idx_match_allocations_device_id ON match_allocations(device_id);

-- Chunked, atomic application snapshots used by /api/state.
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

-- Durable progress and suggestion cache used by automatic matching.
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
