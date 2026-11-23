// Free AI providers: the user pastes their own free-tier key.
// These run straight from the browser / phone (all three allow it), no server needed.
// Claude stays in src/ (official Anthropic SDK); this file only handles the free ones.
import { SYSTEM_PROMPT, OUTPUT_SCHEMA } from "./prompt.js";

export const PROVIDERS = {
  gemini: {
    name: "Google Gemini",
    tag: "Free",
    blurb: "Free with a Google account. Reads screenshots. Daily limits apply.",
    keyPrefix: "AIza",
    defaultModel: "gemini-3.5-flash-lite",
    privacy: "Google's free tier uses what you send to improve its products — skip screenshots with private stuff in them.",
    steps: [
      { title: "Sign in to Google AI Studio", text: "Use any Google account. No card needed.", link: "https://aistudio.google.com/apikey", label: "Open Google AI Studio ↗" },
      { title: "Create a key and copy it", text: "Tap “Create API key”, then copy it. It starts with <code>AIza</code>." },
    ],
  },
  groq: {
    name: "Groq",
    tag: "Free",
    blurb: "Free plan, super fast. Around 1,000 requests a day.",
    keyPrefix: "gsk_",
    defaultModel: "openai/gpt-oss-120b",
    visionModel: "qwen/qwen3.8-27b", // used automatically when you attach a screenshot
    privacy: "Free plans can change and may keep what you send — skip screenshots with private stuff in them.",
    steps: [
      { title: "Sign up for GroqCloud", text: "Free account with email, Google or GitHub. No card needed.", link: "https://console.groq.com/keys", label: "Open Groq Console ↗" },
      { title: "Create a key and copy it", text: "Tap “Create API Key”, name it, then copy it. It starts with <code>gsk_</code>." },
    ],
  },
  openrouter: {
    name: "OpenRouter",
    tag: "Free models",
    blurb: "One key, many free models (the ones ending in :free). Daily limits apply.",
    keyPrefix: "sk-or-",
    defaultModel: "google/gemma-4-31b-it:free",
    privacy: "Some free models are run by providers that may log what you send — skip screenshots with private stuff in them.",
    steps: [
      { title: "Sign up for OpenRouter", text: "Free account. You don't need to add credit to use :free models.", link: "https://openrouter.ai/settings/keys", label: "Open OpenRouter keys ↗" },
      { title: "Create a key and copy it", text: "Tap “Create Key”, then copy it. It starts with <code>sk-or-</code>." },
    ],
  },
};

// Which provider does a pasted key belong to?
export function detectProvider(key) {
  if (key.startsWith("sk-ant-")) return "claude";
  return Object.keys(PROVIDERS).find((id) => key.startsWith(PROVIDERS[id].keyPrefix)) || null;
}

// Other models don't get Claude's structured output, so spell out the format.
const JSON_RULES = `${SYSTEM_PROMPT}

IMPORTANT: Reply with ONLY one JSON object (no markdown, no code fences, no text before or after) that matches this JSON Schema:
${JSON.stringify(OUTPUT_SCHEMA)}`;

class ProviderError extends Error {}

function parseResult(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  let data;
  try {
    data = JSON.parse(t);
  } catch {
    throw new ProviderError("The AI's answer came back garbled. Tap the button again.");
  }
  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .filter((s) => s && (s.message || s.text))
    .map((s) => ({ style: String(s.style || "Option"), message: String(s.message || s.text), why: String(s.why || "") }));
  if (!suggestions.length) throw new ProviderError("The AI didn't give any suggestions. Tap the button again.");
  return { read: String(data.read || ""), suggestions, tip: String(data.tip || "") };
}

function friendlyHttpError(provider, status, apiMessage) {
  const name = PROVIDERS[provider].name;
  if (status === 401 || status === 403 || /api key not valid|invalid api key|API_KEY_INVALID/i.test(apiMessage || "")) {
    return `That ${name} key didn't work — check you copied all of it (it starts with ${PROVIDERS[provider].keyPrefix}).`;
  }
  if (status === 429) return `You've hit ${name}'s free limit for now. Wait a minute (or until tomorrow), or switch AI in Settings.`;
  if (status === 404) return `${name} doesn't have that model anymore. Clear the Model box in Settings to use the default.`;
  if (status >= 500) return `${name} is having trouble right now. Try again in a moment.`;
  return `${name} said: ${apiMessage || `error ${status}`}`;
}

