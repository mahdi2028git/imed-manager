-- IMED Manager - Cloudflare D1 schema
-- Six core tables. Virtual warehouse balance is tracked on imed_distributions
-- and reduced through match_allocations.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  irc TEXT,
  gtin TEXT,
  name TEXT NOT NULL,
  model TEXT,
  manufacturer TEXT,
  country TEXT,
  distinction TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_irc ON products(irc);
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT,
  name TEXT NOT NULL,
  type_id INTEGER,
  customer_type TEXT,
  province TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS imed_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_no TEXT,
  issue_date TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quantity REAL NOT NULL DEFAULT 0,
  remaining_quantity REAL NOT NULL DEFAULT 0,
  source_file TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_imed_doc_no ON imed_distributions(document_no);
CREATE INDEX IF NOT EXISTS idx_imed_issue_date ON imed_distributions(issue_date);
CREATE INDEX IF NOT EXISTS idx_imed_product ON imed_distributions(product_id);

CREATE TABLE IF NOT EXISTS sepidar_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL,
  invoice_date TEXT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  document_type TEXT,
  source_file TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sepidar_invoice_no ON sepidar_invoices(invoice_no);
CREATE INDEX IF NOT EXISTS idx_sepidar_invoice_date ON sepidar_invoices(invoice_date);

CREATE TABLE IF NOT EXISTS sepidar_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sepidar_invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sepidar_items_invoice ON sepidar_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sepidar_items_product ON sepidar_invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sepidar_items_name ON sepidar_invoice_items(item_name);

CREATE TABLE IF NOT EXISTS match_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id INTEGER NOT NULL REFERENCES imed_distributions(id) ON DELETE CASCADE,
  sepidar_item_id INTEGER NOT NULL REFERENCES sepidar_invoice_items(id) ON DELETE CASCADE,
  matched_quantity REAL NOT NULL DEFAULT 0,
  match_method TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(distribution_id, sepidar_item_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_distribution ON match_allocations(distribution_id);
CREATE INDEX IF NOT EXISTS idx_matches_sepidar_item ON match_allocations(sepidar_item_id);
