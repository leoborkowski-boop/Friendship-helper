import { STYLES, STYLE_CATEGORIES } from "./styles-data.js";
import { PRESETS, FONTS, COLOR_KEYS, applyTheme, randomTheme, normalizeTheme } from "./themes.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => Math.random().toString(36).slice(2, 10);
const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));
const MAX_STYLES = 6;
// Inside the Android app there is no local server: talk to Claude directly.
const NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());

// ───────────────────────── persisted state ─────────────────────────
const STORE_KEY = "friendship-helper:v1";
const DEFAULTS = {
  theme: PRESETS[0],
  customThemes: [],
  mode: "reply",
  selectedStyles: ["chill", "witty", "wholesome"],
  favStyles: [],
  knobs: { length: "short", emoji: "some", strength: "medium", count: 3 },
  friends: [],
  friendId: "",
  settings: { apiKey: "", effort: "low", myName: "", myVoice: "", language: "" },
  saved: [],
  history: [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...data,
      knobs: { ...DEFAULTS.knobs, ...data.knobs },
      settings: { ...DEFAULTS.settings, ...data.settings },
      theme: normalizeTheme(data.theme || PRESETS[0]),
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
let state = load();
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }, 150);
}

// session-only
let images = []; // {media_type, data, url}
let conversation = null; // turns sent to Claude for refining
let lastResult = null;
let busy = false;

// ───────────────────────── helpers ─────────────────────────
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("on"), 1800);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
function styleLabel(key) {
  if (key.startsWith("custom:")) return { emoji: "✏️", name: key.slice(7), hint: key.slice(7) };
  return STYLE_BY_ID[key] || { emoji: "💬", name: key, hint: "" };
}
function currentFriend() {
  return state.friends.find((f) => f.id === state.friendId) || null;
}

// ───────────────────────── theme ─────────────────────────
function setTheme(t, { persist = true } = {}) {
  state.theme = normalizeTheme(t);
  applyTheme(state.theme);
  syncThemeControls();
  renderThemeGrids();
  if (persist) save();
}

function swatchHTML(t, { deletable = false } = {}) {
  const active = state.theme.name === t.name && state.theme.accent === t.accent && state.theme.bg === t.bg;
  return `<button class="theme-swatch ${active ? "on" : ""}" data-theme-id="${esc(t.id)}" title="${esc(t.name)}">
    <span class="pv" style="background:linear-gradient(140deg, ${t.bg}, ${t.bg2})">
      <i style="background:${t.surface}"></i><i style="background:linear-gradient(90deg, ${t.accent}, ${t.accent2})"></i>
    </span>
    <span class="nm" style="background:${t.surface};color:${t.text};font-family:${FONTS[t.font] || "inherit"}">${esc(t.name)}</span>
    ${deletable ? `<span class="del" data-del-theme="${esc(t.id)}" role="button" aria-label="Delete">✕</span>` : ""}
  </button>`;
}

function renderThemeGrids() {
  $("#themeGrid").innerHTML = PRESETS.map((t) => swatchHTML(t)).join("");
  $("#customThemesWrap").classList.toggle("hidden", state.customThemes.length === 0);
  $("#customThemeGrid").innerHTML = state.customThemes.map((t) => swatchHTML(t, { deletable: true })).join("");
}

