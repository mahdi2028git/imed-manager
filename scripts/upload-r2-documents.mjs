#!/usr/bin/env node
/**
 * IMED/Sepidar source-document uploader for Cloudflare R2.
 *
 * Safe by default: without --execute this only validates and previews.
 * Existing objects with a different SHA-256 are never overwritten unless
 * --overwrite is explicitly supplied. Nothing is ever deleted.
 *
 * Required environment:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *
 * Usage:
 *   node scripts/upload-r2-documents.mjs --manifest scripts/r2-manifest.example.json
 *   node scripts/upload-r2-documents.mjs --manifest ./my-manifest.json --execute
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const valueAfter = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const execute = args.has("--execute");
const overwrite = args.has("--overwrite");
const manifestArg = valueAfter("--manifest", "scripts/r2-manifest.example.json");
const rootArg = valueAfter("--root", process.cwd());
const root = fs.realpathSync(rootArg);
const manifestPath = path.resolve(manifestArg);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest)) throw new Error("Manifest must be a JSON array.");

const env = {
  account: process.env.R2_ACCOUNT_ID,
  accessKey: process.env.R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET
};
if (execute && Object.values(env).some(v => !v)) {
  throw new Error("For --execute set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
}

const endpoint = env.account ? `https://${env.account}.r2.cloudflarestorage.com` : "";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);
const contentTypes = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".xml": "application/xml"
};

function encodedKey(key) {
  return String(key).split("/").map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");
}

function signedHeaders(method, key, body, digest, contentType) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const url = new URL(`${endpoint}/${encodeURIComponent(env.bucket)}/${encodedKey(key)}`);
  const payloadHash = method === "HEAD" ? sha256(Buffer.alloc(0)) : sha256(body);
  const headers = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (method === "PUT") { headers["x-amz-meta-sha256"] = digest; headers["content-type"] = contentType; }
  const canonicalHeaderNames = [...Object.keys(headers).map(k => k.toLowerCase()), "host"].sort();
  const canonicalHeaders = canonicalHeaderNames.map(name => {
    const v = name === "host" ? url.host : headers[Object.keys(headers).find(k => k.toLowerCase() === name)];
    return name + ":" + String(v).trim().replace(/\s+/g, " ");
  }).join("\n");
  const signed = canonicalHeaderNames.join(";");
  const canonicalRequest = [
    method, url.pathname, "", canonicalHeaders, signed, payloadHash
  ].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)
  ].join("\n");
  const kDate = hmac("AWS4" + env.secretKey, day);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${env.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return { url, headers };
}

async function request(method, key, body, digest, contentType) {
  const signed = signedHeaders(method, key, body, digest, contentType);
  return fetch(signed.url, {
    method,
    headers: signed.headers,
    body: method === "PUT" ? body : undefined
  });
}

function safeLocalPath(localPath) {
  const full = fs.realpathSync(path.resolve(root, localPath));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`File escapes --root: ${localPath}`);
  }
  if (!fs.statSync(full).isFile()) throw new Error(`Not a file: ${localPath}`);
  return full;
}

const plan = manifest.map((item, index) => {
  if (!item || typeof item.localPath !== "string" || typeof item.objectKey !== "string") {
    throw new Error(`Manifest row ${index + 1} needs localPath and objectKey.`);
  }
  const full = safeLocalPath(item.localPath);
  const bytes = fs.readFileSync(full);
  return {
    localPath: item.localPath,
    objectKey: item.objectKey.replace(/^\/+/, ""),
    full,
    bytes,
    digest: sha256(bytes),
    contentType: item.contentType || contentTypes[path.extname(full).toLowerCase()] || "application/octet-stream"
  };
});

const seen = new Set();
for (const item of plan) {
  if (!item.objectKey || item.objectKey.split("/").includes("..")) throw new Error(`Unsafe object key: ${item.objectKey}`);
  if (seen.has(item.objectKey)) throw new Error(`Duplicate object key: ${item.objectKey}`);
  seen.add(item.objectKey);
}

console.log(`Mode: ${execute ? "UPLOAD" : "DRY RUN"} | Bucket: ${env.bucket || "(not set)"} | Files: ${plan.length}`);
for (const item of plan) {
  console.log(`- ${item.localPath} -> ${item.objectKey} | ${item.bytes.length} bytes | sha256 ${item.digest}`);
}

if (!execute) {
  console.log("\nPreview only. Add --execute after enabling R2 and setting the four environment variables.");
  process.exit(0);
}

let uploaded = 0, unchanged = 0;
for (const item of plan) {
  const head = await request("HEAD", item.objectKey, Buffer.alloc(0), item.digest);
  if (head.ok) {
    const existingHash = head.headers.get("x-amz-meta-sha256");
    if (existingHash === item.digest) {
      console.log(`UNCHANGED ${item.objectKey}`);
      unchanged++;
      continue;
    }
    if (!overwrite) {
      throw new Error(`Object already exists with different content: ${item.objectKey}. Review it or rerun with --overwrite.`);
    }
  } else if (head.status !== 404) {
    throw new Error(`HEAD failed for ${item.objectKey}: HTTP ${head.status} ${await head.text()}`);
  }

  const put = await request("PUT", item.objectKey, item.bytes, item.digest, item.contentType);
  if (!put.ok) throw new Error(`Upload failed for ${item.objectKey}: HTTP ${put.status} ${await put.text()}`);
  console.log(`UPLOADED ${item.objectKey}`);
  uploaded++;
}

console.log(`\nComplete. Uploaded: ${uploaded}; unchanged: ${unchanged}; deleted: 0.`);
