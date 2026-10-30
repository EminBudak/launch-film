"use strict";
// ─── launch-film motion: scenes as motion design ───────────────────────────
// The JSON scenes of scene.js, drawn the way code-made launch films are drawn
// now: a stage with depth and light instead of a card on a page, a camera
// that never stops, type at film sizes rising out of its own masks, numbers
// that decode and count, surfaces that come in from depth, one thing at a
// time. The scene JSON, its checks and its exact words stay scene.js'; this
// module only draws. A look here is a whole art direction: ground, light,
// surfaces, type, camera and motion, not a skin over the same cards.
//
// The page is a paused timeline (runtime/timeline.js) that the renderer's
// virtual clock seeks (__seek), so every frame is a function of time; __end
// tells when the entrances are over. Sound effects are cues the caller
// mixes.

const fs = require("fs");
const path = require("path");

// The timeline every page runs on, read once.
const TIMELINE = fs.readFileSync(path.join(__dirname, "runtime", "timeline.js"), "utf8");
const timelineTag = () => `<script>${TIMELINE}</script>`;
// The faces a page falls back on when its own cannot be had.
const FALLBACK = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ─── colour ────────────────────────────────────────────────────────────────
const rgb = (hex) => [1, 3, 5].map((k) => parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(k - 1, k + 1), 16));
const hexOf = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const mix = (a, b, t) => hexOf(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => rgb(hex).reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * lin(v), 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const rgba = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
const saturation = (hex) => {
  const c = rgb(hex);
  const hi = Math.max(...c);
  return hi ? (hi - Math.min(...c)) / hi : 0;
};
// Moves a colour toward white or black until it reads on `bg`.
function readable(colour, bg, min = 3) {
  const toward = luminance(bg) < 0.2 ? "#FFFFFF" : "#000000";
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(colour, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}
// A hue turned by `deg` degrees, same lightness and saturation.
function turn(hex, deg) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const l = (hi + lo) / 2;
  const d = hi - lo;
  if (!d) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hexOf([a + m, bb + m, cc + m].map((v) => v * 255));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const svgUrl = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
const grainUrl = (alpha) => svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`);

// ─── looks ─────────────────────────────────────────────────────────────────
// Each look carries the fields the picker, the fonts and the catalogue read;
// `tokens` gives the page its colours from the brand's.
const LOOKS = {
  launch: {
    family: "launch",
    about: "launch film: a near-black stage with depth and soft light, a hairline grid, film-size type rising out of masks, numbers that decode, dark UI panels and glass coming in from depth, one luminous accent (the brand's)",
    suits: "SaaS, apps, developer tools, launches, one big number",
    groups: ["business", "developer", "launch", "science", "money", "howto"],
    head: ["Inter", 700], body: ["Inter", 500], label: ["JetBrains Mono", 500],
    background: (b) => mix(b.background || "#0B1020", "#04060C", 0.6),
    accent: (b, bg) => readable(b.accent || "#B7F34A", bg, 4.6),
    tokens(brand) {
      const ground = this.background(brand);
      const accent = this.accent(brand, ground);
      const accent2 = brand.accent2 ? readable(brand.accent2, ground, 3.5) : turn(accent, 38);
      return { dark: true, ground, lift: mix(ground, accent, 0.2), fg: "#F3F5FF", muted: "#8E96BC", faint: "rgba(255,255,255,.06)",
        line: "rgba(255,255,255,.10)", surface: mix(ground, "#FFFFFF", 0.06), surface2: mix(ground, "#FFFFFF", 0.1), accent, accent2,
        on: readable("#FFFFFF", accent, 3) === "#FFFFFF" && contrast("#FFFFFF", accent) >= 3 ? "#FFFFFF" : "#0A0D18" };
    },
  },
  aurora: {
    family: "aurora",
    about: "aurora glass: frosted glass cards floating in 3D over a slow aurora of the brand's colors, glowing icons, soft bold type",
    suits: "consumer apps, AI products, premium launches, wellness, music and lifestyle",
    groups: ["consumer", "launch", "music", "health", "luxury", "travel", "business"],
    head: ["Plus Jakarta Sans", 800], body: ["Plus Jakarta Sans", 500], label: ["JetBrains Mono", 500],
    background: (b) => mix(b.background || "#120F2E", "#07061A", 0.55),
    accent: (b, bg) => readable(b.accent || "#8B7CFF", bg, 4.6),
    tokens(brand) {
      const ground = this.background(brand);
      const accent = this.accent(brand, ground);
      const accent2 = brand.accent2 && saturation(brand.accent2) > 0.25 ? readable(brand.accent2, ground, 2.6) : turn(accent, 52);
      return { dark: true, ground, fg: "#FFFFFF", muted: "rgba(240,238,255,.74)", faint: "rgba(255,255,255,.08)", line: "rgba(255,255,255,.16)",
        accent, accent2, accent3: turn(accent, -48), surface: "rgba(255,255,255,.10)", surface2: "rgba(255,255,255,.16)",
        on: contrast("#FFFFFF", accent) >= 3 ? "#FFFFFF" : "#120F2E" };
    },
  },
  gridline: {
    family: "gridline",
    about: "Swiss grid: a light paper page with hairline columns, giant numerals and flush-left grotesk type set tight, one signal color (the brand's, else red), rules that draw on the beat",
    suits: "B2B, finance, reports, guides, rules and steps, editorial and culture",
    groups: ["business", "money", "howto", "science", "culture", "travel", "luxury"],
    ownFonts: true,
    head: ["Archivo", 800], body: ["Inter", 500], label: ["JetBrains Mono", 500],
    background: () => "#F2F1ED",
    accent: (b, bg) => (b.accent && saturation(b.accent) > 0.3 && contrast(b.accent, bg) >= 3 ? b.accent : b.accent && saturation(b.accent) > 0.3 ? readable(b.accent, bg, 3) : "#E2401C"),
    tokens(brand) {
      const ground = this.background(brand);
      const accent = this.accent(brand, ground);
      return { dark: false, ground, fg: "#111218", muted: "#575A6B", faint: "rgba(17,18,24,.07)", line: "rgba(17,18,24,.16)", accent,
        accent2: "#111218", surface: "#FFFFFF", surface2: "#E7E5DF", on: contrast("#FFFFFF", accent) >= 3 ? "#FFFFFF" : "#111218" };
    },
  },
  pop: {
    family: "pop",
    about: "pop color fields: full-bleed brand color that changes from scene to scene, huge rounded type, bold flat shapes that bounce on the beat, sticker cards with hard shadows",
    suits: "consumer apps, food and drink, kids and casual games, social and creator tools",
    groups: ["consumer", "food", "kids", "games-casual", "music", "travel", "howto"],
    ownFonts: true,
    head: ["Bricolage Grotesque", 800], body: ["Plus Jakarta Sans", 500], label: ["Space Mono", 700],
    background: (b) => (b.accent && saturation(b.accent) > 0.35 ? b.accent : "#3B5BFF"),
    accent: (b, bg) => (contrast("#FFE45E", bg) >= 1.6 ? "#FFE45E" : "#111111"),
    tokens(brand, seed) {
      const brandColour = this.background(brand);
      // Every other scene sits on cream, so the fields change with the cuts.
      const cream = seed % 2 === 1;
      const ground = cream ? "#FFF6E8" : brandColour;
      const ink = contrast("#FFFFFF", ground) >= 2.4 && !cream ? "#FFFFFF" : "#15131A";
      const accent = cream ? readable(brandColour, ground, 2.6) : contrast("#FFE45E", ground) >= 1.5 ? "#FFE45E" : "#15131A";
      return { dark: !cream && luminance(ground) < 0.35, ground, fg: ink, muted: ink === "#FFFFFF" ? "rgba(255,255,255,.82)" : "#4A4652",
        faint: ink === "#FFFFFF" ? "rgba(255,255,255,.12)" : "rgba(21,19,26,.08)", line: ink === "#FFFFFF" ? "rgba(255,255,255,.3)" : "rgba(21,19,26,.2)",
        accent, accent2: cream ? "#FF6B9A" : "#FFFFFF", accent3: "#3DDC97", brand: brandColour, surface: "#FFFFFF", surface2: "#FFF6E8",
        on: contrast("#FFFFFF", accent) >= 3 ? "#FFFFFF" : "#15131A", ink: "#15131A" };
    },
  },
};
// A look of a family draws with that family's layouts and components and
// brings its own colours, type, ground and finishing on top.
LOOKS.journal = {
  family: "gridline",
  about: "journal: a warm paper page with newspaper rules, large serif headlines with italic accents, ink-black type and one printing color (the brand's, else vermilion), figures set like a magazine's",
  suits: "articles and blog posts, reports, finance, culture, guides and considered B2B",
  groups: ["business", "money", "culture", "howto", "science", "health", "travel"],
  ownFonts: true,
  head: ["Fraunces", 700], body: ["Inter", 500], label: ["JetBrains Mono", 500],
  background: () => "#F3EEE4",
  accent: (b, bg) => (b.accent && saturation(b.accent) > 0.3 && contrast(b.accent, bg) >= 3 ? b.accent : "#C8402A"),
  tokens(brand) {
    const ground = this.background(brand);
    const accent = this.accent(brand, ground);
    return { dark: false, ground, fg: "#1A1916", muted: "#5E5A52", faint: "rgba(26,25,22,.08)", line: "rgba(26,25,22,.22)", accent,
      accent2: "#1A1916", surface: "#FBF8F2", surface2: "#E9E3D6", on: contrast("#FFFFFF", accent) >= 3 ? "#FFFFFF" : "#1A1916" };
  },
  css: (t) => `.lk-journal .head{letter-spacing:-.018em}
.lk-journal .mk{font-style:italic;color:var(--accent)}
.lk-journal .card{background:#FBF8F2;border-radius:2px;box-shadow:0 0 0 1px rgba(26,25,22,.2),0 16px 34px rgba(26,25,22,.08)}
.lk-journal .box{background:transparent;color:var(--accent);box-shadow:inset 0 0 0 3px var(--accent);border-radius:50%}
.lk-journal .disc{background:transparent;box-shadow:inset 0 0 0 4px var(--accent)}
.lk-journal .rule{height:1px;box-shadow:0 5px 0 var(--fg)}
.lk-journal .chip{border-radius:2px;background:transparent;color:var(--fg);box-shadow:inset 0 0 0 1.5px var(--fg)}`,
  ground: (t, seed, port) => {
    const W = port ? 1080 : 1920;
    const x0 = port ? 84 : 120;
    return `<div class="abs" style="inset:0;background:${t.ground}"></div>` +
      `<div class="abs" style="inset:0;background-image:${grainUrl(0.5)};opacity:.07"></div>` +
      `<i class="abs" data-a="grow-x" data-t="0.02" data-d="1" style="left:${x0}px;right:${x0}px;top:${port ? 180 : 64}px;height:1px;background:${t.fg};transform-origin:0 50%"></i>` +
      `<i class="abs" data-a="grow-x" data-t="0.08" data-d="1" style="left:${x0}px;right:${x0}px;top:${port ? 186 : 70}px;height:1px;background:${t.fg};transform-origin:0 50%"></i>` +
      `<i class="abs" data-a="grow-y" data-t="0.1" data-d="1.1" data-o="50% 0%" style="left:${W - x0}px;top:${port ? 186 : 70}px;bottom:${port ? 300 : 60}px;width:1px;background:${t.line}"></i>`;
  },
};


// ─── the page ──────────────────────────────────────────────────────────────
// Frame sizes: the page is laid out at 1920x1080 (1080x1920) and rendered at
// 4/3 of it, 2560x1440, the size of every other clip.
const FRAME = { land: [1920, 1080], port: [1080, 1920] };

// The margins a scene keeps its words inside. In 9:16 the bottom and the
// right edge stay clearer, where short-video apps put their own buttons.
const SAFE = { land: { x: 120, top: 96, bottom: 120 }, port: { x: 84, top: 220, bottom: 380 } };

const BASE_CSS = (t, port, fonts) => `
:root{--fg:${t.fg};--muted:${t.muted};--faint:${t.faint};--line:${t.line};--accent:${t.accent};--accent2:${t.accent2};--accent3:${t.accent3 || t.accent2};
--surface:${t.surface};--surface2:${t.surface2};--ground:${t.ground};--on:${t.on};--glow:${rgba(t.accent, 0.55)};--glow2:${rgba(t.accent2, 0.45)};
--head:"${fonts.head}";--body:"${fonts.body}";--label:"${fonts.label}";--hw:${fonts.weight.head || 700};--bw:${fonts.weight.body || 500}}
*{box-sizing:border-box}
html,body{margin:0;width:${port ? 1080 : 1920}px;height:${port ? 1920 : 1080}px;overflow:hidden;background:${t.ground};color:var(--fg);
font-family:var(--body),${FALLBACK};font-weight:var(--bw);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.stage{position:absolute;inset:0;overflow:hidden;perspective:${port ? 1700 : 2100}px;perspective-origin:50% 44%}
.ground{position:absolute;inset:0;overflow:hidden}
.world{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.content{position:absolute;left:0;top:0;width:100%;height:100%;transform-style:preserve-3d}
.post{position:absolute;inset:0;pointer-events:none}
.vignette{position:absolute;inset:0;background:radial-gradient(ellipse 78% 72% at 50% 46%,rgba(0,0,0,0) 55%,rgba(0,0,0,${t.dark ? 0.5 : 0}) 100%)}
.grain{position:absolute;inset:-60px;background-image:${grainUrl(t.dark ? 0.55 : 0.35)};opacity:${t.dark ? 0.09 : 0.06}}
.abs{position:absolute}
.head{font-family:var(--head),${FALLBACK};font-weight:var(--hw);letter-spacing:-.04em;line-height:.98}
.label{font-family:var(--label),monospace;font-weight:500;letter-spacing:.12em;text-transform:uppercase}
.raw{text-transform:none!important}
.mk{color:var(--accent)}
.fit{overflow-wrap:normal;word-break:normal;hyphens:none}
.ic{display:block;width:1em;height:1em;fill:currentColor}
.ic svg{display:block;width:100%;height:100%}
.num{font-variant-numeric:tabular-nums lining-nums}
`;

// The browser side: fitting, splitting, and one paused timeline built from
// the elements' data-a (what), data-t (when), data-d (how long), data-s
// (stagger) and data-to (where a card settles).
const RUNTIME = String.raw`(() => {
const C = window.__V2;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let seed = (C.seed >>> 0) || 7;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const errors = [];
const NUMBER = /^([^0-9]*?)(\d{1,3}(?:[.,]\d{3})+|\d+)(?:([.,])(\d+))?(\D*)$/;
// A number in its own form: grouping and decimal marks as the text has them.
function numberFormat(text) {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const grouped = /[.,]/.test(m[2]);
  const group = grouped ? m[2].replace(/\d/g, "")[0] : (m[3] === "," ? "." : ",");
  const decimals = m[4] ? m[4].length : 0;
  const value = Number(m[2].replace(/[.,]/g, "")) + (m[4] ? Number(m[4]) / 10 ** decimals : 0);
  const show = (v) => {
    const fixed = v.toFixed(decimals);
    let [int, dec] = fixed.split(".");
    if (grouped || int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
    return m[1] + int + (decimals ? (m[3] || ",") + dec : "") + m[5];
  };
  return { value, show };
}
// Shrinks an element's type until its words fit its box.
// A block whose height flows with its lines is checked for width alone:
// accents and descenders reach past a tight line box, and that overflow is
// not a word that does not fit.
function fit(el) {
  const min = parseFloat(el.dataset.fit) || 20;
  const fixedHeight = Boolean(el.style.height) && el.style.height !== "auto";
  let size = parseFloat(getComputedStyle(el).fontSize);
  for (let i = 0; i < 60; i++) {
    const over = el.scrollWidth > el.clientWidth + 1 || (fixedHeight && el.scrollHeight > el.clientHeight + Math.max(4, size * 0.2));
    if (!over || size <= min) break;
    size = Math.max(min, size * 0.95);
    el.style.fontSize = size + "px";
  }
  // One size for a group (the cards of a row): the smallest of them.
  if (el.dataset.group) el.dataset.size = size;
}
const E = { out: "expo.out", soft: "power3.out", io: "power2.inOut", back: "back.out(1.5)", pop: "back.out(2.2)" };
// The content block, measured once its words fit: centred in the room above
// the margins, and grown into it (up to 1.3x) or shrunk to fit it.
function compose() {
  const c = document.querySelector(".content");
  if (!c || !C.compose) return;
  // Type is measured by its ink (its box may be taller than its lines).
  const rectOf = (el) => {
    if (!el.matches(".fit,.title,.body")) return el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width > 2 ? r : el.getBoundingClientRect();
  };
  const boxes = [...c.children].filter((el) => !el.classList.contains("free")).map(rectOf).filter((r) => r.width > 0 && r.height > 0 && (r.width > 2 || r.height > 2));
  if (!boxes.length) return;
  const B = { x: Math.min(...boxes.map((r) => r.left)), y: Math.min(...boxes.map((r) => r.top)), x2: Math.max(...boxes.map((r) => r.right)), y2: Math.max(...boxes.map((r) => r.bottom)) };
  B.w = B.x2 - B.x;
  B.h = B.y2 - B.y;
  const U = C.room;
  const s = Math.max(0.6, Math.min(C.grow, U.w / B.w, U.h / B.h));
  const centred = Math.abs((B.x + B.x2) / 2 - C.W / 2) < 60;
  const left = centred ? (C.W - s * B.w) / 2 : Math.max(U.x, Math.min(B.x, U.x + U.w - s * B.w));
  const top = U.y + (U.h - s * B.h) / 2;
  c.style.transformOrigin = "0 0";
  c.style.transform = "translate(" + (left - s * B.x) + "px," + (top - s * B.y) + "px) scale(" + s + ")";
  c.dataset.scale = s.toFixed(3);
}
let master = null;
let built = false;
function build() {
  if (built) return;
  built = true;
  try {
    $$("[data-fit]").forEach(fit);
    const groups = {};
    $$("[data-group]").forEach((el) => { const g = el.dataset.group; groups[g] = Math.min(groups[g] || 1e9, parseFloat(el.dataset.size || 1e9)); });
    $$("[data-group]").forEach((el) => { el.style.fontSize = groups[el.dataset.group] + "px"; });
    compose();
    gsap.registerPlugin(SplitText, DrawSVGPlugin);
    master = gsap.timeline({ paused: true });
    const T = C.tempo;
    for (const el of $$("[data-a]")) {
      const a = el.dataset.a;
      const t = parseFloat(el.dataset.t || 0) * T;
      const d = parseFloat(el.dataset.d || 0.9) * Math.max(0.7, T);
      const s = parseFloat(el.dataset.s || 0.07) * T;
      if (a === "rise" || a === "rise-chars" || a === "rise-lines") {
        const type = a === "rise-chars" ? "chars" : a === "rise-lines" ? "lines" : "words";
        const split = new SplitText(el, { type: type === "chars" ? "words,chars" : type, mask: type });
        master.from(split[type], { yPercent: 118, rotate: type === "chars" ? 4 : 0, duration: d, ease: E.out, stagger: s }, t);
      } else if (a === "fade") master.from(el, { opacity: 0, duration: d, ease: E.soft }, t);
      else if (a === "up") master.from(el, { y: parseFloat(el.dataset.y || 40), opacity: 0, duration: d, ease: E.out }, t);
      else if (a === "down") master.from(el, { y: -parseFloat(el.dataset.y || 30), opacity: 0, duration: d, ease: E.out }, t);
      else if (a === "left") master.from(el, { x: -parseFloat(el.dataset.y || 80), opacity: 0, duration: d, ease: E.out }, t);
      else if (a === "right") master.from(el, { x: parseFloat(el.dataset.y || 80), opacity: 0, duration: d, ease: E.out }, t);
      else if (a === "pop") master.from(el, { scale: parseFloat(el.dataset.from || 0.4), opacity: 0, duration: d, ease: E.pop }, t);
      else if (a === "zoom") master.from(el, { scale: parseFloat(el.dataset.from || 1.25), opacity: 0, duration: d, ease: E.out }, t);
      else if (a === "card") {
        const to = JSON.parse(el.dataset.to || "{}");
        master.fromTo(el, { z: -900, rotationX: 22, rotationY: (to.rotationY || 0) * 2.4, y: 150, opacity: 0 },
          { z: 0, rotationX: 0, y: 0, opacity: 1, ...to, duration: d * 1.5, ease: E.out }, t);
      } else if (a === "flip") master.from(el, { rotationX: -96, transformOrigin: "50% 0%", opacity: 0, duration: d, ease: E.back }, t);
      else if (a === "wipe") master.fromTo(el, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: d, ease: E.out }, t);
      else if (a === "wipe-up") master.fromTo(el, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: d, ease: E.out }, t);
      else if (a === "grow-x") master.from(el, { scaleX: 0, transformOrigin: el.dataset.o || "0% 50%", duration: d, ease: E.out }, t);
      else if (a === "grow-y") master.from(el, { scaleY: 0, transformOrigin: el.dataset.o || "50% 100%", duration: d, ease: E.out }, t);
      else if (a === "draw") master.from(el, { drawSVG: el.dataset.from || "0%", duration: d, ease: el.dataset.e || E.io }, t);
      else if (a === "to") master.to(el, { ...JSON.parse(el.dataset.to || "{}"), duration: d, ease: el.dataset.e ? (E[el.dataset.e] || el.dataset.e) : E.out }, t);
      else if (a === "count") {
        const text = el.dataset.v;
        const f = numberFormat(text);
        if (f) {
          const from = el.dataset.from ? numberFormat(el.dataset.from) : null;
          const o = { v: from ? from.value : 0 };
          el.textContent = f.show(o.v);
          // The last frame writes the text itself: GSAP reads "1.200" as the
          // number 1.2 when it sets a property.
          master.to(o, { v: f.value, duration: d * 1.6, ease: "expo.out", onUpdate() { el.textContent = this.progress() >= 1 ? text : f.show(o.v); } }, t);
        } else master.from(el, { opacity: 0, y: 30, duration: d, ease: E.out }, t);
      } else if (a === "scramble") {
        const text = el.dataset.v;
        const signs = el.dataset.signs || "0123456789#%&@$";
        const o = { p: 0 };
        const chars = [...text];
        el.textContent = chars.map((c) => (c === " " ? " " : signs[Math.floor(rnd() * signs.length)])).join("");
        master.to(o, { p: 1, duration: d * 1.2, ease: "none", onUpdate() {
          if (this.progress() >= 1) return void (el.textContent = text);
          const locked = Math.floor(o.p * (chars.length + 0.999));
          el.textContent = chars.map((c, i) => (i < locked || c === " " ? c : signs[Math.floor(rnd() * signs.length)])).join("");
        } }, t);
      } else if (a === "type") {
        const text = el.dataset.v;
        const cps = parseFloat(el.dataset.cps || 18) / T;
        const o = { n: 0 };
        el.textContent = "";
        master.to(o, { n: [...text].length, duration: [...text].length / cps, ease: "none", onUpdate() { el.textContent = this.progress() >= 1 ? text : [...text].slice(0, Math.round(o.n)).join(""); } }, t);
      }
    }
    // Things that keep moving once they have arrived.
    for (const el of $$("[data-float]")) {
      const [y, d, r] = el.dataset.float.split(",").map(Number);
      const start = parseFloat(el.dataset.ft || C.end / 1000) ;
      const reps = Math.max(1, Math.ceil((C.seconds - start) / (d || 4)));
      master.to(el, { y: "+=" + (y || -12), rotation: "+=" + (r || 0), duration: d || 4, ease: "sine.inOut", yoyo: true, repeat: reps }, start);
    }
    for (const el of $$("[data-spin]")) master.to(el, { rotation: "+=" + parseFloat(el.dataset.spin), duration: C.seconds, ease: "none" }, 0);
    // The camera, the whole length of the clip.
    const cam = C.camera;
    master.fromTo("#world", cam.from, { ...cam.to, duration: C.seconds, ease: cam.ease || "power1.inOut" }, 0);
    for (const b of $$("[data-drift]")) {
      const [x, y, s] = b.dataset.drift.split(",").map(Number);
      master.to(b, { x, y, scale: s || 1, duration: C.seconds, ease: "sine.inOut" }, 0);
    }
    master.to({}, { duration: C.seconds }, 0);
  } catch (e) {
    errors.push(String(e && e.message || e));
    console.error("v2 build: " + (e && e.stack || e));
  }
}
const grain = document.querySelector(".grain");
window.__seek = (ms) => {
  build();
  if (master) master.seek(ms / 1000, false);
  if (grain) {
    const f = Math.floor(ms / 40);
    grain.style.transform = "translate(" + ((f * 73) % 60 - 30) + "px," + ((f * 151) % 60 - 30) + "px)";
  }
};
window.__end = () => C.end;
window.__holds = () => true;
window.__fast = () => [];
window.__v2Errors = () => errors;
// Played without seeks (a check): the clock drives the same timeline.
const tick = () => { window.__seek(performance.now()); requestAnimationFrame(tick); };
document.fonts.ready.then(() => requestAnimationFrame(tick));
})();`;

// ─── text helpers given to the types ───────────────────────────────────────
// Separators stay at the end of a line, glued to the word before them, and
// handles, addresses and e-mails keep their case under a capitals label.
const RAW = /^(@[\w.]+|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(\.[\w-]+)+|[\w-]+(\.[\w-]+)*\.(com|net|org|ai|io|co|app|shop|store|tr|me)(\/\S*)?)[.,;:!?]?$/i;
const glue = (text) => String(text).replace(/\s+([\u00B7\u2022|\u2013\u2014])(?=\s)/g, "\u00A0$1");
const keep = (text) => glue(text).split(/(\s+)/).map((w) => (RAW.test(w) ? `<span class="raw">${esc(w)}</span>` : esc(w))).join("");
// *Marked* words become .mk spans; punctuation against a mark goes into it.
function marked(text) {
  const parts = glue(text).split(/(\*[^*]+\*)/).filter(Boolean);
  for (let p = 0; p < parts.length; p++) {
    if (!/^\*[^*]+\*$/.test(parts[p])) continue;
    const after = p + 1 < parts.length && /^[,.;:!?\u2026)\]\u00bb\u201d\u2019"']+/.exec(parts[p + 1]);
    if (after) {
      parts[p] = `${parts[p].slice(0, -1)}${after[0]}*`;
      parts[p + 1] = parts[p + 1].slice(after[0].length);
    }
  }
  return parts.filter(Boolean).map((part) => (/^\*[^*]+\*$/.test(part) ? `<span class="mk">${keep(part.slice(1, -1))}</span>` : keep(part))).join("");
}
const plainText = (text) => String(text || "").replace(/\*/g, "");

function hash(text) {
  return [...String(text)].reduce((h, c) => (Math.imul(h ^ c.codePointAt(0), 2654435761) >>> 0), 2166136261);
}

// ─── cameras ───────────────────────────────────────────────────────────────
// A camera with a reason: launch dollies in through depth, aurora floats,
// gridline slides like a printed page under a lens, pop bounces in.
function camera(look, seed, port) {
  const side = seed % 2 ? 1 : -1;
  switch (look) {
    case "launch":
      return { from: { z: -150, rotationY: 3 * side, x: 30 * side }, to: { z: 40, rotationY: -1.5 * side, x: -10 * side } };
    case "aurora":
      return { from: { z: -80, rotationX: 7, rotationY: 2 * side }, to: { z: 30, rotationX: 1.5, rotationY: -2 * side } };
    case "gridline":
      return { from: { x: (port ? 20 : 44) * side, scale: 1 }, to: { x: -(port ? 10 : 22) * side, scale: 1.03 }, ease: "power2.out" };
    default:
      return { from: { scale: 1.06, rotation: -1.2 * side }, to: { scale: 1, rotation: 0 }, ease: "expo.out" };
  }
}

// The ground of each look.
function groundHtml(look, t, seed, port) {
  const W = port ? 1080 : 1920;
  const H = port ? 1920 : 1080;
  if (look === "launch") {
    return `<div class="abs" style="inset:0;background:radial-gradient(${Math.round(W * 0.75)}px ${Math.round(H * 0.72)}px at 50% 6%,${t.lift} 0%,${rgba(t.lift, 0)} 72%),radial-gradient(${Math.round(W * 0.5)}px ${Math.round(H * 0.5)}px at ${seed % 2 ? 88 : 12}% 96%,${rgba(t.accent, 0.12)} 0%,${rgba(t.accent, 0)} 70%),${t.ground}"></div>` +
      `<div class="abs" data-drift="${seed % 2 ? -36 : 36},14,1.04" style="inset:-240px;background-image:linear-gradient(${t.faint} 1px,transparent 1px),linear-gradient(90deg,${t.faint} 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(ellipse 58% 52% at 50% 44%,#000 22%,transparent 78%)"></div>`;
  }
  if (look === "aurora") {
    const blob = (c, size, x, y, a, drift) => `<div class="abs" data-drift="${drift}" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle,${rgba(c, a)} 0%,${rgba(c, 0)} 62%)"></div>`;
    const s = port ? 1.3 : 1;
    return `<div class="abs" style="inset:0;background:${t.ground}"></div>` +
      blob(t.accent, 1500 * s, -380 * s, -620 * s, 0.72, `${port ? 120 : 260},120,1.1`) +
      blob(t.accent2, 1300 * s, (port ? 300 : 900), -300 * s, 0.6, `${port ? -120 : -220},160,1.05`) +
      blob(t.accent3 || t.accent2, 1400 * s, (port ? -200 : 380), (port ? 900 : 420), 0.36, `180,${port ? -200 : -140},1.12`);
  }
  if (look === "gridline") {
    const cols = port ? 6 : 12;
    const step = port ? 152 : 140;
    const x0 = port ? 84 : 120;
    let lines = "";
    for (let i = 0; i <= cols; i++) lines += `<i class="abs gl-col" data-a="grow-y" data-t="${(0.02 * i).toFixed(2)}" data-d="0.9" data-o="50% 0%" style="left:${x0 + i * step}px;top:0;bottom:0;width:1px;background:${t.faint}"></i>`;
    return `<div class="abs" style="inset:0;background:${t.ground}"></div>${lines}`;
  }
  // pop: the field, and a few big soft shapes that drift.
  const shapes = [
    `<div class="abs" data-drift="30,-20,1.06" style="left:${port ? -160 : -200}px;top:${port ? 1380 : 640}px;width:${port ? 560 : 640}px;height:${port ? 560 : 640}px;border-radius:50%;background:${rgba(t.fg === "#FFFFFF" ? "#FFFFFF" : t.brand, 0.08)}"></div>`,
    `<div class="abs" data-drift="-26,18,1.04" style="left:${port ? 700 : 1500}px;top:${port ? -180 : -220}px;width:${port ? 520 : 600}px;height:${port ? 520 : 600}px;border-radius:50%;background:${rgba(t.fg === "#FFFFFF" ? "#FFFFFF" : t.brand, 0.08)}"></div>`,
  ];
  return `<div class="abs" style="inset:0;background:${t.ground}"></div>${shapes.join("")}`;
}

// ─── assembly ──────────────────────────────────────────────────────────────
// scene: parsed by scene.js' parseScene. fonts: its resolveFonts
// (css with the faces, head/body/label families and weights). icon(name,
// weight): a Phosphor SVG. Returns { html, end, cues, W, H }, or null when
// this module does not draw the type (the caller draws it in the look's
// fallback).
function sceneHtml(scene, { fonts, seconds = 6, icon }) {
  const TYPES = require("./types");
  const look = LOOKS[scene.style];
  const build = scene.type !== "KIT_CSS" && TYPES[scene.type];
  if (!look || !build) return null;
  const port = Boolean(scene.portrait);
  const [W, H] = port ? FRAME.port : FRAME.land;
  const seed = hash(`${scene.type}|${scene.title}|${scene.text}|${scene.value}|${JSON.stringify(scene.items)}`);
  const brand = { ...scene.brand };
  if (scene.look && scene.look.accent) brand.accent = scene.look.accent;
  if (scene.look && scene.look.ground) brand.background = scene.look.ground;
  const t = look.tokens(brand, seed);
  // Entrances run at full pace from 5 s up and faster in a short clip.
  const tempo = Math.max(0.62, Math.min(1, (seconds - 0.6) / 5));
  const cues = [];
  let rand = seed;
  const fam = look.family || scene.style;
  const k = {
    W, H, port, look: scene.style, fam, t, seed, seconds, tempo, safe: port ? SAFE.port : SAFE.land,
    lang: scene.lang, titleLang: scene.titleLang,
    sz: (land, portrait) => (port ? portrait : land),
    esc, keep, marked, plain: plainText,
    icon: (name, weight = "fill") => (name ? `<span class="ic">${icon(name, weight, "")}</span>` : ""),
    rnd: () => ((rand = (Math.imul(rand, 1664525) + 1013904223) >>> 0) / 4294967296),
    cue: (sfx, at, volume = 0.45) => cues.push({ sfx, at: at * tempo, volume }),
    rgba, mix, turn, readable, contrast,
  };
  k.decos = [];
  k.deco = (html) => {
    k.decos.push(html);
    return "";
  };
  const out = build(scene, k);
  if (out.deco === undefined) out.deco = k.decos.join("");
  const end = Math.min(seconds, (out.end || 2.4) * tempo + 0.35);
  const safe = port ? SAFE.port : SAFE.land;
  const room = { x: safe.x, y: safe.top, w: W - 2 * safe.x, h: H - safe.top - safe.bottom };
  const config = { seconds, end: Math.round(end * 1000), tempo, seed, camera: camera(fam, seed, port), port, W, H, room, grow: out.grow || 1.3, compose: out.compose !== false };
  const html = `<!doctype html><html lang="${esc(scene.lang || "en")}"><head><meta charset="utf-8">
${timelineTag()}
<style>${fonts.css}${BASE_CSS(t, port, fonts)}${TYPES.KIT_CSS(k)}${out.css || ""}${look.css ? look.css(t) : ""}</style></head>
<body class="lk-${scene.style} fam-${fam} t-${scene.type} ${port ? "port" : "land"}">
<div class="stage"><div class="ground">${look.ground ? look.ground(t, seed, port) : groundHtml(fam, t, seed, port)}</div><div class="world" id="world">${out.deco || ""}<div class="content">${out.html}</div></div>
<div class="post"><div class="vignette"></div><div class="grain"></div></div></div>
<script>window.__V2=${JSON.stringify(config)};</script><script>${RUNTIME}</script>
</body></html>`;
  return { html, end, cues, W, H };
}

// ─── screens ───────────────────────────────────────────────────────────────
// A captured screen in a look (the screen clip, zoom or pan): the page comes in
// as a window from depth and settles flat on the look's stage; a zoom then
// moves the camera to its block, the rest of the page goes soft and dark, the
// block (its own pixels, exact) lifts toward the viewer with an outline of
// light, and a cursor (a tap on a phone's screen) points at it; a full screen
// keeps easing in while the cursor crosses it. Files: image (the capture, as
// served next to the page) and soft (a blurred copy, the window's width).
// box: the block in the capture's pixels (zoom). Returns { html, cues, W, H }.
function screenHtml({ mode, look: lookName, port, seconds, accent, image, soft, box: blk = null, side = "center", phone = false, captions = false, fonts = null, brand = null }) {
  const look = LOOKS[lookName];
  const [W, H] = port ? FRAME.port : FRAME.land;
  const seed = hash(`${mode}|${image.w}x${image.h}|${(blk || []).join(",")}|${side}`);
  const t = look.tokens({ accent: accent ? `#${String(accent).replace("#", "").toUpperCase()}` : null, background: (brand && brand.background) || null, accent2: (brand && brand.accent2) || null }, seed);
  const tempo = Math.max(0.62, Math.min(1, (seconds - 0.6) / 4.6));
  const T = (s) => +(s * tempo).toFixed(3);
  const bar = phone ? 0 : 44;
  const roomH = H - (port ? 420 : 200);
  const maxW = W * (phone ? 0.5 : port ? 0.92 : 0.8);
  const maxH = (phone ? roomH : port ? H * 0.5 : roomH) - bar;
  const k = Math.min(maxW / image.w, maxH / image.h);
  const ww = image.w * k;
  const wh = image.h * k + bar;
  const wx = (W - ww) / 2;
  const wy = Math.max(40, (H - (port ? 260 : 0) - wh) / 2);
  const r = phone ? 54 : 20;
  const cues = [];
  const cue = (sfx, at, volume) => cues.push({ sfx, at, volume });
  const dir = seed % 2 ? 1 : -1;
  // The camera's last place: the block centred (a little higher when
  // captions will be burned under it).
  let cam = null;
  let block = null;
  if (mode === "zoom" && blk) {
    const [bx, by, bw, bh] = blk;
    block = { x: wx + bx * k, y: wy + bar + by * k, w: bw * k, h: bh * k, bx: bx * k, by: by * k };
    const S = Math.max(1.05, Math.min(2.8, (W * (port ? 0.84 : 0.6)) / block.w, (H * (port ? 0.34 : 0.5)) / block.h));
    const cx = W / 2;
    const cy = H * (captions ? (port ? 0.4 : 0.44) : 0.5);
    cam = { scale: S, x: cx - S * (block.x + block.w / 2), y: cy - S * (block.y + block.h / 2), cx, cy };
  }
  const glow = t.dark ? rgba(t.accent, 0.55) : rgba(t.accent, 0.35);
  const css = `${fonts ? fonts.css : ""}${BASE_CSS(t, port, fonts || { head: "P", body: "P", label: "P", weight: {} })}
.win{position:absolute;left:${wx.toFixed(1)}px;top:${wy.toFixed(1)}px;width:${ww.toFixed(1)}px;height:${wh.toFixed(1)}px;border-radius:${r}px;overflow:hidden;background:#fff;
box-shadow:0 0 0 1px ${t.dark ? "rgba(255,255,255,.14)" : "rgba(17,18,24,.12)"},0 60px 120px rgba(0,0,0,${t.dark ? 0.6 : 0.22}),0 18px 40px rgba(0,0,0,${t.dark ? 0.35 : 0.12});transform-origin:50% 60%}
${phone ? `.win{box-shadow:0 0 0 14px #0E0F14,0 0 0 16px rgba(255,255,255,.18),0 60px 120px rgba(0,0,0,.55)}` : ""}
.bar{position:absolute;left:0;right:0;top:0;height:${bar}px;background:${t.dark ? "#171A26" : "#F3F3F6"};border-bottom:1px solid ${t.dark ? "rgba(255,255,255,.08)" : "#E2E3EA"};display:flex;align-items:center;gap:10px;padding-left:20px}
.bar i{width:13px;height:13px;border-radius:50%;display:block}
.page{position:absolute;left:0;top:${bar}px;width:100%;height:${(image.h * k).toFixed(1)}px}
.page img{position:absolute;inset:0;width:100%;height:100%;display:block}
.dim{position:absolute;inset:0;background:${t.dark ? "rgba(6,8,16,.62)" : "rgba(242,241,237,.55)"};opacity:0}
.lift{position:absolute;border-radius:${phone ? 18 : 12}px;opacity:0;background-image:url(${image.file});background-repeat:no-repeat;
background-size:${ww.toFixed(1)}px ${(image.h * k).toFixed(1)}px}
.halo2{position:absolute;border-radius:50%;opacity:0;background:radial-gradient(circle,${rgba(t.accent, t.dark ? 0.45 : 0.25)} 0%,${rgba(t.accent, 0)} 62%)}
.cursor{position:absolute;width:44px;height:44px;opacity:0}
.ripple{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:4px solid ${t.accent};opacity:0}
.tap{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:${rgba("#FFFFFF", 0.45)};box-shadow:0 0 0 3px ${rgba("#FFFFFF", 0.8)};opacity:0}`;
  let world = `<div class="win" id="win">${bar ? `<div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>` : ""}` +
    `<div class="page"><img src="${image.file}" id="sharp">${soft ? `<img src="${soft}" id="soft" style="opacity:0">` : ""}<div class="dim" id="dim"></div></div></div>`;
  let stage = "";
  if (block) {
    const pad = Math.max(10, block.w * 0.12);
    world += `<div class="halo2" id="halo2" style="left:${(block.x - pad * 4).toFixed(1)}px;top:${(block.y - pad * 4).toFixed(1)}px;width:${(block.w + pad * 8).toFixed(1)}px;height:${(block.h + pad * 8).toFixed(1)}px"></div>`;
    world += `<div class="lift" id="lift" style="left:${block.x.toFixed(1)}px;top:${block.y.toFixed(1)}px;width:${block.w.toFixed(1)}px;height:${block.h.toFixed(1)}px;background-position:${(-block.bx).toFixed(1)}px ${(-block.by).toFixed(1)}px"></div>`;
    if (phone) stage += `<div class="tap" id="tap" style="left:${cam.cx}px;top:${cam.cy}px"></div>`;
    else stage += `<div class="ripple" id="ripple" style="left:${cam.cx}px;top:${cam.cy}px"></div>` +
      `<svg class="cursor" id="cursor" viewBox="0 0 44 44" style="left:${(W * (port ? 0.7 : 0.74)).toFixed(0)}px;top:${(H * (port ? 0.62 : 0.8)).toFixed(0)}px"><path d="M8 4 L8 34 L16 26 L22 40 L28 37 L22 23 L33 23 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>`;
  } else if (!phone) {
    stage += `<svg class="cursor" id="cursor" viewBox="0 0 44 44" style="left:${(wx + ww * 0.72).toFixed(0)}px;top:${(wy + wh * 0.78).toFixed(0)}px"><path d="M8 4 L8 34 L16 26 L22 40 L28 37 L22 23 L33 23 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }
  const origin = { left: "0% 50%", right: "100% 50%", top: "50% 0%", bottom: "50% 100%", center: "50% 50%" }[side] || "50% 50%";
  const cfg = { seconds, tempo, mode, cam, W, H, dir, origin, end: 0, phone, cursor: block && !phone ? { x: cam.cx, y: cam.cy } : { x: wx + ww * 0.5, y: wy + wh * 0.45 } };
  cfg.end = Math.round(1000 * Math.min(seconds, mode === "zoom" ? T(4.2) : T(1.8)));
  cue("whoosh-cinematic", T(0.05), 0.32);
  if (mode === "zoom") {
    cue("whoosh-short", T(1.15), 0.32);
    cue("pop", T(1.95), 0.3);
    cue(phone ? "pop" : "click", T(3.5), 0.42);
  }
  const runtime = String.raw`(() => {
const C = window.__S;
const T = (s) => s * C.tempo;
let tl = null;
const build = () => {
  if (tl) return;
  tl = gsap.timeline({ paused: true });
  tl.fromTo("#win", { z: -760, rotationX: 20, rotationY: -15 * C.dir, y: 120, opacity: 0 }, { z: 0, rotationX: 0, rotationY: 0, y: 0, opacity: 1, duration: T(1.5), ease: "expo.out" }, 0);
  if (C.mode === "zoom" && C.cam) {
    tl.fromTo("#world", { x: 0, y: 0, scale: 1, transformOrigin: "0 0" }, { x: C.cam.x, y: C.cam.y, scale: C.cam.scale, duration: T(1.5), ease: "power3.inOut" }, T(1.05));
    tl.to("#dim", { opacity: 1, duration: T(0.7), ease: "power2.out" }, T(1.75));
    tl.to("#soft", { opacity: 1, duration: T(0.7), ease: "power2.out" }, T(1.75));
    tl.set("#lift", { opacity: 1 }, T(1.8));
    tl.to("#halo2", { opacity: 1, duration: T(0.9), ease: "power2.out" }, T(1.85));
    tl.to("#lift", { scale: 1.06, z: 40, boxShadow: "0 0 0 3px " + getComputedStyle(document.documentElement).getPropertyValue("--accent") + ",0 40px 90px rgba(0,0,0,.45),0 0 80px " + getComputedStyle(document.documentElement).getPropertyValue("--glow"), duration: T(0.9), ease: "expo.out" }, T(1.9));
    if (C.phone) {
      tl.fromTo("#tap", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: T(0.25), ease: "power2.out" }, T(3.4));
      tl.to("#tap", { scale: 1.5, opacity: 0, duration: T(0.6), ease: "power2.out" }, T(3.7));
    } else {
      tl.to("#cursor", { opacity: 1, duration: T(0.2) }, T(2.55));
      tl.to("#cursor", { left: C.cursor.x - 6, top: C.cursor.y - 4, duration: T(0.95), ease: "power3.inOut" }, T(2.55));
      tl.to("#cursor", { scale: 0.85, duration: 0.08, yoyo: true, repeat: 1, transformOrigin: "15% 10%" }, T(3.5));
      tl.fromTo("#ripple", { scale: 0.3, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: T(0.7), ease: "power2.out" }, T(3.52));
    }
    tl.to("#world", { scale: "*=1.025", duration: Math.max(0.5, C.seconds - T(2.6)), ease: "sine.inOut" }, T(2.6));
  } else {
    tl.fromTo("#world", { scale: 1, transformOrigin: C.origin }, { scale: 1.07, duration: C.seconds, ease: "sine.inOut" }, 0);
    if (!C.phone) {
      tl.to("#cursor", { opacity: 1, duration: T(0.2) }, T(1.4));
      tl.to("#cursor", { left: C.cursor.x, top: C.cursor.y, duration: T(2), ease: "power2.inOut" }, T(1.4));
    }
  }
  tl.to({}, { duration: C.seconds }, 0);
};
window.__seek = (ms) => { build(); tl.seek(ms / 1000, false); };
window.__end = () => C.end;
window.__holds = () => true;
window.__fast = () => [];
const tick = () => { window.__seek(performance.now()); requestAnimationFrame(tick); };
document.fonts.ready.then(() => requestAnimationFrame(tick));
})();`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
${timelineTag()}
<style>${css}${look.css ? look.css(t) : ""}</style></head><body class="lk-${lookName} fam-${look.family || lookName}">
<div class="stage"><div class="ground">${look.ground ? look.ground(t, seed, port) : groundHtml(look.family || lookName, t, seed, port)}</div><div class="world" id="world">${world}</div>${stage}
<div class="post"><div class="vignette"></div><div class="grain"></div></div></div>
<script>window.__S=${JSON.stringify(cfg)};</script><script>${runtime}</script></body></html>`;
  return { html, cues, W, H, window: { w: ww, h: wh } };
}

// ─── the close ─────────────────────────────────────────────────────────────
// The logo close in a look: the brand's mark, its own
// pixels cut and keyed, arrives on the look's stage in the look's manner, a
// band of light crosses it once, and the site's address follows under it.
// The keyed mark keeps its holes (a letter's counter, a white sign inside a
// blue square), so it stands on the stage itself only when its own ground
// (the header it was captured from) is close to the stage's; otherwise, and
// always in pop (a sticker), it sits on a plate of that ground: a logo is
// never recoloured. close: { style, portrait, brand: { accent }, mark: { file,
// w, h } (served next to the page, page pixels), ground (its own ground's
// hex), site (the address, or "") }. Built on the scenes' runtime: its
// entrances, camera, drift and grain. Returns { html, end, cues, W, H }.
const CLOSE_SFX = {
  launch: [["whoosh-cinematic", 0, 0.3], ["impact-bass-1", 0.62, 0.5], ["sparkle", 1.05, 0.22], ["click-soft", 1.3, 0.28]],
  aurora: [["whoosh-cinematic", 0, 0.3], ["chime", 0.62, 0.3], ["sparkle", 1.05, 0.26], ["pop", 1.3, 0.22]],
  gridline: [["whoosh-short", 0.22, 0.26], ["impact-bass-2", 0.5, 0.42], ["click", 0.95, 0.3], ["key-press", 1.25, 0.3]],
  pop: [["whoosh-short", 0.05, 0.26], ["pop", 0.24, 0.45], ["sparkle", 0.62, 0.24], ["pop", 1.02, 0.36]],
};
function logoHtml(close, { fonts, seconds = 5, icon }) {
  const look = LOOKS[close.style];
  if (!look) return null;
  const port = Boolean(close.portrait);
  const [W, H] = port ? FRAME.port : FRAME.land;
  const fam = look.family || close.style;
  // An even seed: pop closes on the brand's own field, never on cream.
  const h = hash(`logo|${Math.round(close.mark.w)}x${Math.round(close.mark.h)}|${close.site || ""}`);
  const seed = h - (h % 2);
  const b = close.brand || {};
  const t = look.tokens({ accent: b.accent || null, background: b.background || null, accent2: b.accent2 || null }, seed);
  const tempo = Math.max(0.7, Math.min(1, (seconds - 0.6) / 4));
  // An app's icon is its own square art: shown whole with rounded corners,
  // never on a plate.
  const plated = !close.mark.icon && (fam === "pop" || contrast(close.ground, t.ground) >= 1.4);
  const mw = Math.round(close.mark.w * (plated ? 0.8 : 1));
  const mh = Math.round(close.mark.h * (plated ? 0.8 : 1));
  const safe = port ? SAFE.port : SAFE.land;
  const room = { x: safe.x, y: safe.top, w: W - 2 * safe.x, h: H - safe.top - safe.bottom };
  const site = String(close.site || "").trim();
  const siteSize = port ? 48 : 40;
  const gap = port ? 56 : 44;
  const siteH = Math.round(siteSize * 1.2 + 30);
  // Where the mark settles once compose has centred the group in the room.
  const cy = room.y + room.h / 2 - (site ? (gap + siteH + (fam === "gridline" ? 30 : 0)) / 2 : 0);
  const A = (a, at, d, more = "") => ` data-a="${a}" data-t="${at}" data-d="${d}"${more}`;
  const padY = Math.max(30, Math.round(0.3 * mh));
  const padX = Math.max(44, Math.round(0.12 * mw + 20));
  const holdW = mw + (plated ? 2 * padX : 0);
  const enter = {
    launch: A("card", 0.1, 0.75),
    aurora: A("card", 0.1, 0.8) + ` data-float="-10,3.2,0" data-ft="${(1.6 * tempo).toFixed(2)}"`,
    gridline: close.style === "journal" ? A("up", 0.28, 1) + ` data-y="26"` : A("to", 0.3, 0.9) + ` data-e="power3.inOut" data-to='{"clipPath":"inset(-60px -60px -60px -60px)"}' style="clip-path:inset(-60px ${holdW + 60}px -60px -60px)"`,
    pop: A("pop", 0.2, 0.8) + ` data-from="0.3"`,
  }[fam];
  // The mark sharpens out of a blur, and a band of light crosses it inside
  // its own outline (a white mark takes no visible light).
  const blur = fam === "launch" || fam === "aurora" ? 16 : close.style === "journal" ? 8 : 0;
  const markHtml = `<div class="lg-mark${close.mark.icon ? " icon" : ""}" style="width:${mw}px;height:${mh}px;${blur ? `filter:blur(${blur}px)` : ""}"${blur ? A("to", 0.16, 0.95) + ` data-to='{"filter":"blur(0px)"}'` : ""}>` +
    `<img src="${esc(close.mark.file)}" alt=""><div class="lg-sheen"${A("to", fam === "pop" ? 0.55 : 0.98, 0.9)} data-e="power2.inOut" data-to='{"backgroundPosition":"0% 0%"}'></div></div>`;
  const pad = `${padY}px ${padX}px`;
  const hold = `<div class="lg-hold"${enter}>${plated ? `<div class="lg-plate" style="background:${close.ground};padding:${pad}">${markHtml}</div>` : markHtml}</div>`;
  const bar = fam === "gridline" ? `<i class="lg-bar"${A("grow-x", 0.92, 0.7)} data-o="50% 50%"></i>` : "";
  const glyph = { launch: "globe-simple", aurora: "globe-simple", gridline: "arrow-right", pop: "hand-pointing" }[fam];
  const siteHtml = site
    ? `<div class="lg-site-hold"${fam === "pop" ? A("pop", 1, 0.7) + ` data-from="0.5"` : A("up", 1.22, 0.8) + ` data-y="22"`}><div class="lg-site">` +
      `${close.style === "journal" ? "" : `<span class="ic">${icon(glyph, "bold", "")}</span>`}<span>${esc(site)}</span></div></div>`
    : "";
  // A glow behind the mark (launch, aurora), and the page's rules (gridline).
  const glowR = Math.round(Math.max(mw, mh + (plated ? 2 * padY : 0)) * (port ? 0.95 : 0.8));
  const deco = fam === "launch" || fam === "aurora"
    ? `<div class="abs" style="left:${Math.round(W / 2 - glowR)}px;top:${Math.round(cy - glowR)}px;width:${2 * glowR}px;height:${2 * glowR}px;border-radius:50%;` +
      `background:radial-gradient(circle,${rgba(t.accent, fam === "launch" ? 0.34 : 0.3)} 0%,${rgba(t.accent, 0.1)} 34%,${rgba(t.accent, 0)} 66%)"${A("fade", 0.2, 1.4)} data-drift="0,0,1.12"></div>`
    : "";
  const markCss = {
    launch: `.lg-plate{border-radius:28px;box-shadow:0 0 0 1px rgba(255,255,255,.16),0 40px 100px rgba(0,0,0,.55),0 0 120px ${rgba(t.accent, 0.3)}}
.lg-site{padding:14px 28px 14px 22px;border-radius:999px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-family:var(--label),monospace;color:var(--fg)}
.lg-site .ic{color:var(--accent)}`,
    aurora: `.lg-plate{border-radius:40px;box-shadow:0 0 0 1.5px rgba(255,255,255,.4),0 50px 120px rgba(6,4,30,.5)}
.lg-site{padding:14px 30px 14px 24px;border-radius:999px;background:rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 0 0 1px rgba(255,255,255,.18);font-weight:600;color:#fff}`,
    gridline: close.style === "journal"
      ? `.lg-plate{border-radius:2px;box-shadow:0 0 0 1px rgba(26,25,22,.22),0 16px 34px rgba(26,25,22,.08)}
.lg-bar{height:1px;width:${Math.round(Math.min(room.w, Math.max(mw, 360) * 1.1))}px;background:var(--fg);box-shadow:0 5px 0 var(--fg)}
.lg-site{font-family:var(--head),serif;font-style:italic;font-weight:600;font-size:${Math.round(siteSize * 1.25)}px;color:var(--accent)}`
      : `.lg-plate{border-radius:0;box-shadow:0 0 0 1px rgba(17,18,24,.14),14px 14px 0 var(--accent)}
.lg-bar{height:8px;width:120px;background:var(--accent)}
.lg-site{font-family:var(--label),monospace;font-weight:500;color:var(--fg);letter-spacing:.02em}
.lg-site .ic{color:var(--accent)}`,
    pop: `.lg-plate{border-radius:32px;box-shadow:0 0 0 5px #15131A,12px 14px 0 #15131A;transform:rotate(-2deg)}
.lg-site{padding:14px 30px 14px 24px;border-radius:999px;background:${t.accent};color:#15131A;box-shadow:0 0 0 4px #15131A,6px 7px 0 #15131A;font-family:var(--label),monospace;font-weight:700;transform:rotate(2deg)}`,
  }[fam];
  const css = `.lg{position:absolute;left:50%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:${gap}px}
.lg>*{position:relative;flex:none}
.lg-plate{position:relative;display:block}
.lg-mark{position:relative}
.lg-mark.icon{border-radius:22.4%;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 40px 90px rgba(0,0,0,.4)}
.lg-mark img,.lg-sheen{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.lg-sheen{-webkit-mask:url(${esc(close.mark.file)}) 0 0/100% 100% no-repeat;mask:url(${esc(close.mark.file)}) 0 0/100% 100% no-repeat;
background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,${fam === "launch" || fam === "aurora" ? 0.75 : 0.6}) 50%,transparent 58%) 100% 0/300% 100% no-repeat}
.lg-site{display:inline-flex;align-items:center;gap:14px;font-size:${siteSize}px;line-height:1.2;white-space:nowrap}
.lg-site .ic{width:1.05em;height:1.05em}
.lg-bar{display:block;margin:${close.style === "journal" ? "0" : `-${Math.round(gap * 0.4)}px 0`}}
${markCss}`;
  const end = Math.min(seconds, 1.95 * tempo + 0.35);
  const cues = CLOSE_SFX[fam].filter(([sfx, at]) => sfx && (site || at < 1.2)).map(([sfx, at, volume]) => ({ sfx, at: +(at * tempo).toFixed(3), volume }));
  const config = { seconds, end: Math.round(end * 1000), tempo, seed, camera: camera(fam, seed, port), port, W, H, room, grow: 1, compose: true };
  const html = `<!doctype html><html lang="${esc(close.lang || "en")}"><head><meta charset="utf-8">
${timelineTag()}
<style>${fonts.css}${BASE_CSS(t, port, fonts)}${css}${look.css ? look.css(t) : ""}</style></head>
<body class="lk-${close.style} fam-${fam} t-logo ${port ? "port" : "land"}">
<div class="stage"><div class="ground">${look.ground ? look.ground(t, seed, port) : groundHtml(fam, t, seed, port)}</div><div class="world" id="world">${deco}<div class="content"><div class="lg">${hold}${bar}${siteHtml}</div></div></div>
<div class="post"><div class="vignette"></div><div class="grain"></div></div></div>
<script>window.__V2=${JSON.stringify(config)};</script><script>${RUNTIME}</script>
</body></html>`;
  return { html, end, cues, W, H, plated };
}

// ─── devices ───────────────────────────────────────────────────────────────
// A phone's own screen in a drawn phone (the phone clip) and a whole page
// scrolled in a browser window (the scroll clip, 16:9), in a look: the
// device comes in from depth and rests at a slight turn on the look's stage
// while its screen scrolls from the top, a touch (a phone) or the scroll bar
// (a window) showing the scroll. image: the screen or the page ({ file, w,
// h }: the capture's own size; the file served may be cut to `use` of its
// height and made smaller, in the same shape). top: the colour of its first
// rows, for the phone's status bar. Returns { html, cues, W, H, use,
// scrolled } (use: the share of the capture's height that shows; scrolled:
// how far it moves, in the capture's pixels).
function deviceHtml({ mode, look: lookName, port, seconds, accent, image, top = "#FFFFFF", fonts = null, brand = null }) {
  const look = LOOKS[lookName];
  const fam = look.family || lookName;
  const [W, H] = port ? FRAME.port : FRAME.land;
  const seed = hash(`${mode}|${image.w}x${image.h}|${seconds}`);
  const t = look.tokens({ accent: accent ? `#${String(accent).replace("#", "").toUpperCase()}` : null, background: (brand && brand.background) || null, accent2: (brand && brand.accent2) || null }, seed);
  const tempo = Math.max(0.62, Math.min(1, (seconds - 0.6) / 4.6));
  const T = (s) => +(s * tempo).toFixed(3);
  const dir = seed % 2 ? 1 : -1;
  const ia = image.w / image.h;
  const phone = mode === "phone";
  let dev;
  if (phone) {
    // The screen (a status bar over the view) inside a bezel, the phone 82%
    // of the frame's height (68% in 9:16). A capture as wide as a phone's
    // screen or wider (a store screenshot) shows whole under the bar, cut at
    // its sides past 0.6; a taller one (a whole phone page) fills a 19.5:9
    // screen and scrolls, at most 0.45 screens a second.
    const b = port ? 18 : 15;
    const S = Math.round((port ? 0.68 : 0.82) * H) - 2 * b;
    const tall = ia < 0.4615;
    const sw = Math.round(tall ? 0.4615 * S : S / (1 / Math.min(0.6, ia) + 0.12));
    const bar = Math.round(0.12 * sw);
    const view = S - bar;
    const imgW = ia > 0.6 ? Math.round(view * ia) : sw;
    const imgH = Math.round(imgW / ia);
    dev = { b, sw, sh: S, bar, view, imgW, imgH, w: sw + 2 * b, h: S + 2 * b };
    dev.travel = tall && imgH - view > 0.08 * view ? Math.min(imgH - view, 0.45 * view * Math.max(0, seconds - 1.4)) : 0;
  } else {
    const bar = 44;
    const w = Math.round(0.66 * W);
    const h = H - 150;
    const view = h - bar;
    const full = w / ia;
    dev = { bar, w, h, view, imgW: w, imgH: Math.round(full) };
    dev.travel = Math.max(0, Math.min(full - view, 0.4 * view * Math.max(0, seconds - 1.3)));
  }
  const x = Math.round((W - dev.w) / 2);
  const y = Math.round((H - dev.h) / 2 - (phone ? (port ? 70 : 10) : 10));
  const use = Math.min(1, (dev.view + dev.travel + 4) / dev.imgH);
  const tilt = fam === "launch" || fam === "aurora" || phone;
  const rest = phone ? { rotationY: 9 * dir, rotationX: 3 } : tilt ? { rotationY: -7 * dir, rotationX: 8 } : { rotationY: 0, rotationX: 0 };
  const cues = [];
  const cue = (sfx, at, volume) => cues.push({ sfx, at, volume });
  cue("whoosh-cinematic", T(0.05), 0.3);
  cue(fam === "aurora" || fam === "pop" ? "pop" : "click-soft", T(0.8), 0.22);
  if (dev.travel) cue(phone ? "click-soft" : "whoosh-short", T(1.15), phone ? 0.3 : 0.16);
  const scrollStart = T(1.3);
  const scrollFor = Math.max(0.6, seconds - 0.5 - scrollStart);
  const ink = luminance(top) > 0.45 ? "#111111" : "#FFFFFF";
  const r = phone ? Math.round(0.14 * dev.w) : 18;
  const behind = {
    launch: `<div class="abs halo-d" style="left:${Math.round(W / 2 - dev.h * 0.75)}px;top:${Math.round(y + dev.h / 2 - dev.h * 0.75)}px;width:${Math.round(dev.h * 1.5)}px;height:${Math.round(dev.h * 1.5)}px;border-radius:50%;background:radial-gradient(circle,${rgba(t.accent, 0.3)} 0%,${rgba(t.accent, 0.08)} 36%,${rgba(t.accent, 0)} 66%)"></div>`,
    aurora: "",
    gridline: `<div class="abs" id="slab" style="left:${x + (phone ? 70 : 46) * dir}px;top:${y + (phone ? 60 : 40)}px;width:${dev.w}px;height:${dev.h}px;background:${t.accent};border-radius:${phone ? r : 4}px;opacity:0"></div>`,
    pop: `<div class="abs" id="slab" style="left:${Math.round(W / 2 - dev.h * 0.48)}px;top:${Math.round(y + dev.h / 2 - dev.h * 0.48)}px;width:${Math.round(dev.h * 0.96)}px;height:${Math.round(dev.h * 0.96)}px;border-radius:50%;background:${t.dark ? "rgba(255,255,255,.14)" : rgba(t.brand || t.accent, 0.16)};opacity:0"></div>`,
  }[fam];
  // What stands behind the device (a glow, a slab, its shadow) lies in the
  // ground, outside the 3D world: in it a flat slab cut through the turned
  // phone and covered half of it.
  const css = `${fonts ? fonts.css : ""}${BASE_CSS(t, port, fonts || { head: "P", body: "P", label: "P", weight: {} })}
.dev{position:absolute;left:${x}px;top:${y}px;width:${dev.w}px;height:${dev.h}px;transform-style:flat;backface-visibility:hidden}
.floor{position:absolute;left:${x + dev.w * 0.1}px;top:${y + dev.h - 20}px;width:${dev.w * 0.8}px;height:60px;border-radius:50%;background:rgba(0,0,0,${t.dark ? 0.55 : 0.22});filter:blur(26px)}
.scr{position:absolute;overflow:hidden;background:#fff}
.scr img{position:absolute;left:0;top:0;display:block}
${phone ? `.dev{border-radius:${r}px;background:#0E0F14;box-shadow:inset 0 0 0 2px #4B4D55,0 0 0 1px rgba(255,255,255,${t.dark ? 0.12 : 0}),0 50px 110px rgba(0,0,0,${t.dark ? 0.6 : 0.28}),0 16px 36px rgba(0,0,0,${t.dark ? 0.4 : 0.14})}
.dev:before,.dev:after{content:"";position:absolute;width:5px;border-radius:3px;background:#2B2C31}
.dev:before{left:-4px;top:${Math.round(dev.h * 0.2)}px;height:${Math.round(dev.h * 0.07)}px;box-shadow:0 ${Math.round(dev.h * 0.1)}px 0 #2B2C31}
.dev:after{right:-4px;top:${Math.round(dev.h * 0.26)}px;height:${Math.round(dev.h * 0.1)}px}
.scr{left:${dev.b}px;top:${dev.b}px;width:${dev.sw}px;height:${dev.sh}px;border-radius:${r - dev.b}px}
.sb{position:absolute;left:0;top:0;width:100%;height:${dev.bar}px;background:${top};color:${ink};z-index:2;font:600 ${Math.round(0.4 * dev.bar)}px/1 var(--body),${FALLBACK}}
.sb .tm{position:absolute;left:${Math.round(0.11 * dev.sw)}px;top:50%;transform:translateY(-50%)}
.sb .isl{position:absolute;left:50%;top:${Math.round(0.2 * dev.bar)}px;width:${Math.round(0.3 * dev.sw)}px;height:${Math.round(0.58 * dev.bar)}px;margin-left:-${Math.round(0.15 * dev.sw)}px;border-radius:999px;background:#000}
.sb .bat{position:absolute;right:${Math.round(0.09 * dev.sw)}px;top:50%;width:${Math.round(0.075 * dev.sw)}px;height:${Math.round(0.28 * dev.bar)}px;transform:translateY(-50%);border-radius:4px;box-shadow:inset 0 0 0 2px ${rgba(ink, 0.55)}}
.sb .bat:after{content:"";position:absolute;left:3px;top:3px;bottom:3px;width:72%;border-radius:2px;background:${ink}}
.sb .sig{position:absolute;right:${Math.round(0.2 * dev.sw)}px;top:50%;transform:translateY(-50%);display:flex;align-items:flex-end;gap:3px;height:${Math.round(0.28 * dev.bar)}px}
.sb .sig i{display:block;width:4px;border-radius:1px;background:${ink}}
.view{position:absolute;left:0;top:${dev.bar}px;width:100%;height:${dev.view}px;overflow:hidden}
.touch{position:absolute;left:50%;top:${Math.round(dev.bar + dev.view * 0.72)}px;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(255,255,255,.5);box-shadow:0 0 0 3px rgba(255,255,255,.85),0 6px 18px rgba(0,0,0,.25);opacity:0;z-index:3}`
    : `.dev{border-radius:${r}px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px ${t.dark ? "rgba(255,255,255,.14)" : "rgba(17,18,24,.12)"},0 60px 120px rgba(0,0,0,${t.dark ? 0.6 : 0.22}),0 18px 40px rgba(0,0,0,${t.dark ? 0.35 : 0.12})${fam === "pop" ? ",14px 16px 0 #15131A" : ""}}
.bar{position:absolute;left:0;right:0;top:0;height:${dev.bar}px;background:${t.dark ? "#171A26" : "#F3F3F6"};border-bottom:1px solid ${t.dark ? "rgba(255,255,255,.08)" : "#E2E3EA"};display:flex;align-items:center;gap:10px;padding-left:20px}
.bar i{width:13px;height:13px;border-radius:50%;display:block}
.view{position:absolute;left:0;top:${dev.bar}px;width:100%;height:${dev.view}px;overflow:hidden}
.track{position:absolute;right:6px;top:${dev.bar + 6}px;width:8px;height:${dev.view - 12}px;border-radius:4px;background:rgba(17,18,24,.06)}
.thumb{position:absolute;left:0;top:0;width:8px;height:${Math.max(40, Math.round((dev.view - 12) * Math.min(1, dev.view / dev.imgH)))}px;border-radius:4px;background:rgba(17,18,24,.35)}`}
.view img{width:${dev.imgW}px;height:auto;left:${phone && dev.imgW > dev.sw ? -Math.round((dev.imgW - dev.sw) / 2) : 0}px}`;
  const screen = phone
    ? `<div class="scr"><div class="sb"><span class="tm">9:41</span><span class="isl"></span><span class="sig"><i style="height:40%"></i><i style="height:60%"></i><i style="height:80%"></i><i style="height:100%"></i></span><span class="bat"></span></div>` +
      `<div class="view"><img id="page" src="${esc(image.file)}" alt=""></div>${dev.travel ? `<div class="touch" id="touch"></div>` : ""}</div>`
    : `<div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>` +
      `<div class="view"><img id="page" src="${esc(image.file)}" alt=""></div><div class="track"><div class="thumb" id="thumb"></div></div>`;
  const cfg = { seconds, T: tempo, dir, rest, travel: Math.round(dev.travel), scrollStart, scrollFor, phone, thumb: phone ? 0 : Math.max(0, (dev.view - 12) - Math.max(40, Math.round((dev.view - 12) * Math.min(1, dev.view / dev.imgH)))) * Math.min(1, dev.travel / Math.max(1, dev.imgH - dev.view)), end: Math.round(1000 * Math.min(seconds, T(1.6))) };
  const runtime = String.raw`(() => {
const C = window.__S;
const T = (s) => s * C.T;
let tl = null;
const build = () => {
  if (tl) return;
  tl = gsap.timeline({ paused: true });
  tl.fromTo("#dev", { z: -820, rotationY: C.rest.rotationY + 20 * C.dir, rotationX: C.rest.rotationX + 12, y: 160, opacity: 0 },
    { z: 0, rotationY: C.rest.rotationY, rotationX: C.rest.rotationX, y: 0, opacity: 1, duration: T(1.4), ease: "expo.out" }, 0);
  tl.fromTo("#floor", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: T(1.2), ease: "power2.out" }, T(0.2));
  if (document.getElementById("slab")) tl.fromTo("#slab", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: T(0.9), ease: "expo.out" }, T(0.35));
  // The rest of the clip the device keeps turning a little toward the viewer.
  tl.to("#dev", { rotationY: C.rest.rotationY * 0.45, rotationX: C.rest.rotationX * 0.5, duration: Math.max(0.5, C.seconds - T(1.4)), ease: "sine.inOut" }, T(1.4));
  if (C.travel) {
    tl.to("#page", { y: -C.travel, duration: C.scrollFor, ease: "power1.inOut" }, C.scrollStart);
    if (C.phone) {
      tl.fromTo("#touch", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: T(0.2), ease: "power2.out" }, C.scrollStart - T(0.15));
      tl.to("#touch", { y: -160, duration: Math.min(1.2, C.scrollFor), ease: "power2.inOut" }, C.scrollStart);
      tl.to("#touch", { opacity: 0, duration: T(0.3) }, C.scrollStart + Math.min(1.2, C.scrollFor) - T(0.2));
    } else tl.to("#thumb", { y: C.thumb, duration: C.scrollFor, ease: "power1.inOut" }, C.scrollStart);
  }
  tl.to("#world", { scale: 1.04, duration: C.seconds, ease: "sine.inOut" }, 0);
  tl.to({}, { duration: C.seconds }, 0);
};
window.__seek = (ms) => { build(); tl.seek(ms / 1000, false); };
window.__end = () => C.end;
window.__holds = () => true;
window.__fast = () => [];
const tick = () => { window.__seek(performance.now()); requestAnimationFrame(tick); };
document.fonts.ready.then(() => requestAnimationFrame(tick));
})();`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
${timelineTag()}
<style>${css}${look.css ? look.css(t) : ""}</style></head><body class="lk-${lookName} fam-${fam}">
<div class="stage"><div class="ground">${look.ground ? look.ground(t, seed, port) : groundHtml(fam, t, seed, port)}${behind}<div class="floor" id="floor"></div></div><div class="world" id="world"><div class="dev" id="dev">${screen}</div></div>
<div class="post"><div class="vignette"></div><div class="grain"></div></div></div>
<script>window.__S=${JSON.stringify(cfg)};</script><script>${runtime}</script></body></html>`;
  return { html, cues, W, H, use, drawnW: dev.imgW, scrolled: Math.round((dev.travel * image.w) / dev.imgW) };
}

// ─── store screenshots ─────────────────────────────────────────────────────
// An app's store screenshots side by side, as cards that come in from depth
// one after another and settle in a shallow fan, the middle one in front.
// A store screenshot is often a picture of its own (a phone drawn on a
// colour with a line of text over it), so it is shown whole, never put in a
// second phone. images: [{ file, w, h }] served next to the page (two or
// three). Returns { html, cues, W, H }.
function galleryHtml({ look: lookName, port, seconds, accent, images, fonts = null, brand = null }) {
  const look = LOOKS[lookName];
  const fam = look.family || lookName;
  const [W, H] = port ? FRAME.port : FRAME.land;
  const seed = hash(`gallery|${images.map((i) => `${i.w}x${i.h}`).join(",")}|${seconds}`);
  const t = look.tokens({ accent: accent ? `#${String(accent).replace("#", "").toUpperCase()}` : null, background: (brand && brand.background) || null, accent2: (brand && brand.accent2) || null }, seed);
  const tempo = Math.max(0.62, Math.min(1, (seconds - 0.6) / 4.6));
  const T = (x) => +(x * tempo).toFixed(3);
  const n = Math.min(3, images.length);
  const shots = images.slice(0, n);
  // Every card the same height; the middle one a little larger.
  const ch = Math.round(H * (port ? 0.5 : 0.74));
  const widths = shots.map((im) => Math.round((ch * im.w) / im.h));
  const gap = port ? 40 : 64;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  // Cards overlap when the row is wider than the frame.
  const squeeze = Math.min(1, (W * 0.9 - Math.max(...widths)) / Math.max(1, total - Math.max(...widths)));
  const r = Math.round(Math.min(...widths) * 0.07);
  const mid = (n - 1) / 2;
  let x = (W - (squeeze < 1 ? W * 0.9 : total)) / 2;
  const cards = shots.map((im, i) => {
    const w = widths[i];
    const off = i - mid;
    const card = { i, w, h: ch, x: Math.round(x), y: Math.round((H - ch) / 2 - (port ? 60 : 0)), off,
      rest: fam === "pop" ? { rotation: off * 4, rotationY: 0, z: off ? -40 : 40 } : fam === "gridline" ? { rotation: 0, rotationY: 0, z: off ? -30 : 30 } : { rotation: 0, rotationY: -off * 16, z: off ? -90 : 50 } };
    x += (w + gap) * (squeeze < 1 ? squeeze : 1);
    return card;
  });
  const cues = [{ sfx: "whoosh-cinematic", at: T(0.05), volume: 0.3 }];
  cards.forEach((c, k) => cues.push({ sfx: fam === "pop" || fam === "aurora" ? "pop" : "click-soft", at: T(0.55 + k * 0.22), volume: 0.3 }));
  const css = `${fonts ? fonts.css : ""}${BASE_CSS(t, port, fonts || { head: "P", body: "P", label: "P", weight: {} })}
.shot{position:absolute;overflow:hidden;border-radius:${r}px;background:#fff;transform-style:flat;backface-visibility:hidden}
.shot img{position:absolute;inset:0;width:100%;height:100%;display:block}
${{
    launch: `.shot{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 50px 110px rgba(0,0,0,.6)}`,
    aurora: `.shot{box-shadow:0 0 0 1.5px rgba(255,255,255,.35),0 40px 100px rgba(6,4,30,.5)}`,
    gridline: `.shot{border-radius:${Math.round(r * 0.4)}px;box-shadow:0 0 0 1px rgba(17,18,24,.14),0 24px 50px rgba(17,18,24,.12)}`,
    pop: `.shot{box-shadow:0 0 0 5px #15131A,12px 14px 0 #15131A}`,
  }[fam]}
.floor{position:absolute;border-radius:50%;background:rgba(0,0,0,${t.dark ? 0.5 : 0.18});filter:blur(30px)}`;
  const glow = fam === "launch" || fam === "aurora"
    ? `<div class="abs" data-drift="0,0,1.1" style="left:${Math.round(W / 2 - ch * 0.8)}px;top:${Math.round(H / 2 - ch * 0.8)}px;width:${Math.round(ch * 1.6)}px;height:${Math.round(ch * 1.6)}px;border-radius:50%;background:radial-gradient(circle,${rgba(t.accent, 0.28)} 0%,${rgba(t.accent, 0.08)} 38%,${rgba(t.accent, 0)} 66%)"></div>`
    : fam === "gridline"
      ? `<div class="abs" id="slab" style="left:${cards[Math.floor(mid)].x + 40}px;top:${cards[0].y + 40}px;width:${cards[Math.floor(mid)].w}px;height:${ch}px;background:${t.accent};opacity:0"></div>`
      : "";
  const floor = `<div class="floor" id="floor" style="left:${Math.round(W / 2 - total * 0.4)}px;top:${cards[0].y + ch - 30}px;width:${Math.round(total * 0.8)}px;height:70px"></div>`;
  // The middle card is drawn last, so it stands in front.
  const order = [...cards].sort((a, b) => Math.abs(b.off) - Math.abs(a.off));
  const world = order.map((c) => `<div class="shot" id="s${c.i}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px"><img src="${esc(shots[c.i].file)}" alt=""></div>`).join("");
  const cfg = { seconds, T: tempo, cards: cards.map((c) => ({ id: `#s${c.i}`, rest: c.rest, off: c.off })), end: Math.round(1000 * Math.min(seconds, T(1.2 + 0.22 * n))) };
  const runtime = String.raw`(() => {
const C = window.__S;
const T = (s) => s * C.T;
let tl = null;
const build = () => {
  if (tl) return;
  tl = gsap.timeline({ paused: true });
  C.cards.forEach((c, k) => {
    tl.fromTo(c.id, { z: -900, rotationX: 24, rotationY: c.rest.rotationY * 2.2, rotation: c.rest.rotation * 2, y: 180, opacity: 0 },
      { z: c.rest.z, rotationX: 0, rotationY: c.rest.rotationY, rotation: c.rest.rotation, y: 0, opacity: 1, duration: T(1.3), ease: "expo.out" }, T(0.2 + k * 0.22));
    tl.to(c.id, { y: -10 - 4 * k, duration: 3.2 + 0.4 * k, ease: "sine.inOut", yoyo: true, repeat: 3 }, T(1.5 + k * 0.22));
  });
  tl.fromTo("#floor", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: T(1.2), ease: "power2.out" }, T(0.3));
  if (document.getElementById("slab")) tl.fromTo("#slab", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: T(0.8), ease: "expo.out" }, T(0.9));
  tl.fromTo("#world", { scale: 1 }, { scale: 1.05, duration: C.seconds, ease: "sine.inOut" }, 0);
  tl.to({}, { duration: C.seconds }, 0);
};
window.__seek = (ms) => { build(); tl.seek(ms / 1000, false); };
window.__end = () => C.end;
window.__holds = () => true;
window.__fast = () => [];
})();`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
${timelineTag()}
<style>${css}${look.css ? look.css(t) : ""}</style></head><body class="lk-${lookName} fam-${fam}">
<div class="stage"><div class="ground">${look.ground ? look.ground(t, seed, port) : groundHtml(fam, t, seed, port)}${glow}${floor}</div><div class="world" id="world">${world}</div>
<div class="post"><div class="vignette"></div><div class="grain"></div></div></div>
<script>window.__S=${JSON.stringify(cfg)};</script><script>${runtime}</script></body></html>`;
  return { html, cues, W, H };
}

const supports = (style, type) => Boolean(LOOKS[style]) && Boolean(require("./types")[type]);

module.exports = { LOOKS, FRAME, sceneHtml, screenHtml, logoHtml, deviceHtml, galleryHtml, supports, helpers: { rgb, mix, rgba, readable, contrast, turn, luminance, saturation, esc, hash } };