function buildThemeControls() {
  $("#colorGrid").innerHTML = COLOR_KEYS.map(
    ([k, label]) => `<label class="color-item"><input type="color" data-color="${k}" /> ${label}</label>`,
  ).join("");
  $("#fontSelect").innerHTML = Object.keys(FONTS)
    .map((f) => `<option value="${esc(f)}" style="font-family:${FONTS[f]}">${esc(f)}</option>`)
    .join("");

  const update = (patch) => setTheme({ ...state.theme, ...patch, id: "custom-live", name: state.theme.name.endsWith("*") ? state.theme.name : state.theme.name + "*" });
  $$("#colorGrid input").forEach((inp) => inp.addEventListener("input", () => update({ [inp.dataset.color]: inp.value })));
  $("#fontSelect").addEventListener("change", (e) => update({ font: e.target.value }));
  $("#scaleInput").addEventListener("input", (e) => update({ scale: +e.target.value }));
  $("#radiusInput").addEventListener("input", (e) => update({ radius: +e.target.value }));
  $("#shadowInput").addEventListener("input", (e) => update({ shadow: +e.target.value }));
  $("#blurInput").addEventListener("input", (e) => update({ blur: +e.target.value }));
  $("#bubbleSelect").addEventListener("change", (e) => update({ shape: e.target.value }));
  $("#densitySelect").addEventListener("change", (e) => update({ density: e.target.value }));
  $("#bgSelect").addEventListener("change", (e) => update({ bgStyle: e.target.value }));
  $("#glassInput").addEventListener("change", (e) => update({ glass: e.target.checked }));
  $("#animInput").addEventListener("change", (e) => update({ animations: e.target.checked }));

  const pickTheme = (e) => {
    const del = e.target.closest("[data-del-theme]");
    if (del) {
      e.stopPropagation();
      state.customThemes = state.customThemes.filter((t) => t.id !== del.dataset.delTheme);
      renderThemeGrids();
      save();
      return;
    }
    const btn = e.target.closest("[data-theme-id]");
    if (!btn) return;
    const id = btn.dataset.themeId;
    const t = PRESETS.find((p) => p.id === id) || state.customThemes.find((p) => p.id === id);
    if (t) setTheme(structuredClone(t));
  };
  $("#themeGrid").addEventListener("click", pickTheme);
  $("#customThemeGrid").addEventListener("click", pickTheme);

  $("#shuffleThemeBtn").addEventListener("click", () => setTheme(randomTheme()));
  $("#saveThemeBtn").addEventListener("click", () => {
    const name = $("#themeNameInput").value.trim() || `My theme ${state.customThemes.length + 1}`;
    const t = { ...state.theme, id: "u-" + uid(), name };
    state.customThemes.push(t);
    $("#themeNameInput").value = "";
    setTheme(t);
    toast(`Saved “${name}”`);
  });
  $("#exportThemeBtn").addEventListener("click", async () => {
    await copyText(JSON.stringify(state.theme));
    toast("Theme code copied — share it!");
  });
  $("#importThemeBtn").addEventListener("click", () => {
    const code = prompt("Paste a theme code:");
    if (!code) return;
    try {
      const t = JSON.parse(code);
      if (typeof t !== "object" || !t.bg || !t.accent) throw new Error();
      setTheme({ ...t, name: t.name || "Imported" });
      toast("Theme imported");
    } catch {
      toast("That theme code didn't work");
    }
  });
}

function syncThemeControls() {
  const t = state.theme;
  $$("#colorGrid input").forEach((inp) => (inp.value = t[inp.dataset.color]));
  $("#fontSelect").value = t.font;
  $("#scaleInput").value = t.scale; $("#scaleOut").textContent = `${t.scale}%`;
  $("#radiusInput").value = t.radius; $("#radiusOut").textContent = `${t.radius}px`;
  $("#shadowInput").value = t.shadow; $("#shadowOut").textContent = ["none", "soft", "medium", "deep"][t.shadow];
  $("#blurInput").value = t.blur; $("#blurOut").textContent = `${t.blur}px`;
  $("#bubbleSelect").value = t.shape;
  $("#densitySelect").value = t.density;
  $("#bgSelect").value = t.bgStyle;
  $("#glassInput").checked = t.glass;
  $("#animInput").checked = t.animations;
}

// ───────────────────────── mode ─────────────────────────
const MODES = {
  reply: { label: "What did they say?", ph: "Paste their message… (or just drop a screenshot below)" },
  rewrite: { label: "What do you want to say?", ph: "Say it however — messy is fine. e.g. “cant come sat sorry but wanna hang next week?”" },
  start: { label: "What's the situation?", ph: "e.g. haven't talked to my friend in months and want to reach out / invite people to my birthday" },
};
function setMode(mode) {
  state.mode = mode;
  $$("#modeTabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#mainLabel").textContent = MODES[mode].label;
  $("#mainInput").placeholder = MODES[mode].ph;
  save();
}

// ───────────────────────── styles ─────────────────────────
function toggleStyle(key) {
  const i = state.selectedStyles.indexOf(key);
  if (i >= 0) state.selectedStyles.splice(i, 1);
  else {
    if (state.selectedStyles.length >= MAX_STYLES) {
      toast(`Max ${MAX_STYLES} styles at once`);
      return;
    }
    state.selectedStyles.push(key);
  }
  save();
  renderSelectedStyles();
  renderStyleGrid();
}

