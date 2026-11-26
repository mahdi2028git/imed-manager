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
  const allowed = (env.APP_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  const headers = { "Vary": "Origin" };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type,CF-Access-Jwt-Assertion";
  headers["Access-Control-Max-Age"] = "86400";
  return headers;
}

// Cloudflare Access must protect this Worker hostname.
// The Worker also validates the Access JWT before allowing data operations.
async function verifyAccessJwt(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;

  try {
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart) return false;

    const decode = (part) => {
      const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - part.length % 4) % 4);
      return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    };

    const header = JSON.parse(new TextDecoder().decode(decode(headerPart)));
    const payload = JSON.parse(new TextDecoder().decode(decode(payloadPart)));
    if (header.alg !== "RS256" || !header.kid) return false;

    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const issuer = "https://" + team;
    if (payload.iss !== issuer || !Array.isArray(payload.aud) || !payload.aud.includes(env.ACCESS_AUD)) return false;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return false;

    const certResponse = await fetch(issuer + "/cdn-cgi/access/certs");
    if (!certResponse.ok) return false;
    const certs = await certResponse.json();
    const jwk = (certs.keys || []).find(key => key.kid === header.kid);
    if (!jwk) return false;

    const publicKey = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const signed = new TextEncoder().encode(headerPart + "." + payloadPart);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decode(signaturePart), signed);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "imed-manager-d1-api" }, 200, cors);
    }

    if (!await verifyAccessJwt(request, env)) {
      return json({ error: "Unauthorized. Configure Cloudflare Access before using the database API." }, 401, cors);
    }

    const parts = url.pathname.split("/").filter(Boolean);

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
  }
};
