// Free AI providers: the user pastes their own free-tier key.
// These run straight from the browser / phone (all three allow it), no server needed.
// Claude stays in src/ (official Anthropic SDK); this file only handles the free ones.
//
// Free models come and go and differ by account and country, so we never trust a
// hard-coded model name: when you connect, we ask the service which models your key
// can use, send one tiny test message, and remember the first model that answers.
import { SYSTEM_PROMPT, OUTPUT_SCHEMA } from "./prompt.js";

export const PROVIDERS = {
  gemini: {
    name: "Google Gemini",
    tag: "Free",
    blurb: "Free with a Google account. Reads screenshots. Daily limits apply.",
    keyPrefix: "AIza",
    defaultModel: "gemini-3.5-flash-lite",
    preferred: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
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
    preferred: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant", "qwen/qwen3.8-27b"],
    preferredVision: ["qwen/qwen3.8-27b", "meta-models/muse-spark-open", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
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
    preferred: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free"],
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

// ───────────────────────── errors ─────────────────────────
// kind: key | location | policy | limit | model | server | network | other
class ProviderError extends Error {
  constructor(provider, kind, status, details) {
    super("");
    this.provider = provider;
    this.kind = kind;
    this.status = status;
    this.details = details || "";
    this.message = describe(this);
  }
}

function classify(status, msg) {
  const m = msg || "";
  if (status === 401 || /api key not valid|API_KEY_INVALID|invalid api key|invalid_api_key|incorrect api key|no auth credentials|user not found/i.test(m)) return "key";
  if (/location is not supported|not available in your (country|region)|unsupported_country|unsupported region/i.test(m)) return "location";
  if (/data policy|privacy setting/i.test(m)) return "policy";
  if (status === 429) return /limit:\s*0\b|free tier.*not|not available.*free/i.test(m) ? "model" : "limit";
  if (status === 404 || status === 403 || status === 402) return "model";
  if (status === 400 && /model|not supported|does not support|unsupported|vision|image/i.test(m)) return "model";
  if (status >= 500) return "server";
  return "other";
}

function describe(e) {
  const p = PROVIDERS[e.provider];
  const d = e.details ? ` (${e.provider === "gemini" ? "Google" : p.name} said: “${e.details.slice(0, 160)}”)` : "";
  switch (e.kind) {
    case "key":
      return `That ${p.name} key didn't work — check you copied all of it (it starts with ${p.keyPrefix}).`;
    case "location":
      return `${p.name}'s free plan isn't available where you are. Try another free AI in Settings.${d}`;
    case "policy":
      return `OpenRouter is blocking free models because of your privacy settings. On openrouter.ai open Settings → Privacy and allow free model endpoints (they may log prompts), then try again.${d}`;
    case "limit":
      return `You've hit ${p.name}'s free limit for now. Wait a minute (or until tomorrow), or switch to another free AI in Settings.`;
    case "model":
      return `${p.name} won't let your key use that model.${d}`;
    case "nomodel":
      return `Your key works, but none of ${p.name}'s free models would answer it.${d} Try another free AI in Settings.`;
    case "server":
      return `${p.name}'s servers are busy or having trouble right now. Try again in a moment, or switch to another free AI in Settings.${d}`;
    case "network":
      return `Couldn't reach ${p.name}. Check your internet connection.`;
    default:
      return `${p.name} couldn't answer.${d || ` (error ${e.status})`}`;
  }
}

async function request(provider, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ProviderError(provider, "network", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    const msg = (typeof err === "string" ? err : err?.message) || data?.message || "";
    throw new ProviderError(provider, classify(res.status, msg), res.status, msg);
  }
  return data;
}

// ───────────────────────── raw calls ─────────────────────────
async function callGemini(apiKey, model, { system, history, plain = false }) {
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
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  // Strict JSON mode helps, but some models fail on it: `plain` retries without it.
  if (system && !plain) body.generationConfig = { responseMimeType: "application/json" };
  const data = await request("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const cand = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") return { refused: true };
  return { text: (cand?.content?.parts || []).map((p) => (p.thought ? "" : p.text || "")).join("") };
}

async function callOpenAIStyle(provider, apiKey, model, { system, history }) {
  const messages = system ? [{ role: "system", content: system }] : [];
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
  // OpenRouter can report an upstream failure inside a 200 response.
  if (data.error) {
    const msg = data.error.message || "";
    throw new ProviderError(provider, classify(data.error.code || 400, msg), data.error.code || 400, msg);
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "content_filter") return { refused: true };
  const content = choice?.message?.content;
  return { text: Array.isArray(content) ? content.map((c) => c.text || "").join("") : content || "" };
}

const callModel = (provider, apiKey, model, args) =>
  provider === "gemini" ? callGemini(apiKey, model, args) : callOpenAIStyle(provider, apiKey, model, args);

// ───────────────────────── finding a model that works ─────────────────────────
const NOT_CHAT = /embed|tts|audio|whisper|guard|orpheus|imagen|image-generation|veo|live|aqa|robotics|computer-use|-image\b|native/i;

async function listModels(provider, apiKey, { vision }) {
  if (provider === "gemini") {
    const data = await request("gemini", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": apiKey } });
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((id) => /gemini/i.test(id) && !NOT_CHAT.test(id));
  }
  if (provider === "groq") {
    const data = await request("groq", "https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${apiKey}` } });
    return (data.data || []).filter((m) => m.active !== false).map((m) => m.id).filter((id) => !NOT_CHAT.test(id));
  }
  // OpenRouter: check the key, then read the public list of free models.
  await request("openrouter", "https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${apiKey}` } });
  const data = await request("openrouter", "https://openrouter.ai/api/v1/models", {});
  return (data.data || [])
    .filter((m) => m.id.endsWith(":free") && (m.architecture?.output_modalities || ["text"]).includes("text"))
    .sort((a, b) => Number((b.architecture?.input_modalities || []).includes("image")) - Number((a.architecture?.input_modalities || []).includes("image")))
    .filter((m) => !vision || (m.architecture?.input_modalities || []).includes("image"))
    .map((m) => m.id);
}

function orderCandidates(provider, available, { vision, exclude = [] }) {
  const p = PROVIDERS[provider];
  const pref = (vision && p.preferredVision) || p.preferred;
  const avail = new Set(available);
  const first = pref.filter((id) => avail.has(id));
  let rest = available.filter((id) => !first.includes(id));
  if (provider === "gemini") rest = rest.sort((a, b) => Number(/flash/.test(b)) - Number(/flash/.test(a)) || Number(/pro/.test(a)) - Number(/pro/.test(b)));
  if (provider === "groq" && vision) rest = rest.filter((id) => /vision|vl|scout|maverick|qwen|muse/i.test(id));
  return [...first, ...rest].filter((id) => !exclude.includes(id));
}

// Lists the models the key can use, then sends a tiny message to each likely one
// until one answers. Uses 1–2 free requests (at most 5).
export async function findWorkingModel(provider, apiKey, { vision = false, exclude = [] } = {}) {
  const available = await listModels(provider, apiKey, { vision });
  const candidates = orderCandidates(provider, available, { vision, exclude }).slice(0, 5);
  let last = null;
  for (const model of candidates) {
    try {
      await callModel(provider, apiKey, model, { history: [{ role: "user", text: "Reply with just the word: ok" }] });
      return model;
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      if (["key", "location", "policy", "network", "limit"].includes(err.kind)) throw err; // trying other models won't help
      last = err;
    }
  }
  const e = new ProviderError(provider, "nomodel", last?.status || 0, last?.details || (candidates.length ? "" : "no free chat models were listed for this key"));
  throw e;
}

// ───────────────────────── public API ─────────────────────────
function parseResult(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  let data;
  try {
    data = JSON.parse(t);
  } catch {
    throw new Error("The AI's answer came back garbled. Tap the button again.");
  }
  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .filter((s) => s && (s.message || s.text))
    .map((s) => ({ style: String(s.style || "Option"), message: String(s.message || s.text), why: String(s.why || "") }));
  if (!suggestions.length) throw new Error("The AI didn't give any suggestions. Tap the button again.");
  return { read: String(data.read || ""), suggestions, tip: String(data.tip || "") };
}

const needsVisionModel = (provider, history) => provider !== "gemini" && history.some((t) => t.images?.length);

// Ask a free provider for suggestions. Same return shape as the Claude path.
// `auto` = { text, vision } models found earlier; `onAuto(kind, model)` saves a new one.
export async function suggestFree(provider, { apiKey, model, auto = {}, onAuto = () => {}, history }) {
  const p = PROVIDERS[provider];
  if (!apiKey) throw new Error(`Add your free ${p.name} key first (Settings → AI connection).`);
  const vision = needsVisionModel(provider, history);
  const slot = vision ? "vision" : "text";
  let use = model || auto[slot];
  if (!use) {
    use = await findWorkingModel(provider, apiKey, { vision });
    onAuto(slot, use);
  }
  const run = (m, opts = {}) => callModel(provider, apiKey, m, { system: JSON_RULES, history, ...opts });
  const switchable = (e) => e instanceof ProviderError && (e.kind === "model" || e.kind === "server");
  let out = null;
  let err = null;
  try {
    out = await run(use);
  } catch (e) {
    err = e;
  }
  // Busy / server error: wait a moment and retry once without strict JSON mode.
  if (!out && err instanceof ProviderError && err.kind === "server") {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      out = await run(use, { plain: true });
    } catch (e) {
      err = e;
    }
  }
  if (!out) {
    if (!switchable(err)) throw err;
    if (model) throw new Error(`${p.name} won't run the model “${model}” you typed in Settings. Clear the Model box to let the app pick one.${err.details ? ` (${err.details.slice(0, 160)})` : ""}`);
    // That model isn't working right now: find another one and try once more.
    let next;
    try {
      next = await findWorkingModel(provider, apiKey, { vision, exclude: [use] });
    } catch (e) {
      throw e instanceof ProviderError && e.kind === "nomodel" ? err : e; // nothing else to switch to: show the original reason
    }
    use = next;
    onAuto(slot, use);
    try {
      out = await run(use);
    } catch (e) {
      if (!(e instanceof ProviderError && e.kind === "server")) throw e;
      out = await run(use, { plain: true });
    }
  }
  if (out.refused) return { refusal: true, error: `${p.name} didn't want to help with that one. Try rephrasing what you're going for.` };
  return { result: parseResult(out.text), raw: out.text, model: use };
}

// Connect: check the key AND find a model that really answers (1–2 free requests).
export async function checkFreeKey(provider, apiKey) {
  if (!apiKey) throw new Error("Paste your key first.");
  const model = await findWorkingModel(provider, apiKey);
  return { ok: true, model };
}