function renderSelectedStyles() {
  const sel = state.selectedStyles;
  $("#selectedStyles").innerHTML = sel.length
    ? sel.map((k) => {
        const s = styleLabel(k);
        return `<button class="chip on" data-remove-style="${esc(k)}">${s.emoji} ${esc(s.name)} <span class="x">✕</span></button>`;
      }).join("")
    : `<span class="empty-chip">No style picked — Claude will choose natural ones.</span>`;

  const defaults = ["chill", "witty", "wholesome", "flirty", "honest", "gen-z", "hype-friend", "pirate", "shakespearean", "haiku"];
  const pool = [...new Set([...state.favStyles, ...defaults])].filter((k) => !sel.includes(k) && STYLE_BY_ID[k]).slice(0, 7);
  $("#quickStyles").innerHTML = pool
    .map((k) => `<button class="chip" data-add-style="${k}">${STYLE_BY_ID[k].emoji} ${esc(STYLE_BY_ID[k].name)}</button>`)
    .join("");
  $("#styleCount").textContent = `· ${sel.length}/${MAX_STYLES} picked`;
}

let activeCat = "All";
function renderCatTabs() {
  const cats = ["All", "⭐ Favorites", ...STYLE_CATEGORIES];
  $("#catTabs").innerHTML = cats
    .map((c) => `<button class="chip ${c === activeCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
}
function renderStyleGrid() {
  const q = $("#styleSearch").value.trim().toLowerCase();
  const favOnly = $("#favOnly").checked || activeCat === "⭐ Favorites";
  const list = STYLES.filter((s) => {
    if (favOnly && !state.favStyles.includes(s.id)) return false;
    if (activeCat !== "All" && activeCat !== "⭐ Favorites" && s.category !== activeCat) return false;
    if (q && !`${s.name} ${s.hint} ${s.category}`.toLowerCase().includes(q)) return false;
    return true;
  });
  $("#styleGrid").innerHTML = list.length
    ? list.map((s) => {
        const on = state.selectedStyles.includes(s.id);
        const fav = state.favStyles.includes(s.id);
        return `<button class="style-card ${on ? "on" : ""}" data-style="${s.id}">
          <span class="fav ${fav ? "on" : ""}" data-fav="${s.id}" role="button" aria-label="Favorite">${fav ? "⭐" : "☆"}</span>
          <span class="em">${s.emoji}</span><span class="nm">${esc(s.name)}</span><span class="ds">${esc(s.hint)}</span>
        </button>`;
      }).join("")
    : `<p class="muted">No styles match. Try another word — or describe your own below.</p>`;
}

function randomStyles() {
  const n = Math.min(state.knobs.count, MAX_STYLES);
  const shuffled = [...STYLES].sort(() => Math.random() - 0.5);
  state.selectedStyles = shuffled.slice(0, n).map((s) => s.id);
  save();
  renderSelectedStyles();
  toast("🎲 " + state.selectedStyles.map((k) => STYLE_BY_ID[k].name).join(" · "));
}

// ───────────────────────── knobs ─────────────────────────
function renderKnobs() {
  $$(".pills").forEach((p) => {
    const knob = p.dataset.knob;
    $$("button", p).forEach((b) => b.classList.toggle("on", b.dataset.v === state.knobs[knob]));
  });
  $("#countInput").value = state.knobs.count;
  $("#countOut").textContent = state.knobs.count;
}

// ───────────────────────── friends ─────────────────────────
function renderFriends() {
  const opts = [`<option value="">🙂 Anyone (no profile)</option>`]
    .concat(state.friends.map((f) => `<option value="${f.id}">${esc(f.emoji)} ${esc(f.name)}${f.rel ? " · " + esc(f.rel) : ""}</option>`))
    .concat([`<option value="__add">➕ Add a friend…</option>`]);
  $("#friendSelect").innerHTML = opts.join("");
  $("#friendSelect").value = state.friends.some((f) => f.id === state.friendId) ? state.friendId : "";

  $("#friendList").innerHTML = state.friends.length
    ? state.friends.map((f) => `<div class="friend-row"><span>${esc(f.emoji)}</span><span class="nm">${esc(f.name)} <span class="rel">${esc(f.rel)}</span></span><button class="ghost-btn small" data-edit-friend="${f.id}">Edit</button></div>`).join("")
    : `<p class="hint">Save friends with notes (inside jokes, how they text) for way better replies.</p>`;
}

let editingFriendId = null;
function openFriendModal(id = null) {
  editingFriendId = id;
  const f = state.friends.find((x) => x.id === id);
  $("#friendModalTitle").textContent = f ? `Edit ${f.name}` : "Add friend";
  $("#friendEmoji").value = f?.emoji || "🙂";
  $("#friendName").value = f?.name || "";
  $("#friendRel").value = f?.rel || "";
  $("#friendNotes").value = f?.notes || "";
  $("#deleteFriendBtn").classList.toggle("hidden", !f);
  $("#friendModal").showModal();
  $("#friendName").focus();
}

// ───────────────────────── images ─────────────────────────
// Downscale screenshots so requests stay small and fast.
async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { media_type: "image/jpeg", data: dataUrl.split(",")[1], url: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  if (!list.length) return;
  if (images.length + list.length > 5) toast("Up to 5 screenshots");
  for (const f of list.slice(0, 5 - images.length)) {
    try { images.push(await fileToImage(f)); } catch { toast("Couldn't read that image"); }
  }
  renderThumbs();
}
function renderThumbs() {
  $("#thumbs").innerHTML = images
    .map((im, i) => `<div class="thumb"><img src="${im.url}" alt="screenshot ${i + 1}" /><button data-rm-img="${i}" aria-label="Remove">✕</button></div>`)
    .join("");
}

// ───────────────────────── prompt building ─────────────────────────
const LENGTH = { tiny: "a few words, max one short line", short: "1–2 short sentences", medium: "2–4 sentences", long: "a longer message, a short paragraph or two" };
const EMOJI = { none: "no emojis at all", some: "a few emojis where natural", lots: "lots of emojis" };
const STRENGTH = { subtle: "subtle — a light touch of the style, still sounds like a normal text", medium: "clearly in the style but still sendable", max: "go ALL IN on the style, fully committed, over the top" };

function buildPrompt(text) {
  const { knobs, settings } = state;
  const friend = currentFriend();
  const styles = state.selectedStyles.map(styleLabel);
  const count = Math.max(knobs.count, styles.length);
  const lines = [];

  if (state.mode === "reply") {
    lines.push("TASK: Help me reply to my friend.");
    if (text) lines.push(`WHAT THEY SAID:\n"""${text}"""`);
    if (images.length) lines.push(`I attached ${images.length} screenshot(s) of the chat — read them and reply to their latest message.`);
  } else if (state.mode === "rewrite") {
    lines.push("TASK: I know what I want to say — help me say it well. Keep my meaning.");
    lines.push(`WHAT I WANT TO SAY:\n"""${text}"""`);
    if (images.length) lines.push(`I attached ${images.length} screenshot(s) of the chat for context.`);
  } else {
    lines.push("TASK: I don't know how to start — write the message I should send.");
    lines.push(`SITUATION:\n"""${text}"""`);
    if (images.length) lines.push(`I attached ${images.length} screenshot(s) for context.`);
  }

  if (friend) {
    lines.push(`WHO IT'S FOR: ${friend.name}${friend.rel ? ` (${friend.rel})` : ""}${friend.notes ? `\nNotes about them: ${friend.notes}` : ""}`);
  }
  const ctx = $("#contextInput").value.trim();
  if (ctx) lines.push(`EXTRA CONTEXT: ${ctx}`);
  if (settings.myName) lines.push(`MY NAME: ${settings.myName}`);
  if (settings.myVoice) lines.push(`HOW I USUALLY TEXT (match my vibe/casing/slang unless a style overrides it):\n${settings.myVoice}`);

  lines.push(`\nGIVE ME EXACTLY ${count} OPTIONS.`);
  if (styles.length) {
    lines.push("STYLES — assign in order, cycling through if there are more options than styles; if a style repeats, make it a different take:");
    styles.forEach((s, i) => lines.push(`${i + 1}. ${s.name}${s.hint && s.hint !== s.name ? ` — ${s.hint}` : ""}`));
  } else {
    lines.push("STYLES: pick varied, natural styles that fit the situation.");
  }
  lines.push(`LENGTH: ${LENGTH[knobs.length]}`);
  lines.push(`EMOJIS: ${EMOJI[knobs.emoji]} (unless the style itself is emoji-based)`);
  lines.push(`STYLE STRENGTH: ${STRENGTH[knobs.strength]}`);
  lines.push(`LANGUAGE: ${settings.language ? `write the messages in ${settings.language}` : "same language as the conversation / my input"}`);
  return lines.join("\n");
}

