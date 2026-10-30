"use strict";
// ─── the brand ─────────────────────────────────────────────────────────────
// What a film takes from the product: its name, colours, typefaces, logo
// captures, screens and store pages, read from a brandkit folder
// (`brandkit <url> --out <dir>` writes <dir>/brand.json and the pictures next
// to it). Paths in brand.json are relative to its folder.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { onPath } = require("./chrome");

// ─── colour ────────────────────────────────────────────────────────────────
const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => rgb(hex).reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * lin(v), 0);
const saturation = (hex) => {
  const c = rgb(hex);
  const hi = Math.max(...c);
  return hi ? (hi - Math.min(...c)) / hi : 0;
};
const hue = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const hi = Math.max(r, g, b);
  const d = hi - Math.min(r, g, b);
  if (!d) return 0;
  const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const normHex = (v) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v || "").trim()) || /^#?([0-9a-f]{3})$/i.exec(String(v || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
};

// The commands that may run brandkit, in the order they are tried: the one
// given (a command, or the path of brandkit's script), else
// LAUNCH_FILM_BRANDKIT, else a brandkit installed on PATH, else brandkit
// from npm through npx, then from its GitHub repository when npm cannot
// give it. On npm it is @eminbudak/brandkit; its command is still brandkit.
function brandkitCommands(given = "") {
  const raw = String(given || process.env.LAUNCH_FILM_BRANDKIT || "").trim();
  if (raw) {
    if (/\.(c?js|mjs)$/i.test(raw) && fs.existsSync(raw)) return [[process.execPath, raw]];
    return [raw.split(" ").filter(Boolean)];
  }
  const installed = onPath(process.platform === "win32" ? "brandkit.cmd" : "brandkit");
  if (installed) return [[installed]];
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  return [[npx, "-y", "@eminbudak/brandkit"], [npx, "-y", "github:EminBudak/brandkit"]];
}

const HOW = "Install brandkit (npm install -g @eminbudak/brandkit), or point LAUNCH_FILM_BRANDKIT (or --brandkit) at its scripts/brandkit.js, or give a kit you already have with --brand.";

// Runs brandkit for a URL into a folder. Resolves the path of brand.json.
// The next command is tried only when npx could not fetch brandkit; when
// brandkit itself ran and failed, running it again would fail the same way.
async function runBrandkit(url, dir, { log = () => {}, command = "" } = {}) {
  const commands = brandkitCommands(command);
  for (const [i, cmd] of commands.entries()) {
    try {
      return await runOnce(cmd, url, dir, log);
    } catch (err) {
      if (!err.unfetched || i === commands.length - 1) throw err;
      log(`${err.message.split(". ")[0]}; trying ${commands[i + 1].join(" ")}\n`);
    }
  }
}

function runOnce([cmd, ...pre], url, dir, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...pre, url, "--out", dir], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out = (out + d).slice(-3000);
      log(String(d));
    });
    child.stderr.on("data", (d) => {
      out = (out + d).slice(-3000);
      log(String(d));
    });
    child.on("error", (e) => reject(new Error(`brandkit could not be started (${e.message}). ${HOW}`)));
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(path.join(dir, "brand.json"))) return resolve(path.join(dir, "brand.json"));
      const said = out.trim().split("\n").filter(Boolean).slice(-2).join(" ");
      // npm's own error lines mean npx could not fetch brandkit (no such
      // package, no network) before it ran; brandkit never prints them.
      const npm = /^npm (?:error|ERR!) code \S+/m.exec(out) || /^npm (?:error|ERR!) .+/m.exec(out);
      if (npm) reject(Object.assign(new Error(`brandkit could not be fetched (${npm[0].trim()}). ${HOW}`), { unfetched: true }));
      else if (/bot check/i.test(out)) reject(new Error(`${said} The brand could not be read: ask for the logo file and the main colors, or give a kit with --brand.`));
      else reject(new Error(`brandkit failed (exit ${code})${said ? `: ${said}` : ""}`));
    });
  });
}

