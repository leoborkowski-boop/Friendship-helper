// Friendship Helper — tiny local server that talks to Claude.
// Run: npm install && npm start  → open http://localhost:3000
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
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

const SYSTEM_PROMPT = `You are "Friendship Helper", a warm, socially sharp texting coach built into a personal app.
The user is chatting with a friend (or crush, group chat, family member, coworker...) and wants help with what to send.

Your job:
- Write messages the USER can copy and send as-is, in first person, as if they typed them. Never write "Here's a message:" inside the message itself.
- Match each requested style faithfully and creatively — that's the fun of the app — while keeping the core meaning right and the message something a real person could send.
- Read the room. Consider the relationship, the friend's mood, and any context given. If the friend seems upset, prioritise kindness even in silly styles.
- If you get a screenshot of a chat: work out who is who (the user's own bubbles are usually on the right / coloured), read the whole thread, and reply to the latest message from the other person unless told otherwise.
- Keep it real: no cringe over-explaining, no therapy-speak unless the style asks for it, no made-up facts about the user's life. If key info is missing, write something that works anyway and mention the gap in "tip".
- Never help with harassment, manipulation, threats, or deceiving someone in a harmful way. For those, gently steer toward an honest, kind alternative instead.

Output: fill the JSON schema.
- "read": 1–2 short sentences on the vibe / what they likely mean / what the user wants to get across.
- "suggestions": the requested number of options. "style" = the style name used. "message" = the exact text to send. "why" = max ~12 words on why it works.
- "tip": one short, practical tip (or an empty string if nothing useful to add).`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    read: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          style: { type: "string" },
          message: { type: "string" },
          why: { type: "string" },
        },
        required: ["style", "message", "why"],
        additionalProperties: false,
      },
    },
    tip: { type: "string" },
  },
  required: ["read", "suggestions", "tip"],
  additionalProperties: false,
};

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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

// Turn the app's history into Messages API turns. Images are validated here.
function toMessages(history) {
  if (!Array.isArray(history) || history.length === 0) {
    throw Object.assign(new Error("Nothing to send yet."), { status: 400 });
  }
  return history.map((turn) => {
    if (turn.role === "assistant") {
      return { role: "assistant", content: String(turn.text ?? "") };
    }
    const content = [];
    for (const img of turn.images ?? []) {
      if (!ALLOWED_IMAGE_TYPES.has(img.media_type) || typeof img.data !== "string") {
        throw Object.assign(new Error("Unsupported image type. Use PNG, JPEG, GIF or WebP."), { status: 400 });
      }
      content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    }
    content.push({ type: "text", text: String(turn.text ?? "") });
    return { role: "user", content };
  });
}

async function handleSuggest(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, err.status || 400, { error: err.status ? err.message : "Invalid JSON body." });
  }

  let messages;
  try {
    messages = toMessages(body.history);
  } catch (err) {
    return json(res, err.status || 400, { error: err.message });
  }

  const keyFromApp = typeof req.headers["x-claude-key"] === "string" ? req.headers["x-claude-key"].trim() : "";
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "low";

  try {
    const client = getClient(keyFromApp);
    // Streaming + finalMessage keeps long answers clear of HTTP timeouts.
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages,
      output_config: {
        effort,
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      // If a safety classifier wrongly declines, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      return json(res, 200, {
        refusal: true,
        error: "Claude didn't want to help with that one. Try rephrasing what you're going for.",
      });
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const hint = response.stop_reason === "max_tokens" ? " (the answer got cut off)" : "";
      return json(res, 502, { error: `Claude's answer couldn't be read${hint}. Try again.` });
    }

    return json(res, 200, { result: parsed, raw: text, model: response.model, usage: response.usage });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return json(res, 401, { error: "Claude API key is missing or invalid. Add one in Settings → Claude connection." });
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return json(res, 403, { error: "This API key isn't allowed to use that model." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json(res, 429, { error: "Rate limited — give it a few seconds and try again." });
    }
    if (err instanceof Anthropic.BadRequestError) {
      return json(res, 400, { error: `Claude rejected the request: ${err.message}` });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return json(res, 502, { error: "Couldn't reach Claude. Check your internet connection." });
    }
    if (err instanceof Anthropic.APIError) {
      return json(res, err.status || 500, { error: `Claude API error: ${err.message}` });
    }
    // Missing credentials surface as a plain Error from the client constructor.
    if (err instanceof Error && /api key|apiKey|auth/i.test(err.message)) {
      return json(res, 401, { error: "No Claude API key found. Add one in Settings → Claude connection, or start the server with ANTHROPIC_API_KEY set." });
    }
    console.error(err);
    return json(res, 500, { error: "Something went wrong on the server." });
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