async function request(provider, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ProviderError(`Couldn't reach ${PROVIDERS[provider].name}. Check your internet connection.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || (typeof data?.error === "string" ? data.error : "");
    throw new ProviderError(friendlyHttpError(provider, res.status, msg));
  }
  return data;
}

// ── Google Gemini ──
async function callGemini({ apiKey, model, history }) {
  const contents = history.map((turn) =>
    turn.role === "assistant"
      ? { role: "model", parts: [{ text: String(turn.text ?? "") }] }
      : {
          role: "user",
          parts: [
            ...(turn.images || []).map((img) => ({ inline_data: { mime_type: img.media_type, data: img.data } })),
            { text: String(turn.text ?? "") },
          ],
        },
  );
  const data = await request("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: JSON_RULES }] },
      contents,
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const cand = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") {
    return { refusal: true, error: "Gemini didn't want to help with that one. Try rephrasing what you're going for." };
  }
  return (cand?.content?.parts || []).map((p) => p.text || "").join("");
}

// ── Groq and OpenRouter (OpenAI-style chat API) ──
async function callOpenAIStyle(provider, { apiKey, model, history }) {
  const messages = [{ role: "system", content: JSON_RULES }];
  for (const turn of history) {
    if (turn.role === "assistant") {
      messages.push({ role: "assistant", content: String(turn.text ?? "") });
    } else if (turn.images?.length) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: String(turn.text ?? "") },
          ...turn.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.media_type};base64,${img.data}` } })),
        ],
      });
    } else {
      messages.push({ role: "user", content: String(turn.text ?? "") });
    }
  }
  const url = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
  const headers = { "content-type": "application/json", authorization: `Bearer ${apiKey}` };
  if (provider === "openrouter") headers["X-Title"] = "Friendship Helper";
  const data = await request(provider, url, { method: "POST", headers, body: JSON.stringify({ model, messages }) });
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return { refusal: true, error: `${PROVIDERS[provider].name} didn't want to help with that one. Try rephrasing.` };
  }
  const content = choice?.message?.content;
  return Array.isArray(content) ? content.map((c) => c.text || "").join("") : content || "";
}

// Ask a free provider for suggestions. Same return shape as the Claude path.
export async function suggestFree(provider, { apiKey, model, history }) {
  const p = PROVIDERS[provider];
  if (!apiKey) throw new Error(`Add your free ${p.name} key first (Settings → AI connection).`);
  const hasImages = history.some((t) => t.images?.length);
  const useModel = model || (hasImages && p.visionModel) || p.defaultModel;
  try {
    const out = provider === "gemini" ? await callGemini({ apiKey, model: useModel, history }) : await callOpenAIStyle(provider, { apiKey, model: useModel, history });
    if (typeof out === "object") return out; // refusal
    return { result: parseResult(out), raw: out, model: useModel };
  } catch (err) {
    if (err instanceof ProviderError) throw new Error(hasImages && /model|support|image/i.test(err.message) ? `${err.message} (This model may not read screenshots — try Google Gemini.)` : err.message);
    throw err;
  }
}

// Check a key without using up any free requests: just list models / key info.
export async function checkFreeKey(provider, apiKey) {
  if (!apiKey) throw new Error("Paste your key first.");
  const urls = {
    gemini: ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { "x-goog-api-key": apiKey }],
    groq: ["https://api.groq.com/openai/v1/models", { authorization: `Bearer ${apiKey}` }],
    openrouter: ["https://openrouter.ai/api/v1/key", { authorization: `Bearer ${apiKey}` }],
  };
  const [url, headers] = urls[provider];
  try {
    await request(provider, url, { headers });
    return { ok: true };
  } catch (err) {
    throw new Error(err.message);
  }
}
