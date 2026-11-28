CREATE TABLE IF NOT EXISTS server_match_jobs (
 id TEXT PRIMARY KEY,
 snapshot_upload_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',
 total INTEGER NOT NULL DEFAULT 0,
 completed INTEGER NOT NULL DEFAULT 0,
 lease_until TEXT,
 error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_server_match_jobs_status ON server_match_jobs(status,created_at);
CREATE TABLE IF NOT EXISTS server_match_results (
 job_id TEXT NOT NULL REFERENCES server_match_jobs(id) ON DELETE CASCADE,
 doc_index INTEGER NOT NULL,
 result_json TEXT NOT NULL,
 PRIMARY KEY(job_id,doc_index)
);