// Friendship Helper — tiny local server that talks to Claude (web version).
// Run: npm install && npm start  → open http://localhost:3000
// The Android app doesn't use this server; it calls Claude directly (see src/direct.js).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { suggest, friendlyError, DEFAULT_MODEL } from "./src/suggest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
const MAX_BODY = 30 * 1024 * 1024; // screenshots can be big

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

// One shared client for the server's own credentials (ANTHROPIC_API_KEY,
// or an `ant auth login` profile). A key typed into the app's settings
// gets its own short-lived client per request.
let envClient = null;
function getClient(keyFromApp) {
  if (keyFromApp) return new Anthropic({ apiKey: keyFromApp });
  if (!envClient) envClient = new Anthropic();
  return envClient;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request too large (max 30 MB)."), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleSuggest(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, err.status || 400, { error: err.status ? err.message : "Invalid JSON body." });
  }
  const keyFromApp = typeof req.headers["x-claude-key"] === "string" ? req.headers["x-claude-key"].trim() : "";
  try {
    const out = await suggest(getClient(keyFromApp), { history: body.history, effort: body.effort, model: MODEL });
    return json(res, 200, out);
  } catch (err) {
    const { status, message } = friendlyError(err);
    if (status >= 500) console.error(err);
    return json(res, status, { error: message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/suggest") return handleSuggest(req, res);
  if (req.method === "GET" && req.url === "/api/status") {
    return json(res, 200, {
      model: MODEL,
      serverHasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    });
  }
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.log(`\n  💬 Friendship Helper is running → http://localhost:${PORT}\n`);
});