// ───────────────────────── API ─────────────────────────
async function callClaude(turns) {
  if (NATIVE) {
    const { suggestDirect } = await import("./vendor/claude-direct.js");
    return suggestDirect({ apiKey: state.settings.apiKey, history: turns, effort: state.settings.effort });
  }
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(state.settings.apiKey ? { "x-claude-key": state.settings.apiKey } : {}),
    },
    body: JSON.stringify({ history: turns, effort: state.settings.effort }),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`Server error (${res.status})`); }
  if (!res.ok || data.error) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

const LOADING_LINES = ["Reading the room…", "Decoding the vibes…", "Consulting the group chat…", "Drafting replies…", "Picking the perfect emoji…", "Almost there…"];
function showLoading(on) {
  busy = on;
  $("#goBtn").disabled = on;
  $("#loading").classList.toggle("hidden", !on);
  if (on) {
    $("#emptyState").classList.add("hidden");
    $("#errorBox").classList.add("hidden");
    $("#output").classList.add("hidden");
    if (matchMedia("(max-width: 920px)").matches) $(".results").scrollIntoView({ behavior: "smooth", block: "start" });
    let i = 0;
    $("#loadingText").textContent = LOADING_LINES[0];
    clearInterval(showLoading.timer);
    showLoading.timer = setInterval(() => ($("#loadingText").textContent = LOADING_LINES[++i % LOADING_LINES.length]), 1600);
  } else clearInterval(showLoading.timer);
}
function showError(msg) {
  $("#errorBox").innerHTML = `<b>Hmm.</b> ${esc(msg)}`;
  $("#errorBox").classList.remove("hidden");
  if (!lastResult) $("#emptyState").classList.remove("hidden");
  else $("#output").classList.remove("hidden");
}

