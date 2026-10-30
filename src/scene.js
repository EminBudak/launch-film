"use strict";
// ─── scenes ────────────────────────────────────────────────────────────────
// A scene is a small JSON object: a type, its words and its items. This
// module checks one and gets its typefaces; motion.js draws it. Every letter
// on the screen comes from the JSON, exactly as written: no model draws text.
//
// Words between asterisks (*like this*) are the marked words: the look's
// accent colour.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { LOOKS } = require("./motion");
const { loadFont } = require("./fonts");

// ─── icons ─────────────────────────────────────────────────────────────────
// Phosphor Icons (MIT): name → { fill, bold } SVG bodies on a 256 grid.
let ICONS = null;
function icons() {
  if (!ICONS) {
    try {
      ICONS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "assets", "phosphor.json.gz"))).toString("utf8")).icons;
    } catch {
      ICONS = {};
    }
  }
  return ICONS;
}
function iconSearch(word) {
  const w = String(word || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const names = Object.keys(icons());
  const hits = names.filter((n) => n.includes(w));
  return (hits.length ? hits : names.filter((n) => w && n.split("-").some((p) => w.includes(p) && p.length > 3))).slice(0, 40);
}
function iconSvg(name, weight = "fill", cls = "ic") {
  const set = icons()[name];
  if (!set) return "";
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 256 256" aria-hidden="true">${set[weight] || set.fill || set.bold}</svg>`;
}

// ─── types ─────────────────────────────────────────────────────────────────
// Each type: what it shows, the top-level fields it needs, and its items.
// Item fields: [max length, required] for text; "pct" 0-100; "bool"; "icon";
// "list:n:max" a list of up to n texts.
const TYPES = {
  opener: { about: "the film's title card: title is the product or its promise, text a second line set in the accent colour, icon optional", need: { title: 60 } },
  point: { about: "a numbered point: value is its number (1-99), title its label (1-3 words), icon its symbol", need: { value: 2, title: 32, icon: true } },
  headline: { about: "a statement, *marked* words in the accent", need: { title: 90 } },
  bigword: { about: "one huge word or short phrase filling the frame", need: { title: 24 } },
  wordstack: { about: "2-5 short lines stacked in different weights, the last one marked", items: [2, 5], item: [28, true] },
  typewriter: { about: "a sentence typed out with a caret", need: { text: 140 } },
  strike: { about: "phrases struck out, then the title as the answer", items: [1, 3], item: [32, true] },
  quote: { about: "a quote; source is who said it", need: { text: 200 } },
  term: { about: "a glossary card; stamp is the card's label", items: [1, 1], item: { term: [24, true], full: [60], text: [160, true] } },
  spotlight: { about: "one big icon with a title and text", need: { icon: true } },
  number: { about: "one big number that counts up, text under it", need: { value: 16 } },
  numbers: { about: "2-4 number tiles", items: [2, 4], item: { value: [16, true], label: [40, true], icon: "icon" } },
  change: { about: "a number before and after", items: [2, 2], item: { value: [16, true], label: [40, true] } },
  bars: { about: "horizontal bars", items: [2, 5], item: { label: [40, true], value: [12, true], bar: "pct", highlight: "bool" } },
  columns: { about: "vertical columns", items: [2, 5], item: { label: [24, true], value: [12, true], bar: "pct", highlight: "bool" } },
  ranking: { about: "a ranked list with bars", items: [3, 6], item: { label: [30, true], value: [12, true], bar: "pct" } },
  split: { about: "one bar split into shares that add up to 100", items: [2, 4], item: { label: [24, true], value: [10, true], share: "pct" } },
  donut: { about: "a ring; percent fills it, value is shown in it", need: { value: 16, percent: true } },
  gauge: { about: "a half-circle gauge; percent sets the needle", need: { value: 10, percent: true } },
  progress: { about: "n of m blocks lit; value \"n/m\" (m up to 100)", need: { value: 9 } },
  rating: { about: "a score with stars; score 0-5, value as shown (\"4.8\")", need: { value: 8, score: true } },
  line: { about: "a trend line; points 3-12 numbers, items label its two ends", items: [0, 2], item: { label: [24, true] }, need: { points: true } },
  steps: { about: "numbered chips in a row; active fills one", items: [2, 6], item: [32, true] },
  tiles: { about: "numbered tiles that light up one by one", items: [2, 6], item: [32, true] },
  checklist: { about: "a list that ticks one by one, with a counter", items: [2, 6], item: [60, true] },
  features: { about: "2-6 features, each with an icon", items: [2, 6], item: { icon: "icon", title: [34, true], text: [80] } },
  timeline: { about: "dates on a line", items: [2, 5], item: { date: [20, true], label: [40, true] } },
  flow: { about: "boxes joined by arrows", items: [2, 5], item: [32, true] },
  cycle: { about: "3-6 steps around a circle", items: [3, 6], item: [22, true] },
  funnel: { about: "3-5 stages narrowing down", items: [3, 5], item: { label: [28, true], value: [12, true] } },
  compare: { about: "the old way, crossed out, then the new one, ticked", items: [2, 2], item: { label: [24, true], text: [40, true] } },
  proscons: { about: "pros and cons in two columns (pros, cons: 2-4 texts each)", need: { pros: true, cons: true } },
  pricing: { about: "2-3 plan cards", items: [2, 3], item: { name: [20, true], price: [12, true], period: [16], features: "list:5:40", highlight: "bool" } },
  chat: { about: "message bubbles; from \"me\" or a name", items: [2, 5], item: { from: [16, true], text: [120, true] } },
  notify: { about: "notification cards stacking up", items: [2, 4], item: { title: [36, true], text: [80], time: [12], icon: "icon" } },
  search: { about: "a query typed into a search box, then results", items: [2, 4], item: { title: [60, true], text: [90] }, need: { value: 60 } },
  code: { about: "a code card; code keeps its lines (up to 14)", need: { code: true } },
};

function parseScene(spec, { look = "launch", portrait = false, brand = {} } = {}) {
  const problems = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return { problems: ["a scene must be one JSON object"] };
  const type = String(spec.type || "");
  if (!TYPES[type]) return { problems: [`"type" must be one of ${Object.keys(TYPES).join(", ")}`] };
  const def = TYPES[type];
  const words = (value, where, max, required) => {
    if (value === undefined || value === null || value === "") {
      if (required) problems.push(`${where} is missing`);
      return "";
    }
    if (typeof value !== "string" && typeof value !== "number") {
      problems.push(`${where} must be text`);
      return "";
    }
    const s = String(value).replace(/\s+/g, " ").trim();
    if ([...s.replace(/\*/g, "")].length > max) problems.push(`${where} is longer than ${max} characters`);
    return s;
  };
  const number = (value, where, min, max) => {
    const n = Number(value);
    if (!(n >= min && n <= max)) {
      problems.push(`${where} must be a number from ${min} to ${max}`);
      return min;
    }
    return n;
  };
  const icon = (value, where, required) => {
    if (!value) {
      if (required) problems.push(`${where} is missing`);
      return "";
    }
    const name = String(value).toLowerCase().trim();
    if (!icons()[name]) {
      const near = iconSearch(name.split("-")[0]).slice(0, 8);
      problems.push(`${where} "${name}" is not an icon${near.length ? ` (near: ${near.join(", ")})` : ""}; search with: launch-film icons <word>`);
      return "";
    }
    return name;
  };
  const style = String(spec.look || look);
  if (!LOOKS[style]) problems.push(`"look" must be one of ${Object.keys(LOOKS).join(", ")}`);
  const need = def.need || {};
  const scene = {
    type,
    style: LOOKS[style] ? style : "launch",
    portrait: Boolean(portrait),
    lang: /^[a-z]{2}$/i.test(String(spec.lang || "")) ? String(spec.lang).toLowerCase() : "",
    brand: { background: brand.background || null, accent: brand.accent || null, accent2: brand.accent2 || null },
    font: brand.headingFont || "",
    bodyFont: brand.bodyFont || "",
    kicker: words(spec.kicker, '"kicker"', 40),
    title: words(spec.title, '"title"', need.title || 70, Boolean(need.title)),
    text: words(spec.text, '"text"', need.text || 160, Boolean(need.text)),
    value: words(spec.value, '"value"', need.value || 16, Boolean(need.value)),
    stamp: words(spec.stamp, '"stamp"', 24),
    source: words(spec.source, '"source"', 80),
    icon: icon(spec.icon, '"icon"', Boolean(need.icon)),
    active: Number.isInteger(spec.active) ? spec.active : 0,
    items: [],
  };
  if (type === "point" && scene.value && !/^\d{1,2}$/.test(scene.value)) problems.push('"value" is the point\'s number, 1-99');
  if (need.percent) scene.percent = number(spec.percent, '"percent"', 0, 100);
  if (need.score) scene.score = number(spec.score, '"score"', 0, 5);
  if (type === "progress") {
    const m = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(scene.value);
    if (!m || Number(m[1]) > Number(m[2]) || Number(m[2]) < 1 || Number(m[2]) > 100) problems.push('"value" must be "n/m" with n <= m <= 100, e.g. "8/12"');
    else [scene.done, scene.total] = [Number(m[1]), Number(m[2])];
  }
  if (need.points) {
    const points = Array.isArray(spec.points) ? spec.points.map(Number) : [];
    if (points.length < 3 || points.length > 12 || points.some((p) => !Number.isFinite(p))) problems.push('"points" must be 3-12 numbers');
    scene.points = points;
  }
  if (need.pros) {
    for (const side of ["pros", "cons"]) {
      const list = Array.isArray(spec[side]) ? spec[side] : [];
      if (list.length < 2 || list.length > 4) problems.push(`"${side}" must hold 2-4 texts`);
      scene[side] = list.slice(0, 4).map((t, i) => words(t, `${side}[${i}]`, 50, true));
    }
  }
  if (need.code) {
    const code = typeof spec.code === "string" ? spec.code.replace(/\t/g, "  ").replace(/\s+$/g, "") : "";
    const lines = code.split("\n");
    if (!code) problems.push('"code" is missing');
    else if (lines.length > 14 || lines.some((l) => [...l].length > 70)) problems.push('"code" takes up to 14 lines of up to 70 characters');
    scene.code = lines.slice(0, 14);
  }
  const items = Array.isArray(spec.items) ? spec.items : [];
  if (def.items && (items.length < def.items[0] || items.length > def.items[1])) {
    problems.push(`a ${type} scene takes ${def.items[0] === def.items[1] ? def.items[0] : `${def.items[0]}-${def.items[1]}`} "items"`);
  }
  if (!def.items && items.length) problems.push(`a ${type} scene takes no "items"`);
  items.slice(0, def.items ? def.items[1] : 0).forEach((item, i) => {
    const at = `items[${i}]`;
    if (Array.isArray(def.item)) {
      scene.items.push(words(item, at, def.item[0], true));
      return;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      problems.push(`${at} must be an object with ${Object.keys(def.item).join(", ")}`);
      return;
    }
    const out = {};
    for (const [key, kind] of Object.entries(def.item)) {
      const where = `${at}.${key}`;
      if (Array.isArray(kind)) out[key] = words(item[key], where, kind[0], kind[1]);
      else if (kind === "pct") out[key] = item[key] === undefined ? null : number(item[key], where, 0, 100);
      else if (kind === "bool") out[key] = item[key] === true;
      else if (kind === "icon") out[key] = icon(item[key], where, false);
      else if (kind.startsWith("list:")) {
        const [, n, max] = kind.split(":").map(Number);
        const list = Array.isArray(item[key]) ? item[key] : [];
        if (list.length > n) problems.push(`${where} takes up to ${n} texts`);
        out[key] = list.slice(0, n).map((t, k) => words(t, `${where}[${k}]`, max, true));
      }
    }
    scene.items.push(out);
  });
  // Capitals follow the language: in Turkish "i" is "İ".
  if (!scene.lang) scene.lang = /[\u011f\u015f\u0131\u0130]/.test(JSON.stringify(spec)) ? "tr" : "en";
  return { scene, problems };
}

// ─── typefaces ─────────────────────────────────────────────────────────────
// The brand's own families when Google Fonts has them, else the look's.
// Faces are embedded in the page as data URLs; a family that cannot be had
// falls back to the system's sans.
async function resolveFonts({ style, font = "", bodyFont = "", type = "" }, { offline = false } = {}) {
  const look = LOOKS[style] || LOOKS.launch;
  const choices = {
    head: [...(font ? [[font, look.head[1]]] : []), look.head],
    body: [...(bodyFont || font ? [[bodyFont || font, look.body[1]]] : []), look.body],
    label: [look.label],
  };
  if (type === "code") choices.label = [["JetBrains Mono", 400], ...choices.label];
  const loaded = new Map();
  let css = "";
  const missing = [];
  const get = async (family, weights) => {
    const key = family;
    if (loaded.has(key)) return loaded.get(key);
    const face = offline ? "" : await loadFont(family, weights).catch(() => "");
    loaded.set(key, Boolean(face));
    if (face) css += face;
    else missing.push(family);
    return Boolean(face);
  };
  // All weights a family is wanted at, asked for at once.
  const want = new Map();
  for (const list of Object.values(choices)) for (const [family, weight] of list) want.set(family, [...new Set([...(want.get(family) || []), weight, 400])].sort((a, b) => a - b));
  const fonts = { weight: {}, missing };
  for (const [role, list] of Object.entries(choices)) {
    let picked = null;
    for (const [family, weight] of list) {
      if (await get(family, want.get(family))) {
        picked = [family, weight];
        break;
      }
    }
    fonts[role] = picked ? picked[0] : "P";
    fonts.weight[role] = picked ? picked[1] : list[list.length - 1][1];
  }
  fonts.css = css;
  return fonts;
}

function catalog() {
  return Object.entries(TYPES).map(([type, def]) => ({
    type,
    about: def.about,
    fields: Object.keys(def.need || {}),
    items: def.items ? { count: def.items, fields: Array.isArray(def.item) ? "text" : Object.keys(def.item) } : null,
  }));
}

module.exports = { TYPES, parseScene, resolveFonts, catalog, icons, iconSearch, iconSvg };
