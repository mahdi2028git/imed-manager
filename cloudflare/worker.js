import { processBackgroundMatch } from "./background-matcher.js";
const TABLES = {
  products: ["irc", "gtin", "name", "model", "manufacturer", "country", "distinction"],
  customers: ["customer_code", "name", "type_id", "customer_type", "province", "city"],
  imed_distributions: ["document_no", "issue_date", "product_id", "customer_id", "quantity", "remaining_quantity", "source_file", "raw_json"],
  sepidar_invoices: ["invoice_no", "invoice_date", "customer_id", "document_type", "source_file", "raw_json"],
  sepidar_invoice_items: ["invoice_id", "product_id", "item_name", "quantity", "unit_price", "raw_json"],
  match_allocations: ["distribution_id", "sepidar_item_id", "matched_quantity", "match_method", "status", "notes"]
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.APP_ORIGIN || "https://mahdi2028git.github.io").split(",").map(v => v.trim()).filter(Boolean);
  const headers = { "Vary": "Origin" };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization";
  headers["Access-Control-Max-Age"] = "86400";
  return headers;
}

// The app authenticates with the private API key stored as a Worker secret.
async function verifyApiKey(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = env.API_KEY || "";
  if (!supplied || !expected || supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function decodeBase64Chunk(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function ensureBackgroundMatchTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS background_match_jobs (id TEXT PRIMARY KEY, base_hash TEXT NOT NULL UNIQUE, input_json TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, percent REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running', state_json TEXT, error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS background_match_results (job_id TEXT NOT NULL, doc_index INTEGER NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(job_id, doc_index))").run();
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "imed-manager-d1-api" }, 200, cors);
    }

    if (!await verifyApiKey(request, env)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "api" && parts[1] === "background-matches") {
      try {
        await ensureBackgroundMatchTables(env);
        if (request.method === "POST" && parts.length === 2) {
          const body = await request.json();
          const baseHash = String(body.baseHash || "");
          const input = body.input || {};
          const imed = Array.isArray(input.imed) ? input.imed : [];
          const sepidar = Array.isArray(input.sepidar) ? input.sepidar : [];
          if (!/^[a-f0-9]{64}$/.test(baseHash) || !imed.length || !sepidar.length) return json({error:"Invalid background matching snapshot"},400,cors);
          const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
          if (bytes > 8_000_000) return json({error:"Snapshot exceeds 8 MB; chunked upload is required",bytes},413,cors);
          let job = await env.DB.prepare("SELECT * FROM background_match_jobs WHERE base_hash=?").bind(baseHash).first();
          if (job && job.status === "completed") return json({job,resumed:true},200,cors);
          if (!job) {
            const id = crypto.randomUUID();
            await env.DB.prepare("INSERT INTO background_match_jobs (id,base_hash,input_json,status) VALUES (?,?,?,'running')").bind(id,baseHash,JSON.stringify(input)).run();
            job = await env.DB.prepare("SELECT id,base_hash,cursor,percent,status,error,created_at,updated_at FROM background_match_jobs WHERE id=?").bind(id).first();
            await env.MATCH_QUEUE.send({jobId:id});
          } else if (job.status === "failed") {
            await env.DB.prepare("UPDATE background_match_jobs SET status='running',error='',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();
            await env.MATCH_QUEUE.send({jobId:job.id});
            job = await env.DB.prepare("SELECT id,base_hash,cursor,percent,status,error,created_at,updated_at FROM background_match_jobs WHERE id=?").bind(job.id).first();
          }
          return json({job,resumed:!!job.cursor},200,cors);
        }
        if (request.method === "GET" && parts.length === 2) {
          const id = String(url.searchParams.get("id") || "");
          if (!id) return json({error:"Missing job id"},400,cors);
          const job = await env.DB.prepare("SELECT id,base_hash,cursor,percent,status,error,created_at,updated_at FROM background_match_jobs WHERE id=?").bind(id).first();
          if (!job) return json({error:"Job not found"},404,cors);
          return json({job},200,cors);
        }
        if (request.method === "GET" && parts.length === 3 && parts[2] === "results") {
          const id = String(url.searchParams.get("id") || "");
          if (!id) return json({error:"Missing job id"},400,cors);
          const rows = await env.DB.prepare("SELECT doc_index,result_json FROM background_match_results WHERE job_id=? ORDER BY doc_index LIMIT 5000").bind(id).all();
          return json({data:(rows.results||[]).map(x=>({doc_index:x.doc_index,result:JSON.parse(x.result_json)}))},200,cors);
        }
        return json({error:"Method not allowed"},405,cors);
      } catch (error) {
        return json({error:"Background matching operation failed",detail:error.message},500,cors);
      }
    }

    // Full application snapshot: only switch the active pointer after a complete upload.
    if (parts[0] === "api" && parts[1] === "state") {
      try {
        if (request.method === "GET" && parts.length === 2) {
          const meta = await env.DB.prepare("SELECT upload_id, total_parts, updated_at FROM app_state_meta WHERE id = 1").first();
          if (!meta) return json({ error: "No saved snapshot" }, 404, cors);
          const all = [];
          for (let offset = 0; offset < Number(meta.total_parts); offset += 20) {
            const batch = await env.DB.prepare("SELECT part_index, data FROM app_state_uploads WHERE upload_id = ? ORDER BY part_index LIMIT 20 OFFSET ?").bind(meta.upload_id, offset).all();
            all.push(...(batch.results || []));
          }
          if (all.length !== Number(meta.total_parts)) return json({ error: "Saved snapshot is incomplete" }, 500, cors);
          all.sort((a, b) => Number(a.part_index) - Number(b.part_index));
          const chunks = all.map(row => decodeBase64Chunk(row.data));
          const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const joined = new Uint8Array(totalBytes);
          let cursor = 0;
          for (const chunk of chunks) { joined.set(chunk, cursor); cursor += chunk.length; }
          const data = JSON.parse(new TextDecoder().decode(joined));
          return json({ data, updatedAt: meta.updated_at }, 200, cors);
        }
        if (request.method === "POST" && parts[2] === "chunk") {
          const body = await request.json();
          const uploadId = String(body.uploadId || "");
          const index = Number(body.index), total = Number(body.total), data = String(body.data || "");
          if (!/^[a-zA-Z0-9-]{8,80}$/.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 1000 || index < 0 || index >= total || !data || data.length > 180000) return json({ error: "Invalid upload chunk" }, 400, cors);
          await env.DB.prepare("INSERT INTO app_state_uploads (upload_id, part_index, total_parts, data) VALUES (?, ?, ?, ?) ON CONFLICT(upload_id, part_index) DO UPDATE SET total_parts=excluded.total_parts, data=excluded.data").bind(uploadId, index, total, data).run();
          return json({ ok: true, index, total }, 200, cors);
        }
        if (request.method === "POST" && parts[2] === "commit") {
          const body = await request.json();
          const uploadId = String(body.uploadId || ""), total = Number(body.total);
          if (!/^[a-zA-Z0-9-]{8,80}$/.test(uploadId) || !Number.isInteger(total) || total < 1 || total > 1000) return json({ error: "Invalid upload commit" }, 400, cors);
          const check = await env.DB.prepare("SELECT COUNT(*) AS count, MIN(total_parts) AS min_total, MAX(total_parts) AS max_total FROM app_state_uploads WHERE upload_id = ?").bind(uploadId).first();
          if (!check || Number(check.count) !== total || Number(check.min_total) !== total || Number(check.max_total) !== total) return json({ error: "Upload is incomplete; active backup was not changed", received: Number(check?.count || 0), expected: total }, 409, cors);
          await env.DB.prepare("INSERT INTO app_state_meta (id, upload_id, total_parts, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET upload_id=excluded.upload_id, total_parts=excluded.total_parts, updated_at=CURRENT_TIMESTAMP").bind(uploadId, total).run();
          return json({ ok: true, parts: total }, 200, cors);
        }
        return json({ error: "Method not allowed" }, 405, cors);
      } catch (error) {
        return json({ error: "Snapshot operation failed", detail: error.message }, 500, cors);
      }
    }

    // Persistent status for the existing automatic matching button. The matching engine
    // remains the app's established algorithm; this endpoint persists its job/progress.
    if (parts[0] === "api" && parts[1] === "match-jobs") {
      try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS match_jobs (id TEXT PRIMARY KEY, base_hash TEXT NOT NULL UNIQUE, total INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0, percent REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running', detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        if (request.method === "POST" && parts.length === 2) {
          const body = await request.json();
          const baseHash = String(body.baseHash || "");
          const total = Number(body.total);
          if (!/^[a-f0-9]{64}$/.test(baseHash) || !Number.isInteger(total) || total < 0 || total > 1000000) return json({ error: "Invalid matching job" }, 400, cors);
          const existing = await env.DB.prepare("SELECT * FROM match_jobs WHERE base_hash = ?").bind(baseHash).first();
          if (existing && existing.status === "completed") return json({ job: existing, resumed: true }, 200, cors);
          const jobId = existing?.id || crypto.randomUUID();
          await env.DB.prepare("INSERT INTO match_jobs (id, base_hash, total, completed, percent, status, detail, updated_at) VALUES (?, ?, ?, 0, 0, 'running', 'شروع محاسبه', CURRENT_TIMESTAMP) ON CONFLICT(base_hash) DO UPDATE SET total=excluded.total, status='running', detail='ادامه محاسبه', updated_at=CURRENT_TIMESTAMP").bind(jobId, baseHash, total).run();
          const job = await env.DB.prepare("SELECT * FROM match_jobs WHERE base_hash = ?").bind(baseHash).first();
          return json({ job, resumed: !!existing }, 200, cors);
        }
        if (request.method === "GET" && parts.length === 2) {
          const baseHash = String(url.searchParams.get("baseHash") || "");
          if (!/^[a-f0-9]{64}$/.test(baseHash)) return json({ error: "Invalid matching fingerprint" }, 400, cors);
          const job = await env.DB.prepare("SELECT * FROM match_jobs WHERE base_hash = ?").bind(baseHash).first();
          return json({ job: job || null }, 200, cors);
        }
        if (request.method === "PATCH" && parts.length === 3) {
          const jobId = String(parts[2] || "");
          const body = await request.json();
          const percent = Math.max(0, Math.min(100, Number(body.percent) || 0));
          const completed = Math.max(0, Number(body.completed) || 0);
          const status = body.status === "completed" ? "completed" : body.status === "failed" ? "failed" : "running";
          const detail = String(body.detail || "").slice(0, 500);
          const result = await env.DB.prepare("UPDATE match_jobs SET completed = ?, percent = ?, status = ?, detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(completed, percent, status, detail, jobId).run();
          if (!result.meta?.changes) return json({ error: "Matching job not found" }, 404, cors);
          const job = await env.DB.prepare("SELECT * FROM match_jobs WHERE id = ?").bind(jobId).first();
          return json({ job }, 200, cors);
        }
        return json({ error: "Method not allowed" }, 405, cors);
      } catch (error) {
        return json({ error: "Matching job operation failed", detail: error.message }, 500, cors);
      }
    }

    // Durable cache for automatic invoice suggestions. Cache rows never create allocations.
    if (parts[0] === "api" && parts[1] === "match-cache") {
      try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS match_suggestion_cache (base_hash TEXT NOT NULL, doc_key TEXT NOT NULL, result_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (base_hash, doc_key))").run();
        if (request.method === "GET") {
          const baseHash = String(url.searchParams.get("baseHash") || "");
          if (!/^[a-f0-9]{64}$/.test(baseHash)) return json({ error: "Invalid cache fingerprint" }, 400, cors);
          const result = await env.DB.prepare("SELECT doc_key, result_json FROM match_suggestion_cache WHERE base_hash = ?").bind(baseHash).all();
          return json({ data: result.results || [] }, 200, cors);
        }
        if (request.method === "POST") {
          const body = await request.json();
          const baseHash = String(body.baseHash || "");
          const rows = Array.isArray(body.rows) ? body.rows : [];
          if (!/^[a-f0-9]{64}$/.test(baseHash) || !rows.length || rows.length > 50) return json({ error: "Invalid cache batch" }, 400, cors);
          const statements = [];
          for (const row of rows) {
            const docKey = String(row?.docKey || "");
            const resultJson = JSON.stringify(row?.result);
            if (!/^[a-f0-9]{64}$/.test(docKey) || !row?.result || resultJson.length > 500000) return json({ error: "Invalid cache row" }, 400, cors);
            statements.push(env.DB.prepare("INSERT INTO match_suggestion_cache (base_hash, doc_key, result_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(base_hash, doc_key) DO UPDATE SET result_json=excluded.result_json, updated_at=CURRENT_TIMESTAMP").bind(baseHash, docKey, resultJson));
          }
          const result = await env.DB.batch(statements);
          return json({ ok: true, saved: result.length }, 200, cors);
        }
        return json({ error: "Method not allowed" }, 405, cors);
      } catch (error) {
        return json({ error: "Match cache operation failed", detail: error.message }, 500, cors);
      }
    }

    // Local-first match sync: only confirmed allocations are synchronized.
    // Source records stay in each device local SQLite database.
    if (parts[0] === "api" && parts[1] === "matches" && parts[2] === "sync") {
      try {
        if (request.method === "GET") {
          const since = url.searchParams.get("since") || "1970-01-01T00:00:00.000Z";
          const result = await env.DB.prepare("SELECT * FROM match_allocations WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 500").bind(since).all();
          return json({ data: result.results || [], meta: { count: (result.results || []).length } }, 200, cors);
        }
        if (request.method === "POST") {
          const body = await request.json();
          const matches = Array.isArray(body.matches) ? body.matches : [];
          if (!matches.length || matches.length > 100) return json({ error: "Send between 1 and 100 matches per batch" }, 400, cors);
          const statements = [];
          for (const m of matches) {
            if (!m || !m.id || !m.distribution_key || !m.sepidar_item_key || !Number.isFinite(Number(m.matched_quantity)) || Number(m.matched_quantity) < 0) {
              return json({ error: "Each match requires id, distribution_key, sepidar_item_key and a non-negative matched_quantity" }, 400, cors);
            }
            statements.push(env.DB.prepare("INSERT INTO match_allocations (id, distribution_key, sepidar_item_key, distribution_local_id, sepidar_item_local_id, matched_quantity, match_method, status, notes, device_id, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(distribution_key, sepidar_item_key) DO UPDATE SET id=excluded.id, distribution_local_id=excluded.distribution_local_id, sepidar_item_local_id=excluded.sepidar_item_local_id, matched_quantity=excluded.matched_quantity, match_method=excluded.match_method, status=excluded.status, notes=excluded.notes, device_id=excluded.device_id, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at WHERE excluded.updated_at >= match_allocations.updated_at").bind(
              String(m.id), String(m.distribution_key), String(m.sepidar_item_key),
              String(m.distribution_local_id || ""), String(m.sepidar_item_local_id || ""),
              Number(m.matched_quantity), String(m.match_method || "manual"),
              String(m.status || "confirmed"), String(m.notes || ""), String(m.device_id || ""),
              String(m.updated_at || new Date().toISOString()), m.deleted_at ? String(m.deleted_at) : null
            ));
          }
          const result = await env.DB.batch(statements);
          return json({ ok: true, processed: result.length }, 200, cors);
        }
        return json({ error: "Method not allowed" }, 405, cors);
      } catch (error) {
        return json({ error: "Match sync failed", detail: error.message }, 500, cors);
      }
    }

    if (parts[0] !== "api" || !TABLES[parts[1]]) return json({ error: "Not found" }, 404, cors);

    const table = parts[1];
    const allowedColumns = TABLES[table];
    const id = parts[2] ? Number(parts[2]) : null;
    if (parts[2] && (!Number.isSafeInteger(id) || id < 1)) return json({ error: "Invalid id" }, 400, cors);

    try {
      if (request.method === "GET" && id) {
        const row = await env.DB.prepare("SELECT * FROM " + table + " WHERE id = ?").bind(id).first();
        return row ? json(row, 200, cors) : json({ error: "Not found" }, 404, cors);
      }

      if (request.method === "GET") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
        const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
        const result = await env.DB.prepare("SELECT * FROM " + table + " ORDER BY id DESC LIMIT ? OFFSET ?")
          .bind(limit, offset).all();
        return json({ data: result.results || [], meta: { limit, offset, count: (result.results || []).length } }, 200, cors);
      }

      if (request.method === "POST" && !id) {
        const body = await request.json();
        const entries = Object.entries(body).filter(([key, value]) => allowedColumns.includes(key) && value !== undefined);
        if (!entries.length) return json({ error: "No valid fields supplied" }, 400, cors);
        const columns = entries.map(([key]) => key);
        const placeholders = columns.map(() => "?").join(", ");
        const stmt = "INSERT INTO " + table + " (" + columns.join(", ") + ") VALUES (" + placeholders + ")";
        const result = await env.DB.prepare(stmt).bind(...entries.map(([, value]) => value)).run();
        return json({ ok: true, id: result.meta?.last_row_id ?? null }, 201, cors);
      }

      if (request.method === "PATCH" && id) {
        const body = await request.json();
        const entries = Object.entries(body).filter(([key, value]) => allowedColumns.includes(key) && value !== undefined);
        if (!entries.length) return json({ error: "No valid fields supplied" }, 400, cors);
        const assignments = entries.map(([key]) => key + " = ?").join(", ");
        const stmt = "UPDATE " + table + " SET " + assignments + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?";
        const result = await env.DB.prepare(stmt).bind(...entries.map(([, value]) => value), id).run();
        return json({ ok: true, changes: result.meta?.changes ?? 0 }, 200, cors);
      }

      if (request.method === "DELETE" && id) {
        const result = await env.DB.prepare("DELETE FROM " + table + " WHERE id = ?").bind(id).run();
        return json({ ok: true, changes: result.meta?.changes ?? 0 }, 200, cors);
      }

      return json({ error: "Method not allowed" }, 405, cors);
    } catch (error) {
      return json({ error: "Database operation failed", detail: error.message }, 500, cors);
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const jobId = String(message.body?.jobId || "");
      if (!jobId) { message.ack(); continue; }
      try {
        await ensureBackgroundMatchTables(env);
        await processBackgroundMatch(env.DB, jobId, env.MATCH_QUEUE);
        message.ack();
      } catch (error) {
        const detail = String(error?.stack || error?.message || error).slice(0,2000);
        if (Number(message.attempts || 1) >= 3) {
          await env.DB.prepare("UPDATE background_match_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(detail,jobId).run();
          message.ack();
        } else {
          await env.DB.prepare("UPDATE background_match_jobs SET error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(detail,jobId).run();
          message.retry();
        }
      }
    }
  }
};
