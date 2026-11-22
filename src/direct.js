// Entry point bundled into public/vendor/claude-direct.js for the Android app.
// The phone has no server, so it calls the Claude API directly with the
// key the user typed into Settings (stored only on the device).
import Anthropic from "@anthropic-ai/sdk";
import { suggest, checkKey, friendlyError, DEFAULT_MODEL } from "./suggest.js";

export const MODEL = DEFAULT_MODEL;

export async function suggestDirect({ apiKey, history, effort }) {
  if (!apiKey) throw new Error("Add your Claude API key in ⚙️ Settings → Claude connection first.");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    return await suggest(client, { history, effort });
  } catch (err) {
    console.error(err);
    throw new Error(friendlyError(err).message);
  }
}

export async function checkKeyDirect(apiKey) {
  if (!apiKey) throw new Error("Paste your key first.");
  try {
    return await checkKey(new Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
  } catch (err) {
    throw new Error(friendlyError(err).message);
  }
}
