// Shared Claude logic, used by the Node server (web version) and bundled
// into the Android app (which talks to Claude directly from the phone).
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA } from "../public/prompt.js";

export { SYSTEM_PROMPT, OUTPUT_SCHEMA };

export const DEFAULT_MODEL = "claude-opus-5-5";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Turn the app's history into Messages API turns. Images are validated here.
export function toMessages(history) {
  if (!Array.isArray(history) || history.length === 0) throw new UserError("Nothing to send yet.");
  return history.map((turn) => {
    if (turn.role === "assistant") return { role: "assistant", content: String(turn.text ?? "") };
    const content = [];
    for (const img of turn.images ?? []) {
      if (!ALLOWED_IMAGE_TYPES.has(img.media_type) || typeof img.data !== "string") {
        throw new UserError("Unsupported image type. Use PNG, JPEG, GIF or WebP.");
      }
      content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    }
    content.push({ type: "text", text: String(turn.text ?? "") });
    return { role: "user", content };
  });
}

// Ask Claude for suggestions. Returns { result, raw, model } or { refusal: true, error }.
export async function suggest(client, { history, effort, model = DEFAULT_MODEL }) {
  const messages = toMessages(history);
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages,
    output_config: {
      effort: ["low", "medium", "high"].includes(effort) ? effort : "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    // If a safety classifier wrongly declines, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    return { refusal: true, error: "Claude didn't want to help with that one. Try rephrasing what you're going for." };
  }

  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { result: JSON.parse(raw), raw, model: response.model };
  } catch {
    const hint = response.stop_reason === "max_tokens" ? " (the answer got cut off)" : "";
    throw new UserError(`Claude's answer couldn't be read${hint}. Try again.`, 502);
  }
}

// Check a key without spending anything: listing models is free.
export async function checkKey(client) {
  await client.models.list({ limit: 1 });
  return { ok: true };
}

// Map any error to { status, message } the user can act on.
export function friendlyError(err) {
  if (err instanceof UserError) return { status: err.status, message: err.message };
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "That key didn't work — check you copied all of it (it starts with sk-ant-)." };
  }
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 403, message: "This API key isn't allowed to use that model." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Rate limited — give it a few seconds and try again." };
  if (err instanceof Anthropic.BadRequestError) {
    // A brand-new key passes the key check but can't generate until the account has credit.
    if (/credit balance|billing|purchase credits/i.test(err.message)) {
      return { status: 402, message: "Your Claude key works, but the account has no credit yet. Add some at platform.claude.com/settings/billing — or switch to a free AI in Settings." };
    }
    return { status: 400, message: `Claude rejected the request: ${err.message}` };
  }
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Couldn't reach Claude. Check your internet connection." };
  if (err instanceof Anthropic.APIError) return { status: err.status || 500, message: `Claude API error: ${err.message}` };
  // Missing credentials surface as a plain Error from the client constructor.
  if (err instanceof Error && /api key|apiKey|auth/i.test(err.message)) {
    return { status: 401, message: "No Claude API key found. Add one in Settings → AI connection." };
  }
  return { status: 500, message: "Something went wrong. Try again." };
}