// A family as Google Fonts names it: "Inter Variable", "InterVariable" and
// a framework's hashed "__Inter_d65c78" are all Inter.
function familyName(raw) {
  let f = String(raw || "").split(",")[0].replace(/["']/g, "").trim();
  const hashed = /^__([A-Za-z0-9_]+?)(?:_Fallback)?_[0-9a-f]{5,}$/.exec(f);
  if (hashed) f = hashed[1].replace(/_/g, " ");
  f = f.replace(/\s*(Variable|VF|var)$/i, "").replace(/([a-z])Variable$/, "$1").trim();
  return /^[A-Za-z0-9 ]{2,60}$/.test(f) ? f : "";
}

// brandkit's "text" in the shape words.js gives: the page's title,
// description and headings in order.
function wordsOf(text) {
  if (!text || typeof text !== "object") return null;
  const headings = (Array.isArray(text.headings) ? text.headings : [])
    .map((h) => ({ level: Number(String((h && (h.tag || h.level)) || "").replace(/\D/g, "")) || 2, text: String((h && h.text) || "").replace(/\s+/g, " ").trim(), after: String((h && h.after) || "") }))
    .filter((h) => h.text);
  return { title: String(text.title || ""), description: String(text.description || ""), headings, ctas: Array.isArray(text.ctas) ? text.ctas.map(String) : [], paragraphs: [], jsonld: [] };
}

// brand.json read and put in the shape the film uses. Files that are
// missing are left out with a note.
function readBrand(file) {
  const dir = path.dirname(path.resolve(file));
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const notes = [];
  const fileOf = (rel) => {
    if (!rel || typeof rel !== "string") return null;
    const abs = path.resolve(dir, rel);
    if (!fs.existsSync(abs)) {
      notes.push(`${rel} is listed in brand.json but missing`);
      return null;
    }
    return abs;
  };
  let host = "";
  try {
    host = new URL(raw.url).hostname.replace(/^www\./, "");
  } catch {
    // No address.
  }
  const colors = (Array.isArray(raw.colors) ? raw.colors : [])
    .map((c) => ({ hex: normHex(c && c.hex), role: String((c && c.role) || "") }))
    .filter((c) => c.hex);
  const surface = (colors.find((c) => c.role === "surface") || {}).hex || null;
  const vivid = colors.filter((c) => saturation(c.hex) > 0.3 && luminance(c.hex) > 0.03 && luminance(c.hex) < 0.9);
  // The accent is the button's colour when it has one; else the first
  // colourful one.
  const accent = (vivid.find((c) => c.role === "button") || vivid.find((c) => c.role === "logo") || vivid.find((c) => c.role === "link") || vivid[0] || {}).hex || null;
  const accent2 = (vivid.find((c) => c.hex !== accent && accent && Math.abs(hue(c.hex) - hue(accent)) > 25) || {}).hex || null;
  const dark = colors.filter((c) => luminance(c.hex) < 0.04).map((c) => c.hex);
  const fonts = raw.fonts && typeof raw.fonts === "object" ? raw.fonts : {};
  const logos = (Array.isArray(raw.logos) ? raw.logos : [])
    .map((l) => ({ file: fileOf(l && l.file), where: String((l && l.where) || ""), kind: String((l && l.kind) || ""), background: normHex(l && l.background), alt: String((l && l.alt) || "") }))
    .filter((l) => l.file);
  const screens = (Array.isArray(raw.screenshots) ? raw.screenshots : [])
    .map((s) => ({ file: fileOf(s && s.file), width: Number(s && s.width) || 0, height: Number(s && s.height) || 0 }))
    .filter((s) => s.file);
  const stores = (Array.isArray(raw.stores) ? raw.stores : []).filter((s) => s && s.ok !== false).map((s) => ({
    type: String(s.type || ""),
    url: String(s.url || ""),
    name: String(s.name || ""),
    by: String(s.by || ""),
    description: String(s.description || ""),
    // A listing names the maker's own site.
    site: String(s.site || ""),
    assets: (Array.isArray(s.assets) ? s.assets : []).map((a) => ({ file: fileOf(a && a.file), kind: String((a && a.kind) || ""), width: Number(a && a.width) || 0, height: Number(a && a.height) || 0 })).filter((a) => a.file),
  }));
  const appStores = stores.filter((s) => /appstore|googleplay|play/i.test(s.type));
  const phoneScreens = appStores.flatMap((s) => s.assets.filter((a) => /screen/i.test(a.kind) && a.height > a.width));
  const appIcon = appStores.flatMap((s) => s.assets.filter((a) => /icon/i.test(a.kind)))[0] || null;
  const rated = (Array.isArray(raw.stores) ? raw.stores : []).find((st) => st && /appstore|googleplay|play/i.test(String(st.type)) && Number(st.rating) > 0);
  // What the brand says about itself on its profiles: often its tagline.
  const profiles = (Array.isArray(raw.stores) ? raw.stores : []).filter((st) => st && st.ok !== false && !/appstore|googleplay|play/i.test(String(st.type)))
    .map((st) => String(st.description || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return {
    dir,
    url: String(raw.url || ""),
    host,
    name: String(raw.name || (appStores[0] && appStores[0].name) || host || "").trim(),
    colors,
    accent,
    accent2,
    surface,
    darkSite: surface ? luminance(surface) < 0.2 : null,
    darkColour: dark[0] || null,
    headingFont: familyName(fonts.heading),
    bodyFont: familyName(fonts.body),
    logos,
    screens,
    phoneScreens,
    appIcon,
    stores: appStores,
    description: (appStores.find((s) => s.description) || {}).description || "",
    profiles,
    rating: rated ? { score: Number(rated.rating), count: Number(rated.ratings) || 0, store: String(rated.type) } : null,
    links: Array.isArray(raw.links) ? raw.links : [],
    // Set when the film is for an app given by its store page.
    app: raw.app && typeof raw.app === "object" ? { name: String(raw.app.name || ""), by: String(raw.app.by || ""), site: String(raw.app.site || "") } : null,
    text: wordsOf(raw.text),
    notes,
  };
}

// The look that suits a brand when none is asked for: a dark site gets the
// dark launch stage (aurora when its colours are vivid and cool), a serif
// headline the journal page, a consumer app with a vivid colour the pop
// fields, and a light site the Swiss grid.
const SERIFS = /serif|playfair|fraunces|lora|merriweather|georgia|times|garamond|baskerville|bodoni|caslon|crimson|spectral|newsreader|cormorant|libre caslon|tiempos|freight|domine|literata/i;
function pickLook(brand) {
  const font = `${brand.headingFont} ${brand.bodyFont}`;
  if (SERIFS.test(brand.headingFont) && !/sans/i.test(brand.headingFont)) return "journal";
  const vivid = brand.accent && saturation(brand.accent) > 0.55;
  if (brand.darkSite) {
    const h = brand.accent ? hue(brand.accent) : 0;
    return vivid && h >= 250 && h <= 330 ? "aurora" : "launch";
  }
  if (brand.stores.length && vivid && luminance(brand.accent) > 0.08) return "pop";
  if (brand.darkSite === null && /mono/i.test(font)) return "launch";
  return "gridline";
}

module.exports = { runBrandkit, brandkitCommands, readBrand, pickLook, familyName, luminance, saturation, hue, normHex };
