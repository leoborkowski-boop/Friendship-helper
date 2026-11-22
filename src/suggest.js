// Shared Claude logic, used by the Node server (web version) and bundled
// into the Android app (which talks to Claude directly from the phone).
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";

export const SYSTEM_PROMPT = `You are "Friendship Helper", a warm, socially sharp texting coach built into a personal app.
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

export const OUTPUT_SCHEMA = {
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
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Claude rejected the request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Couldn't reach Claude. Check your internet connection." };
  if (err instanceof Anthropic.APIError) return { status: err.status || 500, message: `Claude API error: ${err.message}` };
  // Missing credentials surface as a plain Error from the client constructor.
  if (err instanceof Error && /api key|apiKey|auth/i.test(err.message)) {
    return { status: 401, message: "No Claude API key found. Add one in Settings → Claude connection." };
  }
  return { status: 500, message: "Something went wrong. Try again." };
}