async function run(turns, { fresh }) {
  if (busy) return;
  showLoading(true);
  try {
    const data = await callClaude(turns);
    if (data.refusal) throw new Error(data.error);
    conversation = [...turns, { role: "assistant", text: data.raw }];
    lastResult = data.result;
    renderResult(data.result);
    if (fresh) {
      state.history.unshift({
        id: uid(), at: Date.now(), mode: state.mode,
        input: $("#mainInput").value.trim() || (images.length ? "📸 screenshot" : ""),
        friend: currentFriend()?.name || "", result: data.result,
      });
      state.history = state.history.slice(0, 50);
      save();
    }
  } catch (err) {
    showError(err.message || "Something went wrong.");
  } finally {
    showLoading(false);
  }
}

function generate() {
  const text = $("#mainInput").value.trim();
  if (!text && !images.length) {
    $("#mainInput").focus();
    toast(state.mode === "reply" ? "Paste their message or add a screenshot" : "Type something first");
    return;
  }
  const turn = { role: "user", text: buildPrompt(text), images: images.map(({ media_type, data }) => ({ media_type, data })) };
  run([turn], { fresh: true });
}

function refine(instruction) {
  if (!conversation) return;
  const count = Math.max(state.knobs.count, state.selectedStyles.length);
  run([...conversation, { role: "user", text: `${instruction}\nReturn the same JSON format with ${count} options.` }], { fresh: false });
}

// ───────────────────────── render results ─────────────────────────
function renderResult(r) {
  $("#emptyState").classList.add("hidden");
  $("#output").classList.remove("hidden");
  $("#readCard").innerHTML = `<span class="lbl">🔍 The read</span><span>${esc(r.read)}</span>`;
  $("#cards").innerHTML = (r.suggestions || [])
    .map((s, i) => `<article class="card pop" style="animation-delay:${i * 70}ms">
      <div class="card-head"><span class="badge">${esc(s.style)}</span></div>
      <div class="bubble">${esc(s.message)}</div>
      <div class="why">💡 ${esc(s.why)}</div>
      <div class="card-actions">
        <button data-act="copy" data-i="${i}">📋 Copy</button>
        <button data-act="save" data-i="${i}">⭐ Save</button>
        <button data-act="more" data-i="${i}">🔁 More like this</button>
      </div>
    </article>`)
    .join("");
  $("#tipBox").classList.toggle("hidden", !r.tip);
  $("#tipBox").innerHTML = r.tip ? `<b>Tip:</b> ${esc(r.tip)}` : "";
  $("#refineForm").classList.toggle("hidden", !conversation);
  $("#refineChips").classList.toggle("hidden", !conversation);
}

const REFINE_CHIPS = [
  ["✂️ Shorter", "Make them all shorter."],
  ["😂 Funnier", "Make them funnier."],
  ["🥰 Nicer", "Make them warmer and kinder."],
  ["😤 Bolder", "Make them bolder and more confident."],
  ["😌 More chill", "Make them more casual and relaxed."],
  ["🚫 No emojis", "Remove all emojis."],
  ["🎲 Totally different", "Give me completely different options."],
];

