// Theme presets + the engine that applies a theme to the page.

export const FONTS = {
  "System": `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  "Inter": `"Inter", system-ui, sans-serif`,
  "Poppins": `"Poppins", system-ui, sans-serif`,
  "Outfit": `"Outfit", system-ui, sans-serif`,
  "Nunito": `"Nunito", system-ui, sans-serif`,
  "Quicksand": `"Quicksand", system-ui, sans-serif`,
  "Fredoka": `"Fredoka", system-ui, sans-serif`,
  "Space Grotesk": `"Space Grotesk", system-ui, sans-serif`,
  "Playfair Display": `"Playfair Display", Georgia, serif`,
  "JetBrains Mono": `"JetBrains Mono", ui-monospace, monospace`,
  "Comic Neue": `"Comic Neue", "Comic Sans MS", cursive`,
};

export const COLOR_KEYS = [
  ["bg", "Background"],
  ["bg2", "Background 2"],
  ["surface", "Panels"],
  ["surface2", "Inputs"],
  ["text", "Text"],
  ["muted", "Soft text"],
  ["accent", "Accent"],
  ["accent2", "Accent 2"],
  ["border", "Borders"],
  ["bubble", "Message bubble"],
];

const base = {
  font: "Inter", scale: 100, radius: 16, shape: "rounded", density: "cozy",
  shadow: 2, bgStyle: "mesh", glass: true, blur: 16, animations: true,
};

export const PRESETS = [
  { ...base, id: "midnight", name: "Midnight", bg: "#0d0f1a", bg2: "#1b1446", surface: "#161a2b", surface2: "#1f2438", text: "#eef0ff", muted: "#9aa0c3", accent: "#8b7bff", accent2: "#ff7bd5", border: "#2b3150", bubble: "#2a2f63" },
  { ...base, id: "daylight", name: "Daylight", bg: "#f4f6fb", bg2: "#dfe8ff", surface: "#ffffff", surface2: "#f1f4fa", text: "#141824", muted: "#5d667d", accent: "#3a6df0", accent2: "#00b3a4", border: "#dde3ee", bubble: "#e6eeff", bgStyle: "gradient", glass: false, shadow: 1 },
  { ...base, id: "bubblegum", name: "Bubblegum", bg: "#fff0f6", bg2: "#ffd6ec", surface: "#ffffff", surface2: "#fff3f9", text: "#3a1030", muted: "#9b5b85", accent: "#ff4fa3", accent2: "#a66bff", border: "#ffd3ea", bubble: "#ffe0f0", font: "Fredoka", radius: 22, bgStyle: "dots" },
  { ...base, id: "ocean", name: "Ocean", bg: "#04141f", bg2: "#063a4f", surface: "#0a2231", surface2: "#0f2e40", text: "#e3f6ff", muted: "#83aec2", accent: "#22d3ee", accent2: "#3b82f6", border: "#16405a", bubble: "#0e4a63", font: "Outfit", bgStyle: "animated" },
  { ...base, id: "forest", name: "Forest", bg: "#0c1510", bg2: "#173222", surface: "#132219", surface2: "#1a2d21", text: "#e8f5ea", muted: "#93b39b", accent: "#4ade80", accent2: "#facc15", border: "#24402e", bubble: "#1f4a30", font: "Nunito", bgStyle: "gradient" },
  { ...base, id: "sunset", name: "Sunset", bg: "#1a0b14", bg2: "#4a1530", surface: "#24101b", surface2: "#311624", text: "#fff0e8", muted: "#d19aa8", accent: "#ff8a4c", accent2: "#ff3d7f", border: "#4a2131", bubble: "#5a1f36", font: "Poppins", bgStyle: "animated" },
  { ...base, id: "neon", name: "Cyber Neon", bg: "#05050a", bg2: "#10051f", surface: "#0b0b14", surface2: "#13131f", text: "#e9fbff", muted: "#7f8aa8", accent: "#00f0ff", accent2: "#ff00c8", border: "#232340", bubble: "#141436", font: "Space Grotesk", radius: 6, shape: "sharp", bgStyle: "grid", shadow: 3 },
  { ...base, id: "lavender", name: "Lavender", bg: "#f6f3ff", bg2: "#e7ddff", surface: "#ffffff", surface2: "#f6f2ff", text: "#251a45", muted: "#7a6da3", accent: "#7c5cff", accent2: "#ff8fb1", border: "#e4dcfa", bubble: "#ece5ff", font: "Quicksand", bgStyle: "mesh" },
  { ...base, id: "coffee", name: "Coffee", bg: "#1b1410", bg2: "#2e2018", surface: "#241a14", surface2: "#2e221a", text: "#f6ece2", muted: "#bba08a", accent: "#d9a066", accent2: "#a8d39e", border: "#3e2f24", bubble: "#45301f", font: "Playfair Display", bgStyle: "solid", glass: false },
  { ...base, id: "mono", name: "Mono", bg: "#ffffff", bg2: "#f0f0f0", surface: "#ffffff", surface2: "#f5f5f5", text: "#0a0a0a", muted: "#6b6b6b", accent: "#0a0a0a", accent2: "#6b6b6b", border: "#e2e2e2", bubble: "#f0f0f0", radius: 4, shape: "sharp", bgStyle: "solid", glass: false, shadow: 0, font: "Space Grotesk" },
  { ...base, id: "terminal", name: "Terminal", bg: "#000000", bg2: "#001a00", surface: "#030b03", surface2: "#061206", text: "#33ff66", muted: "#1fa344", accent: "#33ff66", accent2: "#ffcc00", border: "#0f3d18", bubble: "#062b0f", font: "JetBrains Mono", radius: 0, shape: "sharp", bgStyle: "stripes", glass: false, shadow: 0 },
  { ...base, id: "candy", name: "Candy", bg: "#fffbea", bg2: "#d9f7ff", surface: "#ffffff", surface2: "#fff8e6", text: "#2b2140", muted: "#7d6f96", accent: "#ff6b6b", accent2: "#4ecdc4", border: "#f3e6c4", bubble: "#e0f7f5", font: "Fredoka", radius: 26, shape: "pill", bgStyle: "animated" },
  { ...base, id: "aurora", name: "Aurora", bg: "#060a1a", bg2: "#0b2a3a", surface: "#0e1428", surface2: "#151d36", text: "#effaff", muted: "#93a8c9", accent: "#5eead4", accent2: "#c084fc", border: "#243256", bubble: "#1a2f52", font: "Outfit", bgStyle: "mesh", blur: 24 },
  { ...base, id: "comic", name: "Comic", bg: "#fff7d6", bg2: "#ffe08a", surface: "#ffffff", surface2: "#fffbe8", text: "#111111", muted: "#555555", accent: "#ff3b30", accent2: "#007aff", border: "#111111", bubble: "#fff1b8", font: "Comic Neue", radius: 10, shape: "tail", bgStyle: "dots", glass: false, shadow: 3 },
  { ...base, id: "contrast", name: "High Contrast", bg: "#000000", bg2: "#000000", surface: "#000000", surface2: "#111111", text: "#ffffff", muted: "#e0e0e0", accent: "#ffe600", accent2: "#00e5ff", border: "#ffffff", bubble: "#1a1a1a", font: "System", scale: 110, bgStyle: "solid", glass: false, shadow: 0 },
  { ...base, id: "rose", name: "Rosé", bg: "#1a1215", bg2: "#2b1a22", surface: "#22171c", surface2: "#2c1e25", text: "#fbeef2", muted: "#c49aa8", accent: "#f4a6b8", accent2: "#e8c07d", border: "#3d2a32", bubble: "#432b35", font: "Playfair Display", radius: 20, bgStyle: "mesh" },
];

// ── color helpers ──
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function readableOn(hex) {
  return luminance(hex) > 0.45 ? "#0b0b0f" : "#ffffff";
}

const SHADOWS = [
  "none",
  "0 1px 2px rgb(0 0 0 / .08), 0 2px 8px rgb(0 0 0 / .06)",
  "0 4px 12px rgb(0 0 0 / .12), 0 12px 32px rgb(0 0 0 / .14)",
  "0 8px 24px rgb(0 0 0 / .25), 0 24px 60px rgb(0 0 0 / .3)",
];
const DENSITY = { compact: 0.75, cozy: 1, roomy: 1.3 };

export function applyTheme(t) {
  const root = document.documentElement;
  const s = root.style;
  for (const [k] of COLOR_KEYS) s.setProperty(`--${k}`, t[k]);
  s.setProperty("--on-accent", readableOn(t.accent));
  s.setProperty("--on-bubble", readableOn(t.bubble));
  s.setProperty("--font", FONTS[t.font] || FONTS.System);
  s.setProperty("--scale", String((t.scale || 100) / 100));
  s.setProperty("--radius", `${t.radius}px`);
  s.setProperty("--shadow", SHADOWS[t.shadow] ?? SHADOWS[2]);
  s.setProperty("--space", String(DENSITY[t.density] ?? 1));
  s.setProperty("--blur", `${t.glass ? t.blur : 0}px`);
  s.setProperty("--panel-alpha", t.glass ? "72%" : "100%");
  root.dataset.bg = t.bgStyle;
  root.dataset.shape = t.shape;
  root.dataset.anim = t.animations ? "on" : "off";
  root.style.colorScheme = luminance(t.bg) > 0.4 ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
}

function randHex() {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

// A random theme that is still readable.
export function randomTheme() {
  const dark = Math.random() < 0.6;
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 90 + Math.floor(Math.random() * 120)) % 360;
  const fonts = Object.keys(FONTS);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    ...base,
    id: "shuffle",
    name: "Shuffled",
    bg: dark ? hsl(h, 35, 7) : hsl(h, 60, 96),
    bg2: dark ? hsl(h2, 45, 16) : hsl(h2, 70, 88),
    surface: dark ? hsl(h, 30, 11) : "#ffffff",
    surface2: dark ? hsl(h, 28, 15) : hsl(h, 50, 97),
    text: dark ? hsl(h, 30, 94) : hsl(h, 40, 12),
    muted: dark ? hsl(h, 18, 65) : hsl(h, 15, 42),
    accent: hsl(h, 85, dark ? 66 : 52),
    accent2: hsl(h2, 85, dark ? 66 : 55),
    border: dark ? hsl(h, 25, 20) : hsl(h, 35, 88),
    bubble: dark ? hsl(h, 40, 22) : hsl(h, 80, 92),
    font: pick(fonts),
    radius: pick([0, 6, 12, 16, 22, 28]),
    shape: pick(["rounded", "pill", "sharp", "tail"]),
    bgStyle: pick(["gradient", "animated", "mesh", "dots", "grid", "stripes"]),
    glass: Math.random() < 0.6,
    shadow: pick([1, 2, 3]),
    density: pick(["compact", "cozy", "roomy"]),
    _seed: randHex(),
  };
}

export function normalizeTheme(t) {
  const out = { ...base, ...PRESETS[0], ...t };
  delete out._seed;
  return out;
}