// ───────────────────────── library ─────────────────────────
let libTab = "saved";
function renderLibrary() {
  $$("#libTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === libTab));
  const body = $("#libraryBody");
  if (libTab === "saved") {
    body.innerHTML = state.saved.length
      ? state.saved.map((s) => `<div class="lib-item">
          <div class="meta"><span>${esc(s.style)}${s.friend ? " · for " + esc(s.friend) : ""}</span><span>${new Date(s.at).toLocaleDateString()}</span></div>
          <div class="bubble">${esc(s.text)}</div>
          <div class="card-actions"><button data-lib-copy="${s.id}">📋 Copy</button><button data-lib-del="${s.id}">🗑 Remove</button></div>
        </div>`).join("")
      : `<p class="lib-empty">Nothing saved yet.<br/>Hit ⭐ Save on a suggestion you like.</p>`;
  } else {
    body.innerHTML = state.history.length
      ? state.history.map((h) => `<div class="lib-item">
          <div class="meta"><span>${{ reply: "💬", rewrite: "✍️", start: "🤷" }[h.mode] || ""} ${h.friend ? "for " + esc(h.friend) : ""}</span><span>${new Date(h.at).toLocaleString()}</span></div>
          <div class="txt">${esc((h.input || "").slice(0, 140))}${(h.input || "").length > 140 ? "…" : ""}</div>
          <div class="card-actions"><button data-hist-open="${h.id}">👀 Show</button><button data-hist-del="${h.id}">🗑</button></div>
        </div>`).join("") + `<button class="link-btn danger" id="clearHistBtn">Clear history</button>`
      : `<p class="lib-empty">Your past requests will show up here.</p>`;
  }
}

// ───────────────────────── drawers ─────────────────────────
function openDrawer(name) {
  closeDrawers();
  $(`#${name}Drawer`).classList.add("open");
  $("#scrim").classList.add("on");
  if (name === "library") renderLibrary();
  if (name === "settings") checkStatus();
}
function closeDrawers() {
  $$(".drawer").forEach((d) => d.classList.remove("open"));
  $("#scrim").classList.remove("on");
}

async function checkStatus() {
  const line = $("#statusLine");
  if (NATIVE) {
    line.textContent = state.settings.apiKey
      ? "✅ Key saved on this phone — talking straight to Claude"
      : "🔑 Paste your Claude API key below to get started";
    return;
  }
  try {
    const s = await (await fetch("/api/status")).json();
    if (state.settings.apiKey) line.textContent = `✅ Using the key saved in this browser · ${s.model}`;
    else if (s.serverHasKey) line.textContent = `✅ Server has a Claude key · ${s.model}`;
    else line.textContent = `🔑 Paste your Claude API key below (or a signed-in ant CLI profile works too) · ${s.model}`;
  } catch {
    line.textContent = "⚠️ Can't reach the server — is `npm start` running?";
  }
}

// ───────────────────────── wire up ─────────────────────────
function init() {
  applyTheme(state.theme);
  buildThemeControls();
  syncThemeControls();
  renderThemeGrids();
  setMode(state.mode);
  renderSelectedStyles();
  renderCatTabs();
  renderStyleGrid();
  renderKnobs();
  renderFriends();

  $("#refineChips").innerHTML = REFINE_CHIPS.map(([l], i) => `<button class="chip" data-refine="${i}">${l}</button>`).join("");
  const EXAMPLES = [
    ["reply", "💬", "sorry i've been so quiet lately, life's been a lot"],
    ["rewrite", "✍️", "can't make the party sat but wanna hang next week?"],
    ["start", "🤷", "ask my friend to go to a concert with me"],
    ["reply", "💬", "u up? (they sent this at 2am)"],
  ];
  $("#examples").innerHTML = EXAMPLES.map(([, icon, t], i) => `<li><button data-example="${i}">${icon} ${esc(t)}</button></li>`).join("");
  $("#examples").addEventListener("click", (e) => {
    const b = e.target.closest("[data-example]");
    if (!b) return;
    const [m, , t] = EXAMPLES[+b.dataset.example];
    setMode(m);
    $("#mainInput").value = t;
    $("#mainInput").focus();
  });

  // mode tabs
  $("#modeTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.dataset.mode);
  });

  // images
  const dz = $("#dropzone");
  dz.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm-img]");
    if (rm) {
      images.splice(+rm.dataset.rmImg, 1);
      renderThumbs();
      return;
    }
    if (!e.target.closest(".thumb")) $("#fileInput").click();
  });
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#fileInput").click(); } });
  $("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); toast("📸 Screenshot added"); }
  });

  // styles
  $("#selectedStyles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove-style]");
    if (b) toggleStyle(b.dataset.removeStyle);
  });
  $("#quickStyles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add-style]");
    if (b) toggleStyle(b.dataset.addStyle);
  });
  $("#openStylesBtn").addEventListener("click", () => { renderStyleGrid(); $("#stylesModal").showModal(); $("#styleSearch").focus(); });
  $("#randomStyleBtn").addEventListener("click", randomStyles);
  $("#styleSearch").addEventListener("input", renderStyleGrid);
  $("#favOnly").addEventListener("change", renderStyleGrid);
  $("#catTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    activeCat = b.dataset.cat;
    renderCatTabs();
    renderStyleGrid();
  });
  $("#styleGrid").addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      const id = fav.dataset.fav;
      state.favStyles = state.favStyles.includes(id) ? state.favStyles.filter((x) => x !== id) : [...state.favStyles, id];
      save();
      renderStyleGrid();
      renderSelectedStyles();
      return;
    }
    const card = e.target.closest("[data-style]");
    if (card) toggleStyle(card.dataset.style);
  });
  const addCustom = () => {
    const v = $("#customStyleInput").value.trim();
    if (!v) return;
    toggleStyle("custom:" + v.slice(0, 120));
    $("#customStyleInput").value = "";
  };
  $("#addCustomStyleBtn").addEventListener("click", addCustom);
  $("#customStyleInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
  $("#clearStylesBtn").addEventListener("click", () => { state.selectedStyles = []; save(); renderSelectedStyles(); renderStyleGrid(); });
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  // knobs
  $(".knobs").addEventListener("click", (e) => {
    const b = e.target.closest(".pills button");
    if (!b) return;
    state.knobs[b.closest(".pills").dataset.knob] = b.dataset.v;
    save();
    renderKnobs();
  });
  $("#countInput").addEventListener("input", (e) => { state.knobs.count = +e.target.value; save(); renderKnobs(); });

  // friends
  $("#friendSelect").addEventListener("change", (e) => {
    if (e.target.value === "__add") { e.target.value = state.friendId || ""; openFriendModal(); return; }
    state.friendId = e.target.value;
    save();
  });
  $("#editFriendBtn").addEventListener("click", () => (state.friendId ? openFriendModal(state.friendId) : openDrawer("settings")));
  $("#addFriendBtn").addEventListener("click", () => openFriendModal());
  $("#friendList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit-friend]");
    if (b) openFriendModal(b.dataset.editFriend);
  });
  $("#friendForm").addEventListener("submit", (e) => {
    if (e.submitter?.value !== "save") return;
    const data = {
      emoji: $("#friendEmoji").value.trim() || "🙂",
      name: $("#friendName").value.trim(),
      rel: $("#friendRel").value.trim(),
      notes: $("#friendNotes").value.trim(),
    };
    if (!data.name) return;
    if (editingFriendId) Object.assign(state.friends.find((f) => f.id === editingFriendId), data);
    else {
      const f = { id: uid(), ...data };
      state.friends.push(f);
      state.friendId = f.id;
    }
    save();
    renderFriends();
  });
  $("#deleteFriendBtn").addEventListener("click", () => {
    state.friends = state.friends.filter((f) => f.id !== editingFriendId);
    if (state.friendId === editingFriendId) state.friendId = "";
    save();
    renderFriends();
    $("#friendModal").close();
  });

  // generate
  $("#goBtn").addEventListener("click", generate);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); generate(); }
    if (e.key === "Escape") closeDrawers();
  });

  // results actions
  $("#cards").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || !lastResult) return;
    const s = lastResult.suggestions[+b.dataset.i];
    if (b.dataset.act === "copy") {
      await copyText(s.message);
      b.textContent = "✅ Copied";
      b.classList.add("done");
      setTimeout(() => { b.textContent = "📋 Copy"; b.classList.remove("done"); }, 1400);
    } else if (b.dataset.act === "save") {
      state.saved.unshift({ id: uid(), at: Date.now(), text: s.message, style: s.style, friend: currentFriend()?.name || "" });
      save();
      b.textContent = "⭐ Saved";
      b.classList.add("done");
    } else if (b.dataset.act === "more") {
      refine(`I like this one (${s.style}): "${s.message}". Give me fresh variations in that same style and spirit.`);
    }
  });
  $("#refineChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-refine]");
    if (b) refine(REFINE_CHIPS[+b.dataset.refine][1]);
  });
  $("#refineForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#refineInput").value.trim();
    if (!v) return;
    $("#refineInput").value = "";
    refine(v);
  });
  $("#newChatBtn").addEventListener("click", () => {
    conversation = null;
    lastResult = null;
    images = [];
    renderThumbs();
    $("#mainInput").value = "";
    $("#contextInput").value = "";
    $("#output").classList.add("hidden");
    $("#errorBox").classList.add("hidden");
    $("#emptyState").classList.remove("hidden");
    $("#mainInput").focus();
  });

  // drawers
  $$("[data-open]").forEach((b) => b.addEventListener("click", () => openDrawer(b.dataset.open)));
  $$("[data-close-drawer]").forEach((b) => b.addEventListener("click", closeDrawers));
  $("#scrim").addEventListener("click", closeDrawers);

  // library
  $("#libTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) { libTab = b.dataset.tab; renderLibrary(); }
  });
  $("#libraryBody").addEventListener("click", async (e) => {
    const t = e.target;
    if (t.dataset.libCopy) { await copyText(state.saved.find((s) => s.id === t.dataset.libCopy).text); toast("Copied"); }
    if (t.dataset.libDel) { state.saved = state.saved.filter((s) => s.id !== t.dataset.libDel); save(); renderLibrary(); }
    if (t.dataset.histDel) { state.history = state.history.filter((h) => h.id !== t.dataset.histDel); save(); renderLibrary(); }
    if (t.dataset.histOpen) {
      const h = state.history.find((x) => x.id === t.dataset.histOpen);
      conversation = null;
      lastResult = h.result;
      renderResult(h.result);
      $("#errorBox").classList.add("hidden");
      closeDrawers();
    }
    if (t.id === "clearHistBtn" && confirm("Clear all history?")) { state.history = []; save(); renderLibrary(); }
  });

  // settings
  const st = state.settings;
  $("#apiKeyInput").value = st.apiKey;
  $("#effortSelect").value = st.effort;
  $("#myNameInput").value = st.myName;
  $("#myVoiceInput").value = st.myVoice;
  $("#languageInput").value = st.language;
  const bindSetting = (sel, key, ev = "input") => $(sel).addEventListener(ev, (e) => { st[key] = e.target.value.trim(); save(); if (key === "apiKey") checkStatus(); });
  bindSetting("#apiKeyInput", "apiKey", "change");
  bindSetting("#effortSelect", "effort", "change");
  bindSetting("#myNameInput", "myName");
  bindSetting("#myVoiceInput", "myVoice");
  bindSetting("#languageInput", "language");
  $("#toggleKeyBtn").addEventListener("click", () => {
    const i = $("#apiKeyInput");
    i.type = i.type === "password" ? "text" : "password";
  });

  $("#exportAllBtn").addEventListener("click", () => {
    const { settings, ...rest } = state;
    const data = { ...rest, settings: { ...settings, apiKey: "" } }; // never export the key
    if (NATIVE) {
      copyText(JSON.stringify(data)).then(() => toast("Backup copied — paste it somewhere safe"));
      return;
    }
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })),
      download: "friendship-helper-backup.json",
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importAllBtn").addEventListener("click", () => {
    if (!NATIVE) return $("#importFile").click();
    const text = prompt("Paste your backup:");
    if (text) restoreBackup(text);
  });
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) restoreBackup(await file.text());
  });
  function restoreBackup(text) {
    try {
      const data = JSON.parse(text);
      const key = state.settings.apiKey;
      state = { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...data.settings, apiKey: key }, theme: normalizeTheme(data.theme || PRESETS[0]) };
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      location.reload();
    } catch {
      toast("That backup didn't work");
    }
  }
  $("#resetAllBtn").addEventListener("click", () => {
    if (!confirm("Reset everything? Friends, saved messages, themes and settings will be deleted.")) return;
    try { localStorage.removeItem(STORE_KEY); } catch {}
    location.reload();
  });

  if (NATIVE) {
    document.documentElement.classList.add("native");
    $("#keyHint").textContent = "Stored only on this phone and sent only to Claude (api.anthropic.com). Get a key at console.anthropic.com.";
    $("#apiKeyInput").placeholder = "sk-ant-…";
    if (!state.settings.apiKey) setTimeout(() => { openDrawer("settings"); toast("👋 Add your Claude API key to start"); }, 400);
    // Android back button: close whatever is open before leaving the app.
    const AppPlugin = window.Capacitor?.Plugins?.App;
    AppPlugin?.addListener("backButton", () => {
      const dialog = $("dialog[open]");
      if (dialog) return dialog.close();
      if ($(".drawer.open")) return closeDrawers();
      AppPlugin.minimizeApp();
    });
  }
  checkStatus();
}

init();
