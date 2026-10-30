"use strict";
// ─── the scene types ───────────────────────────────────────────────────────
// One builder per scene type of scene.js: (scene, k) → { html,
// css, end }. Elements say how they enter with data-a (rise, rise-chars,
// rise-lines, up, pop, zoom, card, wipe, grow-x/y, draw, count, scramble,
// type, to…), when with data-t, for how long with data-d, and their stagger
// with data-s; the page's runtime builds one timeline from them, so a type
// only lays out and times. `end` is when its last entrance is over. Every
// word comes from the scene, exactly as written; nothing here adds text.
//
// Frames are 1920x1080 or 1080x1920; words stay inside the margins
// (k.safe), with more room at the bottom of a 9:16 frame, where
// short-video apps put their own buttons.

// ─── shared parts ──────────────────────────────────────────────────────────
const KIT_CSS = (k) => `
.title{position:absolute;margin:0}
.kick{position:absolute;display:flex;align-items:center;gap:14px;font-size:${k.sz(24, 26)}px;color:var(--muted)}
.kick .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 18px var(--accent);flex:none}
.fam-gridline .kick .dot,.fam-pop .kick .dot{box-shadow:none;border-radius:0}
.body{position:absolute;font-size:${k.sz(44, 46)}px;line-height:1.3;color:var(--muted)}
.card{position:absolute;border-radius:30px;transform-style:flat;backface-visibility:hidden}
.stk{position:absolute;display:flex;flex-direction:column}
.stk>*{position:relative;margin:0}
.fam-launch .card{background:linear-gradient(180deg,var(--surface2),var(--surface));box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 0 0 1px rgba(255,255,255,.07),0 34px 80px rgba(0,0,0,.5)}
.fam-aurora .card{background:linear-gradient(160deg,rgba(255,255,255,.19),rgba(255,255,255,.05));box-shadow:inset 0 1px 0 rgba(255,255,255,.42),inset 0 0 0 1px rgba(255,255,255,.16),0 34px 90px rgba(6,4,30,.5)}
.fam-gridline .card{background:#fff;border-radius:4px;box-shadow:0 0 0 1px rgba(17,18,24,.12),0 22px 50px rgba(17,18,24,.10)}
.fam-pop .card{background:#fff;color:#15131A;border-radius:32px;box-shadow:0 0 0 5px #15131A,12px 14px 0 #15131A}
.fam-pop .card .muted,.fam-pop .card .sub{color:#4A4652}
.box{display:grid;place-items:center;flex:none}
.fam-launch .box{border-radius:26%;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.11);color:var(--accent)}
.fam-aurora .box{border-radius:28%;background:linear-gradient(145deg,rgba(255,255,255,.32),rgba(255,255,255,.06));color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 0 70px var(--glow2)}
.fam-gridline .box{border-radius:3px;background:var(--accent);color:var(--on)}
.fam-pop .box{border-radius:50%;background:var(--accent);color:var(--on);box-shadow:0 0 0 5px #15131A}
.fam-pop.t-features .box,.fam-pop.t-numbers .box,.fam-pop.t-notify .box{background:${k.t.brand || k.t.accent};color:#fff}
.fam-launch .mk{color:var(--accent);text-shadow:0 0 46px var(--glow)}
.fam-aurora .mk{color:var(--accent);text-shadow:0 0 56px var(--glow)}
.fam-pop .mk{color:var(--accent)}
.chip{position:absolute;display:inline-flex;align-items:center;gap:14px;padding:12px 24px;border-radius:999px;font-size:${k.sz(24, 26)}px;white-space:nowrap}
.fam-launch .chip{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.13);color:var(--fg)}
.fam-aurora .chip{background:rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 0 0 1px rgba(255,255,255,.18)}
.fam-gridline .chip{border-radius:2px;background:var(--fg);color:var(--ground)}
.fam-pop .chip{background:#15131A;color:#fff}
.halo{position:absolute;border-radius:50%;pointer-events:none}
.rule{position:absolute;height:3px;background:var(--fg)}
.fam-launch .rule,.fam-aurora .rule{height:2px;background:linear-gradient(90deg,var(--accent),rgba(255,255,255,0))}
.check path{fill:none;stroke-linecap:round;stroke-linejoin:round}
`;

const R = (n) => Math.round(n);
// Data attributes for an entrance.
const A = (a, t, d, s, extra = "") => ` data-a="${a}" data-t="${(+t).toFixed(2)}"${d ? ` data-d="${d}"` : ""}${s ? ` data-s="${s}"` : ""}${extra}`;
const box = (x, y, w, h, more = "") => `left:${R(x)}px;top:${R(y)}px;width:${R(w)}px;height:${R(h)}px;${more}`;
// The look's sound for a kind of moment.
const SFX = {
  launch: { in: "whoosh-short", item: "click-soft", hit: "impact-bass-1", tick: "click-soft", type: "typing", done: "ping" },
  aurora: { in: "whoosh", item: "pop", hit: "sparkle", tick: "pop", type: "typing", done: "chime" },
  gridline: { in: "whoosh-short", item: "click", hit: "impact-bass-2", tick: "click", type: "key-press", done: "click" },
  pop: { in: "whoosh-short", item: "pop", hit: "sparkle", tick: "pop", type: "typing", done: "sparkle" },
};
const sfx = (k, role, at, vol) => k.cue(SFX[k.fam][role], at, vol);

// The usable frame inside the margins.
const area = (k) => {
  const s = k.safe;
  return { x: s.x, y: s.top, w: k.W - 2 * s.x, h: k.H - s.top - s.bottom, bottom: k.H - s.bottom };
};

// A kicker line (the scene's own), when there is one.
const kicker = (k, text, x, y, t = 0.05, align = "left") =>
  text ? `<div class="kick label" style="left:${R(x)}px;top:${R(y)}px;${align === "center" ? "transform:translateX(-50%);" : ""}"${A("up", t, 0.7)} data-y="16"><span class="dot"></span><span>${k.keep(text)}</span></div>` : "";

// Big type: a box the words must fit, shrunk by the runtime when they do not.
function bigType(k, html, { x, y, w, h, size, min, a = "rise", t = 0.15, d = 1, s = 0.07, align = "left", cls = "", lh = 0.98 }) {
  return `<h1 class="title head fit ${cls}" data-fit="${min || R(size * 0.42)}" style="${box(x, y, w, h)}font-size:${R(size)}px;line-height:${lh};text-align:${align}"${a ? A(a, t, d, s) : ""}>${html}</h1>`;
}

function bodyText(k, text, { x, y, w, h, size, t = 0.7, a = "rise-lines", align = "left", cls = "" }) {
  if (!text) return "";
  return `<p class="body fit ${cls}" data-fit="${R((size || k.sz(44, 46)) * 0.6)}" style="${box(x, y, w, h)}${size ? `font-size:${R(size)}px;` : ""}margin:0;text-align:${align}"${A(a, t, 0.9, 0.08)}>${k.keep(k.plain(text))}</p>`;
}

// Blocks that flow down from (x, y): a title, its second line, a rule, a
// paragraph. Each block keeps its own entrance; only widths are fixed, so a
// title that wraps pushes what follows it down.
const stack = (x, y, w, parts, { gap = 24, align = "left" } = {}) =>
  `<div class="stk" style="left:${R(x)}px;top:${R(y)}px;width:${R(w)}px;gap:${gap}px;align-items:${align === "center" ? "center" : "flex-start"};text-align:${align}">${parts.filter(Boolean).join("")}</div>`;
const flowTitle = (k, html, size, { a = "rise", t = 0.15, d = 1, s = 0.07, cls = "", lh = 0.98, min } = {}) =>
  `<h1 class="head fit ${cls}" data-fit="${min || R(size * 0.42)}" style="width:100%;font-size:${R(size)}px;line-height:${lh}"${a ? A(a, t, d, s) : ""}>${html}</h1>`;
const flowText = (k, text, size, { a = "rise-lines", t = 0.7, cls = "body", colour = "" } = {}) =>
  text ? `<p class="${cls} fit" data-fit="${R(size * 0.6)}" style="width:100%;font-size:${R(size)}px;line-height:1.28;${colour ? `color:${colour};` : ""}"${A(a, t, 0.9, 0.08)}>${k.keep(k.plain(text))}</p>` : "";

const iconBox = (k, name, size, x, y, t, extra = "") =>
  name ? `<div class="box abs" style="${box(x, y, size, size)}font-size:${R(size * 0.5)}px${extra}"${A("pop", t, 0.8)}>${k.icon(name)}</div>` : "";

// A halo of light behind something important (dark looks only).
const halo = (k, cx, cy, r, colour, a = 0.42, t = 0) =>
  k.t.dark ? k.deco(`<div class="halo" style="${box(cx - r, cy - r, 2 * r, 2 * r)}background:radial-gradient(circle,${k.rgba(colour, a)} 0%,${k.rgba(colour, a * 0.25)} 32%,${k.rgba(colour, 0)} 64%)"${A("zoom", t, 1.4, 0, ' data-from="0.4"')}></div>`) : "";

// Cards laid out in a row (landscape) or a column / grid (portrait), each
// settling at a slight angle toward the middle.
function cardSlots(k, n, { top, height, gap = 36, maxW = 560 }) {
  const a = area(k);
  const out = [];
  if (!k.port || n <= 2) {
    const cols = k.port ? 1 : n;
    if (k.port) {
      const h = Math.min(height, (a.bottom - top - gap * (n - 1)) / n);
      for (let i = 0; i < n; i++) out.push({ x: a.x, y: top + i * (h + gap), w: a.w, h, rot: 0 });
      return out;
    }
    const w = Math.min(maxW, (a.w - gap * (cols - 1)) / cols);
    const total = w * cols + gap * (cols - 1);
    const x0 = (k.W - total) / 2;
    for (let i = 0; i < n; i++) {
      const off = i - (n - 1) / 2;
      out.push({ x: x0 + i * (w + gap), y: top, w, h: height, rot: n > 1 ? -off * (k.fam === "gridline" || k.fam === "pop" ? 0 : 7) : 0 });
    }
    return out;
  }
  // Portrait, three or more: a column of shorter cards.
  const h = Math.min(height, (a.bottom - top - gap * (n - 1)) / n);
  for (let i = 0; i < n; i++) out.push({ x: a.x, y: top + i * (h + gap), w: a.w, h, rot: 0 });
  return out;
}

// ─── statements ────────────────────────────────────────────────────────────
function opener(scene, k) {
  const a = area(k);
  const L = k.fam;
  const css = `.op-sub{color:var(--accent);font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.03em;line-height:1.04}
.ghost{position:absolute;border-radius:24px}
.fam-launch .ghost{background:linear-gradient(180deg,var(--surface2),var(--surface));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 30px 70px rgba(0,0,0,.45)}
.ghost i{position:absolute;left:28px;height:12px;border-radius:6px;background:rgba(255,255,255,.08)}
.ghost b{position:absolute;left:28px;top:28px;width:40px;height:40px;border-radius:12px;background:var(--accent);opacity:.85;box-shadow:0 0 30px var(--glow)}
.op-caret{display:inline-block;width:.07em;height:.8em;margin-left:.05em;background:var(--accent);vertical-align:-.04em;box-shadow:0 0 22px var(--accent);animation:opblink 1s steps(1) infinite}
@keyframes opblink{50%{opacity:0}}
.disc{position:absolute;border-radius:50%;background:var(--accent)}
.shape{position:absolute}
.fam-pop .op-pill{display:inline-block;padding:.12em .5em;border-radius:999px;background:var(--accent);color:var(--on);transform:rotate(-3deg);box-shadow:0 0 0 5px #15131A,8px 10px 0 #15131A}`;
  const title = k.plain(scene.title);
  const sub = scene.text ? k.keep(k.plain(scene.text)) : "";
  // Type that fills its width: short titles are set big.
  const fill = (w, max, min) => Math.max(min, Math.min(max, R(w / Math.max(4, title.length * 0.5))));
  let html = "";
  if (L === "launch") {
    const w = k.sz(1240, a.w);
    const size = fill(w, k.sz(190, 140), k.sz(96, 80));
    html += stack(a.x + 10, k.sz(330, 620), w, [
      scene.kicker ? `<div class="label" style="font-size:${k.sz(24, 26)}px;color:var(--muted);display:flex;gap:14px;align-items:center"${A("up", 0.05, 0.7)}><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 18px var(--accent)"></span>${k.keep(scene.kicker)}</div>` : "",
      `<h1 class="head fit" data-fit="${R(size * 0.45)}" style="width:100%;font-size:${size}px;line-height:.98"><span${A("type", 0.2, 0, 0, ` data-v="${k.esc(title)}" data-cps="${title.length > 22 ? 26 : 16}"`)}>${k.esc(title)}</span><span class="op-caret"></span></h1>`,
      sub ? `<p class="op-sub fit" data-fit="40" style="width:100%;font-size:${R(size * 0.56)}px"${A("rise", 1.3, 1, 0.08)}>${sub}</p>` : "",
    ], { gap: k.sz(26, 30) });
    const panels = k.port
      ? [[100, 230, 520, 300, -420], [560, 380, 440, 260, -700], [180, 1420, 760, 300, -560]]
      : [[1180, 110, 560, 330, -380], [1380, 470, 460, 280, -640], [980, 600, 520, 300, -900]];
    panels.forEach(([x, y, w2, h, z], i) => {
      const lines = [0, 1, 2].map((j) => `<i style="top:${92 + j * 34}px;width:${R(w2 * [0.62, 0.48, 0.7][j])}px"></i>`).join("");
      k.deco(`<div class="ghost" style="${box(x, y, w2, h)}transform:translateZ(${z}px) rotateY(${-14 + i * 4}deg);opacity:${i === 2 ? 0.55 : 0.9}"${A("up", 1.0 + i * 0.16, 1.4)} data-y="140" data-float="${-10 - i * 4},${3.2 + i * 0.6}"><b></b>${lines}</div>`);
    });
    halo(k, k.sz(1500, 560), k.sz(330, 520), k.sz(520, 420), k.t.accent, 0.3, 0.4);
    k.cue("typing", 0.25, 0.35);
    sfx(k, "in", 1.25, 0.4);
    return { html, css, end: 2.6, compose: false };
  }
  if (L === "aurora") {
    const size = fill(a.w, k.sz(170, 130), k.sz(96, 80));
    html += stack(a.x, k.sz(300, 600), a.w, [
      scene.icon ? `<div class="box" style="width:${k.sz(120, 132)}px;height:${k.sz(120, 132)}px;font-size:${k.sz(60, 66)}px"${A("pop", 0.15, 0.8)}>${k.icon(scene.icon)}</div>` : "",
      scene.kicker ? `<div class="label" style="font-size:${k.sz(24, 26)}px;color:var(--muted)"${A("up", 0.1, 0.7)}>${k.keep(scene.kicker)}</div>` : "",
      flowTitle(k, k.esc(title), size, { a: "rise-chars", t: 0.3, s: 0.025 }),
      sub ? `<p class="op-sub fit" data-fit="36" style="width:100%;font-size:${R(size * 0.55)}px"${A("rise", 1.2, 1, 0.08)}>${sub}</p>` : "",
    ], { gap: k.sz(26, 30), align: "center" });
    k.deco(`<div class="halo" style="${box(k.W / 2 - k.sz(380, 300), k.sz(160, 520), k.sz(760, 600), k.sz(760, 600))}background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),${k.rgba(k.t.accent, 0.22)} 45%,rgba(255,255,255,0) 70%);transform:translateZ(-300px)"${A("zoom", 0, 1.6, 0, ' data-from="0.3"')} data-float="-24,4"></div>`);
    sfx(k, "in", 0.25, 0.4);
    sfx(k, "hit", 1.3, 0.3);
    return { html, css, end: 2.4 };
  }
  if (L === "gridline") {
    const w = k.sz(1480, a.w);
    const size = fill(w, k.sz(230, 160), k.sz(110, 86));
    k.deco(`<div class="rule" style="${box(a.x, k.sz(118, 250), a.w, 3)}"${A("grow-x", 0.05, 1)}></div>`);
    k.deco(kicker(k, scene.kicker, a.x, k.sz(70, 190)));
    k.deco(`<div class="disc" style="${box(k.W - k.sz(330, 300), k.sz(-200, -150), k.sz(520, 460), k.sz(520, 460))}"${A("zoom", 0.35, 1.2, 0, ' data-from="0"')}></div>`);
    html += stack(a.x, k.sz(300, 560), w, [
      flowTitle(k, k.esc(title), size, { a: "rise", t: 0.25, s: 0.09, lh: 0.9 }),
      `<div style="width:140px;height:14px;background:var(--accent)"${A("grow-x", 0.9, 0.7)}></div>`,
      sub ? `<p class="op-sub fit" data-fit="34" style="width:100%;font-size:${R(size * 0.42)}px;color:var(--fg)"${A("rise", 1.0, 0.9, 0.08)}>${sub}</p>` : "",
    ], { gap: k.sz(30, 34) });
    sfx(k, "in", 0.2, 0.4);
    return { html, css, end: 2.2 };
  }
  // pop
  const size = fill(a.w, k.sz(200, 150), k.sz(100, 84));
  html += stack(a.x, k.sz(280, 600), a.w, [
    scene.icon ? `<div class="box" style="width:${k.sz(116, 124)}px;height:${k.sz(116, 124)}px;font-size:${k.sz(58, 62)}px"${A("pop", 0.4, 0.8)}>${k.icon(scene.icon)}</div>` : "",
    flowTitle(k, k.esc(title), size, { a: "rise-chars", t: 0.15, s: 0.03, lh: 0.95 }),
    sub ? `<div class="head" style="font-size:${R(size * 0.34)}px;font-weight:800"${A("pop", 1.0, 0.8)}><span class="op-pill">${sub}</span></div>` : "",
  ], { gap: k.sz(34, 40), align: "center" });
  const shapes = [
    [k.sz(150, 90), k.sz(150, 300), 120, "50%", k.t.accent2],
    [k.sz(1640, 880), k.sz(170, 330), 90, "24px", k.t.accent3],
    [k.sz(1580, 860), k.sz(700, 1380), 140, "50%", k.t.accent],
    [k.sz(220, 120), k.sz(720, 1420), 80, "8px", k.t.accent2],
  ];
  shapes.forEach(([x, y, sz, r, c], i) => {
    k.deco(`<div class="shape" style="${box(x, y, sz, sz)}border-radius:${r};background:${c};box-shadow:0 0 0 5px #15131A"${A("pop", 0.5 + i * 0.12, 0.8)} data-float="${i % 2 ? 14 : -16},${2.6 + i * 0.4},${i % 2 ? 8 : -8}"></div>`);
  });
  sfx(k, "in", 0.15, 0.4);
  sfx(k, "item", 1.0, 0.35);
  return { html, css, end: 2.2 };
}

function point(scene, k) {
  const a = area(k);
  const L = k.fam;
  const n = String(scene.value);
  const css = `.numeral{position:absolute;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.07em;line-height:.8}
.numwrap{position:absolute;overflow:hidden}
.fam-launch .numeral{color:transparent;-webkit-text-stroke:3px var(--accent);text-shadow:0 0 80px var(--glow)}
.fam-aurora .numeral{color:rgba(255,255,255,.14);-webkit-text-stroke:2px rgba(255,255,255,.55);text-shadow:0 0 90px var(--glow)}
.fam-gridline .numeral{color:var(--fg)}
.fam-pop .numeral{color:var(--on)}
.pdisc{position:absolute;border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px #15131A,14px 16px 0 #15131A}
.ticks{position:absolute;display:flex;gap:12px}
.ticks i{display:block;width:72px;height:8px;background:var(--line)}`;
  let html = "";
  if (L === "gridline" || L === "launch") {
    const numH = k.sz(L === "gridline" ? 960 : 820, 720);
    const numW = k.sz(n.length > 1 ? 900 : 640, a.w);
    const nx = k.sz(L === "gridline" ? 40 : 110, a.x - 20);
    const ny = k.sz(L === "gridline" ? 80 : 120, 180);
    html += `<div class="numwrap" style="${box(nx, ny, numW, numH)}"><div class="numeral" style="left:0;bottom:-${R(numH * 0.02)}px;font-size:${R(numH * 1.12)}px"${A("up", 0.1, 1.1)} data-y="${numH}">${k.esc(n)}</div></div>`;
    if (L === "gridline") {
      html += `<div class="rule" style="${box(a.x, 96, a.w, 3)}"${A("grow-x", 0.05, 1)}></div>`;
      html += `<div class="disc abs" style="${box(k.W - k.sz(260, 240), k.sz(-170, -140), k.sz(440, 400), k.sz(440, 400))}border-radius:50%;background:var(--accent)"${A("zoom", 0.35, 1.2, 0, ' data-from="0"')}></div>`;
    } else html += halo(k, nx + numW * 0.4, ny + numH * 0.5, k.sz(560, 460), k.t.accent, 0.32, 0.1);
    const tx = k.sz(L === "gridline" ? 900 : 920, a.x);
    const ty = k.sz(430, 980);
    const tw = k.sz(900, a.w);
    html += `<div class="rule" style="${box(tx + 4, ty - 44, 120, k.sz(14, 14))}background:var(--accent)"${A("grow-x", 0.7, 0.7)}></div>`;
    html += bigType(k, k.marked(scene.title), { x: tx, y: ty, w: tw, h: k.sz(300, 360), size: k.sz(132, 118), a: "rise", t: 0.8, s: 0.1 });
    html += iconBox(k, scene.icon, k.sz(104, 112), tx, k.sz(ty + 320, ty + 390), 1.3);
    sfx(k, "hit", 0.15, 0.45);
    sfx(k, "in", 0.8, 0.35);
    return { html, css, end: 2.1, compose: false };
  }
  if (L === "aurora") {
    const size = k.sz(620, 560);
    html += `<div class="numeral" style="left:0;right:0;top:${k.sz(60, 260)}px;text-align:center;font-size:${size}px;transform:translateZ(-200px)"${A("zoom", 0.05, 1.3, 0, ' data-from="1.4"')}>${k.esc(n)}</div>`;
    html += iconBox(k, scene.icon, k.sz(120, 132), k.W / 2 - k.sz(60, 66), k.sz(380, 820), 0.6);
    html += bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(540, 1000), w: a.w, h: k.sz(200, 300), size: k.sz(128, 112), align: "center", a: "rise-chars", t: 0.75, s: 0.025 });
    sfx(k, "in", 0.1, 0.4);
    sfx(k, "hit", 0.8, 0.3);
    return { html, css, end: 2.1, compose: false };
  }
  // pop
  const d = k.sz(560, 600);
  const cx = k.sz(520, k.W / 2);
  const cy = k.sz(430, 640);
  html += `<div class="pdisc" style="${box(cx - d / 2, cy - d / 2, d, d)}"${A("pop", 0.05, 0.9, 0, ' data-from="0.2"')}></div>`;
  html += `<div class="numeral" style="${box(cx - d / 2, cy - d * 0.42, d, d)}text-align:center;font-size:${R(d * 0.82)}px"${A("pop", 0.3, 0.8, 0, ' data-from="0.3"')}>${k.esc(n)}</div>`;
  html += bigType(k, k.marked(scene.title), { x: k.sz(900, a.x), y: k.sz(330, 1000), w: k.sz(900, a.w), h: k.sz(300, 320), size: k.sz(136, 120), align: k.port ? "center" : "left", a: "rise", t: 0.7, s: 0.1 });
  html += iconBox(k, scene.icon, k.sz(110, 120), k.sz(cx + d * 0.3, k.W / 2 + d * 0.25), k.sz(cy - d * 0.52, cy - d * 0.55), 0.9);
  sfx(k, "item", 0.1, 0.45);
  sfx(k, "in", 0.7, 0.35);
  return { html, css, end: 2.0, compose: false };
}

function headline(scene, k) {
  const a = area(k);
  const L = k.fam;
  const len = k.plain(scene.title).length;
  const size = k.sz(len > 60 ? 112 : len > 36 ? 136 : 168, len > 60 ? 92 : len > 36 ? 106 : 124);
  const centre = L === "aurora" || L === "pop";
  let css = "";
  const kick = scene.kicker ? `<div class="label" style="font-size:${k.sz(24, 26)}px;color:var(--muted)"${A("up", 0.05, 0.7)}>${k.keep(scene.kicker)}</div>` : "";
  if (L === "gridline") {
    k.deco(`<div class="rule" style="${box(a.x, k.sz(118, 250), a.w, 3)}"${A("grow-x", 0.05, 1)}></div>`);
    k.deco(kicker(k, scene.kicker, a.x, k.sz(70, 190)));
  }
  // The marked words sit on a sticker. As an inline block it takes room in
  // its line: as an inline box its dark ring rose past a tight line height
  // and ran through the descenders of the line above.
  if (L === "pop") css += `.fam-pop.t-headline .mk{display:inline-block;line-height:1.04;color:#15131A;background:var(--accent);padding:.03em .14em .07em;margin:.06em .02em;border-radius:.18em;box-shadow:0 0 0 4px #15131A}`;
  const html = stack(a.x, k.sz(260, 560), k.sz(centre ? a.w : 1560, a.w), [
    L === "gridline" ? "" : kick,
    flowTitle(k, k.marked(scene.title), L === "gridline" ? size * 1.08 : size, { a: "rise", t: 0.15, s: 0.06, lh: L === "gridline" ? 0.94 : 0.98 }),
    L === "launch" ? `<div style="width:${k.sz(420, 380)}px;height:2px;background:linear-gradient(90deg,var(--accent),rgba(255,255,255,0))"${A("grow-x", 1.1, 1)}></div>` : "",
    L === "gridline" ? `<div style="width:140px;height:14px;background:var(--accent)"${A("grow-x", 1.0, 0.7)}></div>` : "",
  ], { gap: k.sz(30, 34), align: centre ? "center" : "left" });
  if (L === "launch") halo(k, k.sz(1500, 800), k.sz(260, 400), k.sz(560, 460), k.t.accent, 0.26, 0.2);
  sfx(k, "in", 0.15, 0.4);
  return { html, css, end: 1.1 + Math.min(1.3, len * 0.012) };
}

function bigword(scene, k) {
  const a = area(k);
  const L = k.fam;
  const word = k.plain(scene.title);
  const size = Math.min(k.sz(360, 260), R(k.sz(2900, 1700) / Math.max(4, word.length)));
  const css = `.bw{white-space:nowrap}
.fam-aurora .bw{text-shadow:0 0 90px var(--glow)}
.fam-pop .bw{color:var(--fg)}`;
  const html = stack(a.x - 40, k.sz(300, 640), a.w + 80, [
    scene.kicker ? `<div class="label" style="font-size:${k.sz(24, 26)}px;color:var(--muted)"${A("up", 0.05, 0.7)}>${k.keep(scene.kicker)}</div>` : "",
    `<h1 class="head fit bw" data-fit="60" style="width:100%;font-size:${size}px;line-height:1.08;text-align:center;letter-spacing:-.05em"${A("rise-chars", 0.1, 1.1, 0.04)}>${k.keep(word)}</h1>`,
    L === "gridline" ? `<div style="width:${k.sz(400, 320)}px;height:16px;background:var(--accent)"${A("grow-x", 1.0, 0.8, 0, ' data-o="50% 50%"')}></div>` : "",
    L === "aurora" || L === "launch" ? `<div style="width:${k.sz(520, 400)}px;height:2px;background:linear-gradient(90deg,rgba(255,255,255,0),var(--accent),rgba(255,255,255,0))"${A("grow-x", 1.0, 0.9, 0, ' data-o="50% 50%"')}></div>` : "",
  ], { gap: k.sz(24, 28), align: "center" });
  if (L === "launch") halo(k, k.W / 2, k.sz(480, 820), k.sz(760, 520), k.t.accent, 0.3, 0);
  sfx(k, "hit", 0.15, 0.45);
  return { html, css, end: 1.3 + word.length * 0.03 };
}

function wordstack(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const top = k.sz(170, 380);
  const avail = k.sz(640, 1000);
  const weights = scene.items.map((_, i) => (i === n - 1 ? 1.5 : 1));
  const unit = avail / weights.reduce((s, w) => s + w, 0);
  let y = top;
  let html = kicker(k, scene.kicker, a.x, top - 70);
  const css = `.ws{white-space:nowrap}.ws.last{color:var(--accent)}.ws.lite{font-weight:400;color:var(--muted)}`;
  scene.items.forEach((text, i) => {
    const h = unit * weights[i];
    const last = i === n - 1;
    const align = k.fam === "aurora" || k.fam === "pop" ? "center" : "left";
    html += `<div class="title head fit ws${last ? " last" : i % 2 ? " lite" : ""}" data-fit="30" style="${box(a.x, y, a.w, h)}font-size:${R(h * 0.86)}px;line-height:1.02;text-align:${align}"${A("rise", 0.15 + i * 0.32, 0.9, 0.05)}>${k.keep(text)}</div>`;
    y += h;
  });
  sfx(k, "in", 0.15, 0.35);
  sfx(k, "hit", 0.15 + (n - 1) * 0.32, 0.35);
  return { html, css, end: 1.2 + (n - 1) * 0.32 };
}

function typewriter(scene, k) {
  const a = area(k);
  const text = k.plain(scene.text);
  const css = `.tw-win{position:absolute}
.tw-text{position:absolute;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.03em;line-height:1.08}
.tw-caret{display:inline-block;width:.06em;height:.85em;margin-left:.04em;vertical-align:-.08em;background:var(--accent);animation:twb 1s steps(1) infinite}
@keyframes twb{50%{opacity:0}}`;
  const size = k.sz(text.length > 90 ? 92 : 124, text.length > 90 ? 78 : 96);
  const cps = Math.max(22, text.length / 2.2);
  let html = kicker(k, scene.kicker, a.x, k.sz(210, 470));
  html += `<p class="tw-text fit" data-fit="40" style="${box(a.x, k.sz(270, 540), k.sz(1500, a.w), k.sz(520, 820))}font-size:${size}px"><span${A("type", 0.3, 0, 0, ` data-v="${k.esc(text)}" data-cps="${R(cps)}"`)}>${k.esc(text)}</span><span class="tw-caret"></span></p>`;
  k.cue(SFX[k.fam].type, 0.3, 0.3);
  return { html, css, end: 0.3 + text.length / cps + 0.2 };
}

function strike(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.st-row{color:var(--muted);white-space:nowrap}
.st-row .ln{position:absolute;left:-1%;right:-1%;top:52%;height:${k.sz(9, 9)}px;border-radius:5px;background:${k.fam === "gridline" ? "var(--accent)" : "#FF6B6B"};transform-origin:0 50%}`;
  const rows = scene.items.map((text, i) => {
    sfx(k, "tick", 0.6 + i * 0.25, 0.3);
    return `<div class="st-row head" style="font-size:${k.sz(84, 76)}px"${A("up", 0.1 + i * 0.25, 0.7)}><span style="position:relative;display:inline-block">${k.keep(text)}<i class="ln"${A("grow-x", 0.55 + i * 0.25, 0.45)}></i></span></div>`;
  });
  const html = stack(a.x, k.sz(220, 520), k.sz(1600, a.w), [
    ...rows,
    `<div style="height:${k.sz(18, 24)}px"></div>`,
    flowTitle(k, k.marked(scene.title), k.sz(160, 120), { a: "rise", t: 0.9 + n * 0.25, s: 0.07 }),
  ], { gap: k.sz(14, 18) });
  sfx(k, "hit", 0.9 + n * 0.25, 0.4);
  return { html, css, end: 1.9 + n * 0.25 };
}

function quote(scene, k) {
  const a = area(k);
  const text = k.plain(scene.text);
  const css = `.qm{font-family:"Instrument Serif","Playfair Display",serif;line-height:.6;color:var(--accent);height:.42em}
.fam-launch .qm,.fam-aurora .qm{text-shadow:0 0 70px var(--glow)}`;
  const size = k.sz(text.length > 140 ? 72 : text.length > 80 ? 88 : 108, text.length > 140 ? 62 : 76);
  const html = stack(a.x, k.sz(200, 520), k.sz(1560, a.w), [
    `<div class="qm" style="font-size:${k.sz(300, 260)}px"${A("zoom", 0.05, 1, 0, ' data-from="1.6"')}>\u201c</div>`,
    flowTitle(k, k.esc(text), size, { a: "rise-lines", t: 0.3, s: 0.12, lh: 1.12 }),
    scene.source ? `<div class="label" style="font-size:${k.sz(30, 32)}px;color:var(--muted)"${A("up", 1.2, 0.7)}>${k.keep(scene.source)}</div>` : "",
  ], { gap: k.sz(30, 36) });
  sfx(k, "in", 0.3, 0.35);
  return { html, css, end: 1.6 };
}

function term(scene, k) {
  const a = area(k);
  const item = scene.items[0] || {};
  const css = `.fam-launch .tm-def,.fam-aurora .tm-def{color:var(--fg)}`;
  const html = stack(a.x, k.sz(200, 480), k.sz(1500, a.w), [
    scene.stamp ? `<div class="label" style="font-size:${k.sz(24, 26)}px;padding:10px 20px;border-radius:999px;background:${k.t.dark ? "rgba(255,255,255,.08)" : "var(--fg)"};color:${k.t.dark ? "var(--fg)" : "var(--ground)"}"${A("pop", 0.05, 0.7)}>${k.keep(scene.stamp)}</div>` : "",
    flowTitle(k, k.keep(item.term || ""), k.sz(200, 150), { a: "rise-chars", t: 0.15, s: 0.03 }),
    item.full ? flowText(k, item.full, k.sz(46, 44), { a: "rise", t: 0.7 }) : "",
    `<div style="width:160px;height:${k.fam === "gridline" ? 12 : 2}px;background:${k.fam === "gridline" ? "var(--accent)" : "linear-gradient(90deg,var(--accent),rgba(255,255,255,0))"}"${A("grow-x", 0.9, 0.7)}></div>`,
    flowText(k, item.text || "", k.sz(58, 54), { t: 1.0, cls: "body tm-def head" }),
  ], { gap: k.sz(26, 30) });
  sfx(k, "in", 0.15, 0.4);
  return { html, css, end: 2.0 };
}

function spotlight(scene, k) {
  const a = area(k);
  const s = k.sz(320, 320);
  const cx = k.sz(560, k.W / 2);
  const cy = k.sz(440, 600);
  halo(k, cx, cy, s * 1.6, k.t.accent, 0.4, 0);
  let html = `<div class="box abs" style="${box(cx - s / 2, cy - s / 2, s, s)}font-size:${R(s * 0.52)}px"${A("pop", 0.1, 1, 0, ' data-from="0.3"')} data-float="-14,3.4">${k.icon(scene.icon)}</div>`;
  html += stack(k.sz(900, a.x), k.sz(300, 860), k.sz(880, a.w), [
    flowTitle(k, k.marked(scene.title || ""), k.sz(136, 112), { a: "rise", t: 0.5, s: 0.08 }),
    flowText(k, scene.text, k.sz(52, 50), { t: 0.9 }),
  ], { gap: 26, align: k.port ? "center" : "left" });
  sfx(k, "hit", 0.1, 0.4);
  return { html, css: "", end: 1.8 };
}

// ─── figures ───────────────────────────────────────────────────────────────
function number(scene, k) {
  const a = area(k);
  const L = k.fam;
  const v = String(scene.value);
  const css = `.big{position:absolute;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.06em;line-height:1;white-space:nowrap}
.fam-launch .big,.fam-aurora .big{color:#F6F7FF;text-shadow:0 0 90px var(--glow),0 0 2px rgba(255,255,255,.6)}
.fam-pop .big{color:var(--on)}
.ring circle{fill:none}`;
  const size = k.sz(v.length > 6 ? 250 : v.length > 3 ? 360 : 480, v.length > 6 ? 200 : v.length > 3 ? 290 : 400);
  let html = "";
  const anim = /^[\d.,%+\-~$\u20ac\u20ba\u00a3 ]+$/.test(v) && v.length <= 5 ? "scramble" : "count";
  if (L === "gridline") {
    k.deco(`<div class="rule" style="${box(a.x, 96, a.w, 3)}"${A("grow-x", 0.05, 1)}></div>`);
    k.deco(kicker(k, scene.kicker, a.x, 50));
    html += `<div class="big fit num" data-fit="90" style="${box(a.x - 10, k.sz(150, 300), k.sz(1700, a.w), R(size * 1.1))}font-size:${R(size * 1.1)}px"${A(anim, 0.15, 1.0, 0, ` data-v="${k.esc(v)}"`)}>${k.esc(v)}</div>`;
    html += `<div class="rule" style="${box(a.x, k.sz(150 + size * 1.15, 320 + size * 1.15), 160, 14)}background:var(--accent)"${A("grow-x", 1.1, 0.7)}></div>`;
    html += bodyText(k, scene.text, { x: a.x, y: k.sz(190 + size * 1.15, 360 + size * 1.15), w: k.sz(1300, a.w), h: k.sz(160, 280), size: k.sz(56, 52), t: 1.2, cls: "head" });
    sfx(k, "hit", 0.2, 0.45);
    return { html, css: css + `.fam-gridline .t-number .body{color:var(--fg)}`, end: 2.2 };
  }
  if (L === "pop") {
    const d = k.sz(660, 760);
    const cx = k.W / 2;
    const cy = k.sz(420, 700);
    html += `<div class="abs" style="${box(cx - d / 2, cy - d / 2, d, d)}border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px #15131A,14px 16px 0 #15131A"${A("pop", 0.05, 0.9, 0, ' data-from="0.2"')}></div>`;
    html += `<div class="big fit num" data-fit="80" style="${box(cx - d * 0.46, cy - size * 0.5, d * 0.92, size)}font-size:${R(size * 0.9)}px;text-align:center;color:var(--on)"${A("count", 0.3, 0.9, 0, ` data-v="${k.esc(v)}"`)}>${k.esc(v)}</div>`;
    html += bodyText(k, scene.text, { x: a.x, y: cy + d / 2 + 40, w: a.w, h: k.sz(140, 200), size: k.sz(58, 54), t: 1.1, align: "center", cls: "head" });
    sfx(k, "item", 0.1, 0.45);
    sfx(k, "hit", 1.3, 0.35);
    return { html, css: css + `.fam-pop .t-number .body{color:var(--fg)}`, end: 2.2 };
  }
  // launch, aurora: the number decodes in a ring of light
  const cx = k.W / 2;
  const cy = k.sz(400, 760);
  const r = k.sz(350, 420);
  html += halo(k, cx, cy, r * 1.8, k.t.accent, 0.42, 0);
  const C = 2 * Math.PI * r;
  html += `<svg class="ring abs" style="${box(cx - r - 10, cy - r - 10, 2 * r + 20, 2 * r + 20)}" viewBox="0 0 ${2 * r + 20} ${2 * r + 20}"><circle cx="${r + 10}" cy="${r + 10}" r="${r}" stroke="${L === "aurora" ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.07)"}" stroke-width="2"/>` +
    `<circle cx="${r + 10}" cy="${r + 10}" r="${r}" stroke="${k.t.accent}" stroke-width="6" stroke-linecap="round" transform="rotate(-90 ${r + 10} ${r + 10})" style="filter:drop-shadow(0 0 10px ${k.rgba(k.t.accent, 0.9)})"${A("draw", 0.4, 1.4, 0, ' data-from="0%"')}/></svg>`;
  html += kicker(k, scene.kicker, cx, cy - r + k.sz(70, 80), 0.1, "center");
  // The number keeps clear of the ring: set as wide as the ring, it touched it.
  html += `<div class="big fit num" data-fit="90" style="${box(cx - r * 0.78, cy - size * 0.56, r * 1.56, size * 1.06)}font-size:${size}px;text-align:center"${A(anim, 0.2, 1.0, 0, ` data-v="${k.esc(v)}"`)}>${k.esc(v)}</div>`;
  html += bodyText(k, scene.text, { x: a.x, y: cy + r * 0.42, w: a.w, h: k.sz(140, 200), size: k.sz(58, 54), t: 1.2, align: "center", cls: "head" });
  k.cue("typing", 0.2, 0.28);
  sfx(k, "hit", 1.35, 0.45);
  return { html, css: css + `.t-number .body.head{color:var(--fg);letter-spacing:-.02em}`, end: 2.2 };
}

function numbers(scene, k) {
  const n = scene.items.length;
  const slots = cardSlots(k, n, { top: k.sz(300, 420), height: k.sz(440, 380), gap: k.sz(32, 30), maxW: 520 });
  const css = `.nb-v{position:absolute;left:44px;right:44px;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;white-space:nowrap;color:var(--fg)}
.fam-launch .nb-v,.fam-aurora .nb-v{text-shadow:0 0 50px var(--glow)}
.fam-gridline .nb-v,.fam-pop .nb-v{color:#15131A}
.nb-l{position:absolute;left:44px;right:44px;font-size:${k.sz(40, 40)}px;line-height:1.25;color:var(--muted)}
.fam-gridline .nb-l,.fam-pop .nb-l{color:#4A4D5C}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: area(k).x, y: k.sz(110, 240), w: area(k).w, h: k.sz(140, 150), size: k.sz(84, 76), align: k.fam === "aurora" || k.fam === "pop" ? "center" : "left", a: "rise", t: 0.1 }) : "";
  slots.forEach((s, i) => {
    const it = scene.items[i];
    const t0 = 0.45 + i * 0.16;
    const vs = k.port ? Math.min(150, s.h * 0.42) : Math.min(170, s.w * 0.34);
    html += `<div class="card" style="${box(s.x, s.y, s.w, s.h)}"${A("card", t0, 0.9, 0, ` data-to='{"rotationY":${s.rot}}'`)} data-float="${-8 - i * 3},${3.4 + i * 0.4}">` +
      (it.icon ? `<div class="box abs" style="${box(44, 40, k.sz(84, 74), k.sz(84, 74))}font-size:${k.sz(42, 38)}px">${k.icon(it.icon)}</div>` : "") +
      `<div class="nb-v num fit" data-fit="40" data-group="nbv" style="top:${k.port ? R(s.h * 0.2) : R(s.h * 0.36)}px;height:${R(vs * 1.1)}px;font-size:${R(vs)}px${k.port ? `;left:${it.icon ? 150 : 44}px` : ""}"${A("count", t0 + 0.35, 0.9, 0, ` data-v="${k.esc(it.value)}"`)}>${k.esc(it.value)}</div>` +
      `<div class="nb-l fit" data-fit="20" style="top:${k.port ? R(s.h * 0.2 + vs * 1.15) : R(s.h * 0.36 + vs * 1.15)}px;height:${k.port ? R(s.h * 0.34) : R(s.h * 0.3)}px${k.port ? `;left:${it.icon ? 150 : 44}px` : ""}">${k.keep(it.label)}</div></div>`;
    sfx(k, "item", t0 + 0.1, 0.3);
  });
  return { html, css, end: 1.6 + n * 0.16 };
}

function change(scene, k) {
  const a = area(k);
  const [was, now] = scene.items;
  const css = `.ch-v{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;white-space:nowrap}
.ch-was{color:var(--muted)}
.ch-now{color:var(--accent)}
.fam-launch .ch-now,.fam-aurora .ch-now{text-shadow:0 0 70px var(--glow)}
.ch-l{position:absolute;font-size:${k.sz(38, 38)}px;color:var(--muted)}
.ch-arrow path{fill:none;stroke-linecap:round;stroke-linejoin:round}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(110, 240), w: a.w, h: k.sz(140, 150), size: k.sz(84, 76), a: "rise", t: 0.05 }) : "";
  const big = k.sz(250, 220);
  const small = k.sz(150, 150);
  if (!k.port) {
    html += `<div class="ch-v ch-was fit num" data-fit="60" style="${box(a.x, 420, 600, small * 1.1)}font-size:${small}px"${A("up", 0.2, 0.8)}>${k.esc(was.value)}</div>`;
    html += `<div class="ch-l fit" data-fit="20" style="${box(a.x, 420 + small * 1.15, 600, 110)}"${A("rise", 0.4, 0.8)}>${k.keep(was.label)}</div>`;
    html += `<svg class="ch-arrow abs" style="${box(760, 440, 240, 120)}" viewBox="0 0 240 120"><path d="M10 60 H220 M180 22 L220 60 L180 98" stroke="${k.t.accent}" stroke-width="10"${A("draw", 0.7, 0.7)}/></svg>`;
    html += `<div class="ch-v ch-now fit num" data-fit="80" style="${box(1060, 360, 760, big * 1.1)}font-size:${big}px"${A("count", 1.0, 1.0, 0, ` data-v="${k.esc(now.value)}" data-from="${k.esc(was.value)}"`)}>${k.esc(now.value)}</div>`;
    html += `<div class="ch-l fit" data-fit="20" style="${box(1066, 360 + big * 1.15, 740, 110)};color:var(--fg)"${A("rise", 1.3, 0.8)}>${k.keep(now.label)}</div>`;
  } else {
    html += `<div class="ch-v ch-was fit num" data-fit="60" style="${box(a.x, 440, a.w, small * 1.1)}font-size:${small}px"${A("up", 0.2, 0.8)}>${k.esc(was.value)}</div>`;
    html += `<div class="ch-l fit" data-fit="20" style="${box(a.x, 440 + small * 1.15, a.w, 100)}"${A("rise", 0.4, 0.8)}>${k.keep(was.label)}</div>`;
    html += `<svg class="ch-arrow abs" style="${box(a.x, 770, 140, 200)}" viewBox="0 0 140 200"><path d="M70 10 V180 M30 140 L70 180 L110 140" stroke="${k.t.accent}" stroke-width="10"${A("draw", 0.7, 0.7)}/></svg>`;
    html += `<div class="ch-v ch-now fit num" data-fit="80" style="${box(a.x, 1010, a.w, big * 1.1)}font-size:${big}px"${A("count", 1.0, 1.0, 0, ` data-v="${k.esc(now.value)}" data-from="${k.esc(was.value)}"`)}>${k.esc(now.value)}</div>`;
    html += `<div class="ch-l fit" data-fit="20" style="${box(a.x, 1010 + big * 1.15, a.w, 120)};color:var(--fg)"${A("rise", 1.3, 0.8)}>${k.keep(now.label)}</div>`;
  }
  sfx(k, "in", 0.7, 0.35);
  sfx(k, "hit", 1.9, 0.4);
  return { html, css, end: 2.5 };
}

function donut(scene, k) {
  const a = area(k);
  const cx = k.sz(620, k.W / 2);
  const cy = k.sz(470, 720);
  const r = k.sz(300, 330);
  const pct = Math.max(0, Math.min(100, scene.percent || 0));
  const css = `.dn-v{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;text-align:center;white-space:nowrap}
.fam-launch .dn-v,.fam-aurora .dn-v{text-shadow:0 0 60px var(--glow)}`;
  let html = halo(k, cx, cy, r * 1.7, k.t.accent, 0.36, 0);
  const stroke = k.sz(46, 50);
  html += `<svg class="abs" style="${box(cx - r - stroke, cy - r - stroke, 2 * (r + stroke), 2 * (r + stroke))}" viewBox="0 0 ${2 * (r + stroke)} ${2 * (r + stroke)}"><circle cx="${r + stroke}" cy="${r + stroke}" r="${r}" fill="none" stroke="${k.t.faint}" stroke-width="${stroke}"/>` +
    `<circle cx="${r + stroke}" cy="${r + stroke}" r="${r}" fill="none" stroke="${k.t.accent}" stroke-width="${stroke}" stroke-linecap="${k.fam === "gridline" ? "butt" : "round"}" transform="rotate(-90 ${r + stroke} ${r + stroke})" style="stroke-dasharray:${(2 * Math.PI * r).toFixed(1)};stroke-dashoffset:${(2 * Math.PI * r).toFixed(1)}"${A("to", 0.3, 1.5, 0, ` data-e="expo.inOut" data-to='{"strokeDashoffset":${((2 * Math.PI * r * (100 - pct)) / 100).toFixed(1)}}'`)}/></svg>`;
  html += `<div class="dn-v fit num" data-fit="50" style="${box(cx - r * 0.8, cy - k.sz(95, 100), r * 1.6, k.sz(190, 200))}font-size:${k.sz(180, 190)}px"${A("count", 0.4, 1.0, 0, ` data-v="${k.esc(scene.value)}"`)}>${k.esc(scene.value)}</div>`;
  const tx = k.sz(1040, a.x);
  const ty = k.sz(320, 1180);
  if (scene.title) html += bigType(k, k.marked(scene.title), { x: tx, y: ty, w: k.sz(760, a.w), h: k.sz(260, 220), size: k.sz(96, 88), align: k.port ? "center" : "left", a: "rise", t: 0.9 });
  html += bodyText(k, scene.text, { x: tx, y: ty + k.sz(scene.title ? 280 : 0, scene.title ? 240 : 0), w: k.sz(760, a.w), h: k.sz(200, 160), t: 1.2, align: k.port ? "center" : "left" });
  sfx(k, "in", 0.3, 0.35);
  sfx(k, "hit", 1.6, 0.35);
  return { html, css, end: 2.1 };
}

function progress(scene, k) {
  const a = area(k);
  const done = scene.done || 0;
  const total = Math.max(1, scene.total || 1);
  const cols = total <= 10 ? total : total <= 20 ? 10 : total <= 50 ? 10 : 20;
  const rows = Math.ceil(total / cols);
  const gw = k.sz(860, a.w);
  const cell = Math.min(k.sz(150, 160), (gw - (cols - 1) * 12) / cols);
  const gh = rows * cell + (rows - 1) * 12;
  const gx = k.sz(980, a.x);
  const gy = k.sz(Math.max(170, 440 - gh / 2), 1000);
  const css = `.pg{position:absolute;border-radius:${k.fam === "gridline" ? 2 : 10}px;background:var(--faint)}
.pg.on{background:var(--accent)}
.fam-launch .pg.on,.fam-aurora .pg.on{box-shadow:0 0 18px var(--glow)}
.pg-v{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;white-space:nowrap}`;
  let html = `<div class="pg-v fit num" data-fit="80" style="${box(a.x, k.sz(300, 330), k.sz(780, a.w), k.sz(300, 300))}font-size:${k.sz(260, 260)}px"${A("up", 0.1, 0.9)}>${k.esc(scene.value)}</div>`;
  if (scene.title) html += bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(620, 660), w: k.sz(780, a.w), h: k.sz(200, 200), size: k.sz(72, 72), a: "rise", t: 0.4 });
  for (let i = 0; i < total; i++) {
    const x = gx + (i % cols) * (cell + 12);
    const y = gy + Math.floor(i / cols) * (cell + 12);
    html += `<i class="pg${i < done ? " on" : ""}" style="${box(x, y, cell, cell)}"${A(i < done ? "pop" : "fade", 0.5 + (i < done ? i : done) * Math.min(0.08, 1.4 / Math.max(1, done)), 0.5)}></i>`;
  }
  sfx(k, "tick", 0.6, 0.3);
  sfx(k, "done", 0.6 + Math.min(1.4, done * 0.08), 0.3);
  return { html, css, end: 1.4 + Math.min(1.4, done * 0.08) };
}

// ─── lists and processes ───────────────────────────────────────────────────
function features(scene, k) {
  const n = scene.items.length;
  const a = area(k);
  const hasTitle = Boolean(scene.title);
  const css = `.ft-h{position:absolute;left:44px;right:44px;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.035em;line-height:1.02;color:var(--fg)}
.fam-gridline .ft-h,.fam-pop .ft-h{color:#15131A}
.ft-p{position:absolute;left:44px;right:44px;margin:0;line-height:1.3;color:var(--muted)}
.fam-gridline .ft-p,.fam-pop .ft-p{color:#4A4D5C}
.ft-n{position:absolute;right:40px;top:40px;font-size:22px;color:var(--muted)}
.fam-gridline .ft-n,.fam-pop .ft-n{color:#8A8C98}
.ft-bar{position:absolute;left:44px;right:44px;bottom:42px;height:6px;border-radius:6px;background:var(--faint);overflow:hidden}
.ft-bar b{position:absolute;inset:0;border-radius:6px;background:linear-gradient(90deg,var(--accent),var(--accent2));transform-origin:0 50%}
.fam-gridline .ft-bar,.fam-pop .ft-bar{background:#EEEDE8}`;
  let html = "";
  if (hasTitle) {
    html += kicker(k, scene.kicker, k.fam === "aurora" || k.fam === "pop" ? k.W / 2 : a.x, k.sz(70, 210), 0.05, k.fam === "aurora" || k.fam === "pop" ? "center" : "left");
    html += bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(110, 250), w: a.w, h: k.sz(150, 220), size: k.sz(100, 88), align: k.fam === "aurora" || k.fam === "pop" ? "center" : "left", a: "rise", t: 0.1 });
  }
  const twoRows = !k.port && n > 3;
  const cols = twoRows ? Math.ceil(n / 2) : n;
  const top = k.sz(hasTitle ? 300 : 210, hasTitle ? 520 : 380);
  const slots = twoRows
    ? (() => {
      const out = [];
      const gap = 32;
      const w = Math.min(520, (a.w - gap * (cols - 1)) / cols);
      const h = (k.H - k.safe.bottom - top - gap) / 2;
      const x0 = (k.W - (w * cols + gap * (cols - 1))) / 2;
      for (let i = 0; i < n; i++) out.push({ x: x0 + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h, rot: 0 });
      return out;
    })()
    : cardSlots(k, n, { top, height: k.sz(540, 360), gap: k.sz(36, 30), maxW: 540 });
  slots.forEach((s, i) => {
    const it = scene.items[i];
    const t0 = 0.5 + i * 0.16;
    const ib = Math.min(k.sz(110, 96), s.h * 0.28);
    const compact = k.port || twoRows;
    const hy = compact ? R(s.h * 0.16) : R(ib + 84);
    const hx = compact ? R(ib + 70) : 44;
    html += `<div class="card" style="${box(s.x, s.y, s.w, s.h)}"${A("card", t0, 0.9, 0, ` data-to='{"rotationY":${s.rot}}'`)} data-float="${-10 + i * 3},${3.4 + i * 0.5}">` +
      (it.icon ? `<div class="box abs" style="${box(44, compact ? R((s.h - ib) / 2) : 44, ib, ib)}font-size:${R(ib * 0.5)}px">${k.icon(it.icon)}</div>` : "") +
      `<div class="ft-n label">${String(i + 1).padStart(2, "0")}</div>` +
      `<h3 class="ft-h fit" data-fit="26" data-group="fth" style="top:${hy}px;height:${compact ? R(s.h * 0.34) : R(s.h * 0.3)}px;font-size:${k.sz(70, 62)}px${compact ? `;left:${hx}px` : ""}">${k.keep(it.title)}</h3>` +
      (it.text ? `<p class="ft-p fit" data-fit="20" data-group="ftp" style="top:${compact ? R(s.h * 0.52) : R(hy + s.h * 0.32)}px;height:${compact ? R(s.h * 0.34) : R(s.h - 66 - (hy + s.h * 0.32))}px;font-size:${k.sz(40, 38)}px${compact ? `;left:${hx}px` : ""}">${k.keep(it.text)}</p>` : "") +
      (compact ? "" : `<div class="ft-bar"><b${A("grow-x", t0 + 0.6, 1)} style="transform:scaleX(${(0.55 + ((i * 37) % 40) / 100).toFixed(2)})"></b></div>`) +
      `</div>`;
    sfx(k, "item", t0 + 0.15, 0.3);
  });
  sfx(k, "in", 0.4, 0.35);
  return { html, css, end: 1.6 + n * 0.16 };
}

// A track of nodes the camera follows: steps, timeline and flow share it.
function track(scene, k, { labels, dates = null, active = -1, kind }) {
  const a = area(k);
  const n = labels.length;
  const css = `.tk-node{position:absolute;border-radius:50%;display:grid;place-items:center;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800}
.fam-launch .tk-node,.fam-aurora .tk-node{background:var(--surface2);box-shadow:inset 0 0 0 2px rgba(255,255,255,.14);color:var(--fg)}
.fam-launch .tk-node.on,.fam-aurora .tk-node.on{background:var(--accent);color:var(--on);box-shadow:0 0 0 10px ${k.rgba(k.t.accent, 0.18)},0 0 50px var(--glow)}
.fam-gridline .tk-node{background:var(--ground);box-shadow:inset 0 0 0 3px var(--fg);color:var(--fg);border-radius:2px}
.fam-gridline .tk-node.on{background:var(--accent);color:var(--on);box-shadow:none}
.fam-pop .tk-node{background:#fff;color:#15131A;box-shadow:0 0 0 5px #15131A}
.fam-pop .tk-node.on{background:var(--accent);color:var(--on)}
.tk-lab{position:absolute;margin:0;line-height:1.18;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.025em}
.tk-date{position:absolute;color:var(--accent);font-size:${k.sz(30, 30)}px}
.tk-line{position:absolute;background:var(--line)}
.tk-fill{position:absolute;background:var(--accent)}
.fam-launch .tk-fill,.fam-aurora .tk-fill{box-shadow:0 0 16px var(--glow)}
.tk-box{position:absolute;border-radius:24px;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 26px}`;
  let html = "";
  const hasTitle = Boolean(scene.title);
  if (hasTitle) html += bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(110, 240), w: a.w, h: k.sz(150, 200), size: k.sz(96, 84), align: k.fam === "aurora" || k.fam === "pop" ? "center" : "left", a: "rise", t: 0.05 });
  const step = 0.28;
  if (!k.port) {
    const y = hasTitle ? 520 : 450;
    const x0 = a.x + 70;
    const x1 = k.W - a.x - 70;
    const gap = n > 1 ? (x1 - x0) / (n - 1) : 0;
    const node = kind === "flow" ? 0 : 92;
    if (kind !== "flow") {
      html += `<div class="tk-line" style="${box(x0, y - 2, x1 - x0, 4)}"${A("grow-x", 0.25, 1.2)}></div>`;
      html += `<div class="tk-fill" style="${box(x0, y - 3, active >= 0 ? gap * active : x1 - x0, 6)}"${A("grow-x", 0.6, 0.6 + n * step, 0, ' data-e="power2.inOut"')}></div>`;
    }
    labels.forEach((text, i) => {
      const x = x0 + i * gap;
      const t0 = 0.5 + i * step;
      const on = kind === "steps" ? i === active || (active < 0 && i === n - 1) : kind === "timeline" ? i === n - 1 : false;
      const w = Math.min(380, gap * 0.92 || 600);
      if (kind === "flow") {
        const bw = Math.min(440, gap * 0.8 || 600);
        html += `<div class="card tk-box" style="${box(x - bw / 2, y - 130, bw, 260)}"${A("card", t0, 0.8)}><div class="tk-lab fit" data-fit="22" data-group="tkl" style="position:relative;width:100%;height:190px;font-size:62px;display:flex;align-items:center;justify-content:center;${k.fam === "gridline" || k.fam === "pop" ? "color:#15131A" : ""}">${k.keep(text)}</div></div>`;
        if (i < n - 1) {
          const ax = x + bw / 2 + 10;
          const aw = gap - bw - 20;
          html += `<svg class="abs" style="${box(ax, y - 30, aw, 60)}" viewBox="0 0 ${R(aw)} 60"><path d="M4 30 H${R(aw - 8)} M${R(aw - 30)} 10 L${R(aw - 8)} 30 L${R(aw - 30)} 50" fill="none" stroke="${k.t.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${A("draw", t0 + 0.35, 0.5)}/></svg>`;
        }
      } else {
        html += `<div class="tk-node${on ? " on" : ""}" style="${box(x - node / 2, y - node / 2, node, node)}font-size:38px"${A("pop", t0, 0.7)}>${kind === "timeline" ? "" : i + 1}</div>`;
        if (dates) html += `<div class="tk-date label" style="${box(x - w / 2, y - 120, w, 40)}text-align:center"${A("up", t0 + 0.1, 0.6)}>${k.keep(dates[i])}</div>`;
        html += `<div class="tk-lab fit" data-fit="22" data-group="tkl" style="${box(x - w / 2, y + 80, w, 220)}font-size:56px;text-align:center"${A("rise", t0 + 0.15, 0.8)}>${k.keep(text)}</div>`;
      }
      sfx(k, "tick", t0, 0.25);
    });
    return { html, css, end: 1.4 + n * step };
  }
  // Portrait: the track runs down the frame.
  const x = a.x + 60;
  const y0 = hasTitle ? 560 : 420;
  const y1 = k.H - k.safe.bottom - 80;
  const gap = n > 1 ? (y1 - y0) / (n - 1) : 0;
  const node = kind === "flow" ? 0 : 84;
  if (kind !== "flow") {
    html += `<div class="tk-line" style="${box(x - 2, y0, 4, y1 - y0)}"${A("grow-y", 0.25, 1.2, 0, ' data-o="50% 0%"')}></div>`;
    html += `<div class="tk-fill" style="${box(x - 3, y0, 6, active >= 0 ? gap * active : y1 - y0)}"${A("grow-y", 0.6, 0.6 + n * step, 0, ' data-o="50% 0%"')}></div>`;
  }
  labels.forEach((text, i) => {
    const y = y0 + i * gap;
    const t0 = 0.5 + i * step;
    const on = kind === "steps" ? i === active || (active < 0 && i === n - 1) : kind === "timeline" ? i === n - 1 : false;
    if (kind === "flow") {
      const bh = Math.min(200, gap * 0.7 || 300);
      html += `<div class="card tk-box" style="${box(a.x, y - bh / 2, a.w, bh)}"${A("card", t0, 0.8)}><div class="tk-lab fit" data-fit="22" data-group="tkl" style="position:relative;width:100%;height:${R(bh * 0.7)}px;font-size:48px;display:flex;align-items:center;justify-content:center;${k.fam === "gridline" || k.fam === "pop" ? "color:#15131A" : ""}">${k.keep(text)}</div></div>`;
      if (i < n - 1) html += `<svg class="abs" style="${box(k.W / 2 - 30, y + bh / 2 + 6, 60, gap - bh - 12)}" viewBox="0 0 60 ${R(gap - bh - 12)}"><path d="M30 4 V${R(gap - bh - 20)} M12 ${R(gap - bh - 38)} L30 ${R(gap - bh - 20)} L48 ${R(gap - bh - 38)}" fill="none" stroke="${k.t.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${A("draw", t0 + 0.35, 0.5)}/></svg>`;
    } else {
      html += `<div class="tk-node${on ? " on" : ""}" style="${box(x - node / 2, y - node / 2, node, node)}font-size:36px"${A("pop", t0, 0.7)}>${kind === "timeline" ? "" : i + 1}</div>`;
      if (dates) html += `<div class="tk-date label" style="${box(x + 80, y - 70, a.w - 140, 40)}"${A("up", t0 + 0.1, 0.6)}>${k.keep(dates[i])}</div>`;
      html += `<div class="tk-lab fit" data-fit="24" data-group="tkl" style="${box(x + 80, y - (dates ? 24 : 50), a.w - 140, dates ? 120 : 100)}font-size:62px"${A("rise", t0 + 0.15, 0.8)}>${k.keep(text)}</div>`;
    }
    sfx(k, "tick", t0, 0.25);
  });
  return { html, css, end: 1.4 + n * step };
}
const steps = (scene, k) => track(scene, k, { labels: scene.items, active: scene.active > 0 && scene.active <= scene.items.length ? scene.active - 1 : -1, kind: "steps" });
const timeline = (scene, k) => track(scene, k, { labels: scene.items.map((i) => i.label), dates: scene.items.map((i) => i.date), kind: "timeline" });
const flow = (scene, k) => track(scene, k, { labels: scene.items, kind: "flow" });

function checklist(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.cl-row{position:absolute;display:flex;align-items:center;gap:30px}
.cl-box{position:relative;flex:none;border-radius:${k.fam === "gridline" ? 3 : 14}px}
.fam-launch .cl-box,.fam-aurora .cl-box{box-shadow:inset 0 0 0 2px rgba(255,255,255,.22)}
.fam-gridline .cl-box{box-shadow:inset 0 0 0 3px var(--fg)}
.fam-pop .cl-box{background:#fff;box-shadow:0 0 0 4px #15131A}
.cl-fill{position:absolute;inset:0;border-radius:inherit;background:var(--accent)}
.fam-launch .cl-fill,.fam-aurora .cl-fill{box-shadow:0 0 30px var(--glow)}
.cl-t{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.025em;line-height:1.15}
.cl-count{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.04em;color:var(--accent)}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 240), w: k.sz(1300, a.w), h: k.sz(150, 200), size: k.sz(110, 96), a: "rise", t: 0.05 }) : "";
  const top = k.sz(scene.title ? 290 : 200, scene.title ? 520 : 400);
  const avail = k.H - k.safe.bottom - top - 20;
  const rowH = Math.min(k.sz(170, 190), avail / n);
  const bs = R(rowH * 0.62);
  const step = 0.3;
  scene.items.forEach((text, i) => {
    const y = top + i * rowH;
    const t0 = 0.35 + i * step;
    html += `<div class="cl-row" style="${box(a.x, y, k.sz(1300, a.w), rowH)}"${A("left", t0 - 0.15, 0.6, 0, ' data-y="60"')}>` +
      `<div class="cl-box" style="width:${bs}px;height:${bs}px"><i class="cl-fill"${A("pop", t0 + 0.35, 0.45, 0, ' data-from="0"')}></i>` +
      `<svg class="check abs" style="inset:0" viewBox="0 0 100 100"><path d="M24 52 L43 70 L77 32" stroke="${k.t.on}" stroke-width="12"${A("draw", t0 + 0.45, 0.35)}/></svg></div>` +
      `<div class="cl-t fit" data-fit="24" data-group="clt" style="flex:1;height:${R(rowH * 0.9)}px;font-size:${R(rowH * 0.42)}px;display:flex;align-items:center">${k.keep(text)}</div></div>`;
    sfx(k, "tick", t0 + 0.4, 0.3);
  });
  if (!k.port) html += `<div class="cl-count num" style="${box(1500, top - 10, 300, 200)}font-size:150px;text-align:right"${A("up", 0.3, 0.7)}>${n}/${n}</div>`;
  sfx(k, "done", 0.35 + n * step + 0.3, 0.3);
  return { html, css, end: 1.0 + n * step };
}

function tiles(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const cols = k.port ? (n > 3 ? 2 : 1) : n > 3 ? Math.ceil(n / 2) : n;
  const rows = Math.ceil(n / cols);
  const gap = 28;
  const top = k.sz(scene.title ? 300 : 210, scene.title ? 520 : 400);
  const w = (a.w - gap * (cols - 1)) / cols;
  const h = Math.min(k.sz(320, 360), (k.H - k.safe.bottom - top - gap * (rows - 1)) / rows);
  const css = `.tl-n{position:absolute;left:36px;top:30px;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;font-size:${k.sz(84, 76)}px;letter-spacing:-.04em;color:var(--accent)}
.tl-t{position:absolute;left:36px;right:36px;bottom:34px;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.025em;line-height:1.12}
.fam-gridline .tl-t,.fam-pop .tl-t{color:#15131A}
.fam-gridline .tl-n{color:var(--accent)}
.tl-on{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 3px var(--accent),0 0 60px ${k.rgba(k.t.accent, 0.35)};opacity:0}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(110, 240), w: a.w, h: k.sz(150, 200), size: k.sz(92, 84), a: "rise", t: 0.05 }) : "";
  scene.items.forEach((text, i) => {
    const x = a.x + (i % cols) * (w + gap);
    const y = top + Math.floor(i / cols) * (h + gap);
    const t0 = 0.35 + i * 0.22;
    html += `<div class="card" style="${box(x, y, w, h)}"${A("card", t0, 0.8)}><div class="tl-n num">${String(i + 1).padStart(2, "0")}</div>` +
      `<p class="tl-t fit" data-fit="22" data-group="tlt" style="height:${R(h * 0.5)}px;font-size:${k.sz(64, 60)}px;display:flex;align-items:flex-end">${k.keep(text)}</p>` +
      `<i class="tl-on"${A("to", t0 + 0.5, 0.4, 0, ` data-to='{"opacity":1}'`)}></i></div>`;
    sfx(k, "item", t0 + 0.1, 0.28);
  });
  return { html, css, end: 1.3 + n * 0.22 };
}

function compare(scene, k) {
  const a = area(k);
  const [was, now] = scene.items;
  const css = `.cp{position:absolute;border-radius:34px;padding:${k.sz(58, 52)}px}
.cp-l{font-size:${k.sz(24, 26)}px}
.cp-t{position:absolute;left:${k.sz(58, 52)}px;right:${k.sz(58, 52)}px;margin:0;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.035em;line-height:1.04}
.cp-old{background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.cp-old .cp-l{color:#FF7A7A}.cp-old .cp-t{color:var(--muted)}
.cp-new{background:linear-gradient(160deg,${k.mix(k.t.accent, k.t.ground, 0.55)},${k.mix(k.t.accent, k.t.ground, 0.78)});box-shadow:inset 0 0 0 1px ${k.rgba(k.t.accent, 0.6)},0 30px 90px ${k.rgba(k.t.accent, 0.35)}}
.cp-new .cp-l{color:${k.t.dark ? "#FFFFFF" : "var(--on)"};opacity:.8}.cp-new .cp-t{color:${k.t.dark ? "#FFFFFF" : "var(--on)"}}
.fam-gridline .cp-old{background:#fff;border-radius:4px;box-shadow:0 0 0 1px rgba(17,18,24,.14)}
.fam-gridline .cp-old .cp-l{color:#8A8C98}
.fam-gridline .cp-new{background:var(--accent);border-radius:4px;box-shadow:none}
.fam-pop .cp-old{background:#fff;color:#15131A;box-shadow:0 0 0 5px #15131A}.fam-pop .cp-old .cp-t{color:#7A7584}
.fam-pop .cp-new{background:var(--accent);box-shadow:0 0 0 5px #15131A,12px 14px 0 #15131A}
.fam-pop .cp-new .cp-t,.fam-pop .cp-new .cp-l{color:var(--on)}
.cp-mark{position:absolute;right:${k.sz(44, 40)}px;top:${k.sz(40, 36)}px;width:${k.sz(92, 84)}px;height:${k.sz(92, 84)}px}
.cp-strike{position:absolute;left:${k.sz(50, 46)}px;right:${k.sz(50, 46)}px;height:8px;border-radius:4px;background:#FF7A7A;transform-origin:0 50%}
.fam-gridline .cp-strike{background:var(--fg)}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(96, 240), w: a.w, h: k.sz(150, 200), size: k.sz(92, 84), a: "rise", t: 0.05 }) : "";
  const top = k.sz(scene.title ? 290 : 220, scene.title ? 520 : 400);
  const W = k.sz((a.w - 60) / 2, a.w);
  const H = k.sz(k.H - k.safe.bottom - top - 10, (k.H - k.safe.bottom - top - 60) / 2);
  const p = [{ x: a.x, y: top }, { x: k.sz(a.x + W + 60, a.x), y: k.sz(top, top + H + 60) }];
  const red = "#FF7A7A";
  html += `<div class="abs" style="${box(p[0].x, p[0].y, W, H)}transform-style:preserve-3d"${A("to", 1.85, 1.1, 0, ` data-to='{"z":-150,"rotationY":${k.port ? 0 : 9},"opacity":0.62}'`)}><div class="cp cp-old" style="${box(0, 0, W, H)}"${A("wipe", 0.35, 0.9)}><div class="cp-l label">${k.keep(was.label)}</div>` +
    `<div class="cp-t fit" data-fit="30" data-group="cpt" style="top:${k.sz(150, 120)}px;height:${R(H * 0.55)}px;font-size:${k.sz(96, 84)}px"${A("rise-lines", 0.6, 0.8)}>${k.keep(was.text)}</div>` +
    `<i class="cp-strike" style="top:${R(k.sz(150, 120) + H * 0.12)}px"${A("grow-x", 1.4, 0.45)}></i>` +
    `<svg class="cp-mark" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="${k.rgba(red, 0.12)}" stroke="${k.fam === "gridline" ? "#111218" : red}" stroke-width="3"/><path d="M32 32 L64 64 M64 32 L32 64" stroke="${k.fam === "gridline" ? "#111218" : red}" stroke-width="7" stroke-linecap="round"${A("draw", 1.3, 0.4)}/></svg></div></div>`;
  html += `<div class="abs" style="${box(p[1].x, p[1].y, W, H)}transform-style:preserve-3d"${A("to", 2.6, 1.3, 0, ` data-to='{"z":70,"rotationY":${k.port ? 0 : -5}}'`)}><div class="cp cp-new" style="${box(0, 0, W, H)}"${A("wipe", 1.9, 0.9)}><div class="cp-l label">${k.keep(now.label)}</div>` +
    `<div class="cp-t fit" data-fit="30" data-group="cpt" style="top:${k.sz(150, 120)}px;height:${R(H * 0.55)}px;font-size:${k.sz(96, 84)}px"${A("rise-lines", 2.15, 0.8)}>${k.keep(now.text)}</div>` +
    `<svg class="cp-mark" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="${k.t.dark ? k.t.accent : "#FFFFFF"}"/><path d="M28 50 L42 64 L70 34" fill="none" stroke="${k.t.dark ? k.t.on : k.t.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"${A("draw", 2.7, 0.45)}/></svg></div></div>`;
  sfx(k, "in", 0.35, 0.35);
  k.cue("error", 1.35, 0.22);
  sfx(k, "in", 1.9, 0.35);
  sfx(k, "done", 2.75, 0.35);
  return { html, css, end: 3.2 };
}

// ─── charts ────────────────────────────────────────────────────────────────
function bars(scene, k, vertical = false) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.br-l{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.02em;line-height:1.1}
.br-v{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.03em;white-space:nowrap}
.br-b{position:absolute;border-radius:${k.fam === "gridline" ? 0 : 12}px;background:var(--faint)}
.br-b.hl{background:var(--accent)}
.fam-launch .br-b.hl,.fam-aurora .br-b.hl{box-shadow:0 0 40px var(--glow)}
.fam-launch .br-b:not(.hl),.fam-aurora .br-b:not(.hl){background:${k.t.dark ? "rgba(255,255,255,.18)" : "var(--surface2)"}}
.fam-gridline .br-b:not(.hl){background:var(--fg)}
.fam-pop .br-b{box-shadow:0 0 0 4px #15131A}.fam-pop .br-b:not(.hl){background:#fff}`;
  const anyHl = scene.items.some((i) => i.highlight);
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(96, 240), w: a.w, h: k.sz(150, 200), size: k.sz(88, 80), a: "rise", t: 0.05 }) : "";
  const top = k.sz(scene.title ? 300 : 210, scene.title ? 520 : 400);
  const bottom = k.H - k.safe.bottom;
  if (!vertical) {
    const rowH = Math.min(k.sz(170, 190), (bottom - top) / n);
    const lw = k.sz(520, a.w);
    const bx = k.sz(a.x + lw + 30, a.x);
    const bw = k.sz(a.w - lw - 30 - 230, a.w - 220);
    scene.items.forEach((it, i) => {
      const y = top + i * rowH;
      const t0 = 0.35 + i * 0.16;
      const hl = it.highlight || (!anyHl && i === 0);
      const w = Math.max(14, (bw * (it.bar ?? 50)) / 100);
      const by = k.port ? y + rowH * 0.42 : y + rowH * 0.22;
      const bh = k.port ? rowH * 0.36 : rowH * 0.56;
      html += `<div class="br-l fit" data-fit="20" data-group="brl" style="${box(a.x, k.port ? y : y + rowH * 0.12, k.port ? a.w : lw, k.port ? rowH * 0.38 : rowH * 0.76)}font-size:${k.sz(54, 50)}px;display:flex;align-items:center${hl ? ";color:var(--fg)" : ";color:var(--muted)"}"${A("up", t0, 0.6)}>${k.keep(it.label)}</div>`;
      html += `<div class="br-b${hl ? " hl" : ""}" style="${box(bx, by, w, bh)}"${A("grow-x", t0 + 0.15, 1.1)}></div>`;
      html += `<div class="br-v num" style="${box(bx + w + 22, by + bh / 2 - k.sz(34, 30), 220, k.sz(68, 60))}font-size:${k.sz(64, 56)}px${hl ? ";color:var(--accent)" : ""}"${A("count", t0 + 0.35, 0.8, 0, ` data-v="${k.esc(it.value)}"`)}>${k.esc(it.value)}</div>`;
      sfx(k, "tick", t0 + 0.2, 0.22);
    });
    return { html, css, end: 1.6 + n * 0.16 };
  }
  // columns
  const colW = Math.min(k.sz(200, 150), (a.w - 40 * (n - 1)) / n);
  const total = colW * n + 40 * (n - 1);
  const x0 = (k.W - total) / 2;
  const labelH = k.sz(110, 130);
  const maxH = bottom - top - labelH - 90;
  scene.items.forEach((it, i) => {
    const x = x0 + i * (colW + 40);
    const h = Math.max(14, (maxH * (it.bar ?? 50)) / 100);
    const t0 = 0.35 + i * 0.16;
    const hl = it.highlight || (!anyHl && i === n - 1);
    const yb = bottom - labelH;
    html += `<div class="br-b${hl ? " hl" : ""}" style="${box(x, yb - h, colW, h)}"${A("grow-y", t0, 1.1)}></div>`;
    html += `<div class="br-v num" style="${box(x - 40, yb - h - k.sz(78, 70), colW + 80, 70)}text-align:center;font-size:${k.sz(52, 46)}px${hl ? ";color:var(--accent)" : ""}"${A("count", t0 + 0.3, 0.8, 0, ` data-v="${k.esc(it.value)}"`)}>${k.esc(it.value)}</div>`;
    html += `<div class="br-l fit" data-fit="18" data-group="brl" style="${box(x - 30, yb + 16, colW + 60, labelH - 20)}text-align:center;font-size:${k.sz(34, 32)}px;color:var(--muted)"${A("up", t0 + 0.2, 0.6)}>${k.keep(it.label)}</div>`;
    sfx(k, "tick", t0 + 0.1, 0.22);
  });
  return { html, css, end: 1.6 + n * 0.16 };
}
const columns = (scene, k) => bars(scene, k, true);

// ─── more figures and charts ───────────────────────────────────────────────
// A ranked list: the bars with their places in front.
function ranking(scene, k) {
  const items = scene.items.map((it, i) => ({ ...it, highlight: i === 0 }));
  const out = bars({ ...scene, items }, k);
  const a = area(k);
  const top = k.sz(scene.title ? 300 : 210, scene.title ? 520 : 400);
  const rowH = Math.min(k.sz(170, 190), (k.H - k.safe.bottom - top) / items.length);
  items.forEach((_, i) => {
    out.html += `<div class="br-v num" style="${box(a.x - k.sz(96, 0), top + i * rowH + (k.port ? 0 : rowH * 0.12), 80, k.sz(rowH * 0.76, rowH * 0.38))}font-size:${k.sz(44, 40)}px;display:${k.port ? "none" : "flex"};align-items:center;color:${i === 0 ? "var(--accent)" : "var(--muted)"}"${A("up", 0.3 + i * 0.16, 0.6)}>${i + 1}</div>`;
  });
  out.compose = true;
  return out;
}

// One bar split into shares, with a legend under it.
function split(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const palette = [k.t.accent, k.t.accent2, k.t.accent3 || k.mix(k.t.accent, k.t.fg, 0.5), k.t.dark ? "rgba(255,255,255,.35)" : "#9A9CA8"];
  const css = `.sp-bar{position:absolute;display:flex;overflow:hidden;border-radius:${k.fam === "gridline" ? 0 : 22}px}
.sp-bar i{display:block;height:100%}
.fam-pop .sp-bar{box-shadow:0 0 0 5px #15131A}
.sp-key{position:absolute}
.sp-v{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.04em;line-height:1}
.sp-l{margin-top:10px;font-size:${k.sz(38, 38)}px;color:var(--muted)}
.sp-dot{display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:12px;vertical-align:.2em}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(110, 260), w: a.w, h: k.sz(150, 200), size: k.sz(96, 84), a: "rise", t: 0.05 }) : "";
  const by = k.sz(380, 640);
  const bh = k.sz(150, 160);
  const total = scene.items.reduce((sum, it) => sum + (it.share || 0), 0) || 100;
  html += `<div class="sp-bar" style="${box(a.x, by, a.w, bh)}"${A("wipe", 0.35, 1.3)}>` +
    scene.items.map((it, i) => `<i style="width:${((100 * (it.share || 0)) / total).toFixed(2)}%;background:${palette[i % palette.length]}"></i>`).join("") + `</div>`;
  const cols = k.port ? 2 : n;
  const kw = (a.w - 40 * (cols - 1)) / cols;
  scene.items.forEach((it, i) => {
    const x = a.x + (i % cols) * (kw + 40);
    const y = by + bh + 60 + Math.floor(i / cols) * k.sz(220, 230);
    html += `<div class="sp-key" style="${box(x, y, kw, k.sz(200, 210))}"${A("up", 0.9 + i * 0.15, 0.7)}>` +
      `<div class="sp-v num" style="font-size:${k.sz(110, 100)}px"><span class="sp-dot" style="background:${palette[i % palette.length]}"></span><span${A("count", 1.0 + i * 0.15, 0.8, 0, ` data-v="${k.esc(it.value)}"`)}>${k.esc(it.value)}</span></div>` +
      `<div class="sp-l fit" data-fit="20" style="height:60px">${k.keep(it.label)}</div></div>`;
    sfx(k, "tick", 1.0 + i * 0.15, 0.22);
  });
  sfx(k, "in", 0.35, 0.35);
  return { html, css, end: 1.8 + n * 0.15 };
}

// A trend drawn left to right, its last point lit, its two ends labelled.
function line(scene, k) {
  const a = area(k);
  const pts = scene.points || [];
  const css = `.ln-lab{position:absolute;font-size:${k.sz(38, 38)}px;color:var(--muted)}
.ln-path{fill:none;stroke-linecap:round;stroke-linejoin:round}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 250), w: a.w, h: k.sz(150, 200), size: k.sz(96, 84), a: "rise", t: 0.05 }) : "";
  const gx = a.x + 20;
  const gy = k.sz(scene.title ? 300 : 220, scene.title ? 520 : 420);
  const gw = a.w - 40;
  const gh = k.H - k.safe.bottom - gy - k.sz(90, 120);
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const P = pts.map((v, i) => [gx + (gw * i) / Math.max(1, pts.length - 1), gy + gh - ((v - lo) / (hi - lo || 1)) * gh * 0.86 - gh * 0.07]);
  const d = P.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area2 = `${d} L${P[P.length - 1][0].toFixed(1)} ${gy + gh} L${P[0][0].toFixed(1)} ${gy + gh} Z`;
  const [lx, ly] = P[P.length - 1];
  html += `<svg class="abs" style="${box(0, 0, k.W, k.H)}" viewBox="0 0 ${k.W} ${k.H}">` +
    `<defs><linearGradient id="lnf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.t.accent}" stop-opacity=".35"/><stop offset="1" stop-color="${k.t.accent}" stop-opacity="0"/></linearGradient></defs>` +
    `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${k.t.line}" stroke-width="2"${A("draw", 0.2, 0.8)}/>` +
    `<path d="${area2}" fill="url(#lnf)"${A("fade", 1.3, 0.8)}/>` +
    `<path class="ln-path" d="${d}" stroke="${k.t.accent}" stroke-width="${k.sz(8, 8)}"${A("draw", 0.4, 1.6, 0, ' data-e="power2.inOut"')}${k.t.dark ? ` style="filter:drop-shadow(0 0 12px ${k.rgba(k.t.accent, 0.8)})"` : ""}/>` +
    `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${k.sz(18, 18)}" fill="${k.t.accent}"${A("pop", 1.9, 0.6)} style="transform-origin:${lx.toFixed(1)}px ${ly.toFixed(1)}px"/></svg>`;
  const ends = scene.items || [];
  if (ends[0]) html += `<div class="ln-lab label" style="${box(gx, gy + gh + 20, gw / 2, 60)}"${A("up", 0.5, 0.6)}>${k.keep(ends[0].label)}</div>`;
  if (ends[1]) html += `<div class="ln-lab label" style="${box(gx + gw / 2, gy + gh + 20, gw / 2, 60)}text-align:right"${A("up", 1.9, 0.6)}>${k.keep(ends[1].label)}</div>`;
  sfx(k, "in", 0.4, 0.3);
  sfx(k, "hit", 1.95, 0.35);
  return { html, css, end: 2.6 };
}

// A half ring with a needle that swings to its value.
function gauge(scene, k) {
  const a = area(k);
  const pct = Math.max(0, Math.min(100, scene.percent || 0));
  const r = k.sz(400, 400);
  const cx = k.W / 2;
  const cy = k.sz(scene.title ? 720 : 680, 1100);
  const css = `.gg-v{position:absolute;font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;text-align:center;white-space:nowrap}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 300), w: a.w, h: k.sz(150, 200), size: k.sz(96, 84), align: "center", a: "rise", t: 0.05 }) : "";
  halo(k, cx, cy, r * 1.4, k.t.accent, 0.3, 0);
  const sw = k.sz(56, 60);
  const L = Math.PI * r;
  html += `<svg class="abs" style="${box(cx - r - sw, cy - r - sw, 2 * (r + sw), r + 2 * sw)}" viewBox="0 0 ${2 * (r + sw)} ${r + 2 * sw}">` +
    `<path d="M${sw} ${r + sw} A${r} ${r} 0 0 1 ${2 * r + sw} ${r + sw}" fill="none" stroke="${k.t.faint}" stroke-width="${sw}" stroke-linecap="round"/>` +
    `<path d="M${sw} ${r + sw} A${r} ${r} 0 0 1 ${2 * r + sw} ${r + sw}" fill="none" stroke="${k.t.accent}" stroke-width="${sw}" stroke-linecap="round" style="stroke-dasharray:${L.toFixed(1)};stroke-dashoffset:${L.toFixed(1)}"${A("to", 0.4, 1.5, 0, ` data-e="expo.inOut" data-to='{"strokeDashoffset":${((L * (100 - pct)) / 100).toFixed(1)}}'`)}/></svg>`;
  html += `<div class="abs" style="${box(cx - 4, cy - r + 30, 8, r - 30)}border-radius:4px;background:var(--fg);transform-origin:50% 100%;transform:rotate(-90deg)"${A("to", 0.4, 1.5, 0, ` data-e="back.out(1.4)" data-to='{"rotation":${(-90 + (180 * pct) / 100).toFixed(1)}}'`)}></div>`;
  html += `<div class="gg-v fit num" data-fit="60" style="${box(cx - r * 0.7, cy - k.sz(170, 180), r * 1.4, k.sz(150, 160))}font-size:${k.sz(140, 150)}px"${A("count", 0.6, 1.0, 0, ` data-v="${k.esc(scene.value)}"`)}>${k.esc(scene.value)}</div>`;
  html += bodyText(k, scene.text, { x: a.x, y: cy + k.sz(40, 60), w: a.w, h: k.sz(120, 160), size: k.sz(52, 50), t: 1.4, align: "center" });
  sfx(k, "in", 0.4, 0.3);
  sfx(k, "hit", 1.8, 0.35);
  return { html, css, end: 2.3 };
}

// A score: five stars that fill to it, the score itself large.
function rating(scene, k) {
  const a = area(k);
  const score = Math.max(0, Math.min(5, scene.score || 0));
  const size = k.sz(150, 150);
  const css = `.rt-v{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1}
.rt-stars{display:flex;gap:${k.sz(22, 18)}px}
.rt-s{position:relative;width:${size}px;height:${size}px}
.rt-s svg{position:absolute;inset:0;width:100%;height:100%}`;
  const star = "M50 4 L62 37 L97 38 L69 59 L79 93 L50 73 L21 93 L31 59 L3 38 L38 37 Z";
  const stars = Array.from({ length: 5 }, (_, i) => {
    const fill = Math.max(0, Math.min(1, score - i));
    return `<div class="rt-s"${A("pop", 0.6 + i * 0.12, 0.6)}><svg viewBox="0 0 100 100"><path d="${star}" fill="${k.t.faint}"/></svg>` +
      `<svg viewBox="0 0 100 100" style="clip-path:inset(0 ${((1 - fill) * 100).toFixed(0)}% 0 0)"><path d="${star}" fill="${k.t.accent}"${k.t.dark ? ` style="filter:drop-shadow(0 0 10px ${k.rgba(k.t.accent, 0.7)})"` : ""}/></svg></div>`;
  }).join("");
  const html = stack(a.x, k.sz(220, 520), a.w, [
    scene.title ? flowTitle(k, k.marked(scene.title), k.sz(88, 80), { a: "rise", t: 0.05 }) : "",
    `<div class="rt-v num" style="font-size:${k.sz(260, 240)}px"${A("count", 0.2, 1.0, 0, ` data-v="${k.esc(scene.value)}"`)}>${k.esc(scene.value)}</div>`,
    `<div class="rt-stars">${stars}</div>`,
    flowText(k, scene.text, k.sz(48, 48), { t: 1.4 }),
  ], { gap: k.sz(30, 34), align: "center" });
  for (let i = 0; i < 5; i++) sfx(k, "tick", 0.65 + i * 0.12, 0.2);
  return { html, css, end: 2.0 };
}

// Stages narrowing down, each with its figure.
function funnel(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.fn-s{position:absolute;display:flex;align-items:center;justify-content:space-between;padding:0 ${k.sz(50, 40)}px;border-radius:${k.fam === "gridline" ? 0 : 18}px}
.fn-l{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.02em}
.fn-v{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.03em}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 250), w: a.w, h: k.sz(150, 200), size: k.sz(92, 84), a: "rise", t: 0.05 }) : "";
  const top = k.sz(scene.title ? 290 : 220, scene.title ? 520 : 420);
  const rowH = Math.min(k.sz(150, 170), (k.H - k.safe.bottom - top) / n - 14);
  scene.items.forEach((it, i) => {
    const w = a.w * (1 - (0.45 * i) / Math.max(1, n - 1));
    const x = (k.W - w) / 2;
    const y = top + i * (rowH + 14);
    const last = i === n - 1;
    const bg = last ? "var(--accent)" : k.t.dark ? k.rgba("#FFFFFF", 0.08 + 0.05 * i) : k.fam === "pop" ? "#FFFFFF" : k.mix(k.t.ground, k.t.fg, 0.08 + 0.06 * i);
    const fg = last ? "var(--on)" : k.fam === "pop" ? "#15131A" : "var(--fg)";
    html += `<div class="fn-s" style="${box(x, y, w, rowH)}background:${bg};color:${fg}${k.fam === "pop" ? ";box-shadow:0 0 0 4px #15131A" : ""}"${A("grow-x", 0.3 + i * 0.2, 0.8, 0, ' data-o="50% 50%"')}>` +
      `<span class="fn-l fit" data-fit="20" style="font-size:${k.sz(46, 42)}px;flex:1;white-space:nowrap;overflow:hidden">${k.keep(it.label)}</span>` +
      `<span class="fn-v num" style="font-size:${k.sz(58, 52)}px"${A("count", 0.6 + i * 0.2, 0.8, 0, ` data-v="${k.esc(it.value)}"`)}>${k.esc(it.value)}</span></div>`;
    sfx(k, "tick", 0.35 + i * 0.2, 0.22);
  });
  return { html, css, end: 1.4 + n * 0.2 };
}

// Steps around a ring, lit one after another, a dot travelling the ring.
function cycle(scene, k) {
  const n = scene.items.length;
  const cx = k.W / 2;
  const cy = k.sz(scene.title ? 560 : 500, 900);
  const R0 = k.sz(330, 340);
  const css = `.cy-n{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:28px;padding:0 20px}
.cy-t{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.02em;line-height:1.1}
.fam-gridline .cy-n,.fam-pop .cy-n{color:#15131A}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: area(k).x, y: k.sz(90, 250), w: area(k).w, h: k.sz(140, 200), size: k.sz(88, 80), align: "center", a: "rise", t: 0.05 }) : "";
  html += `<svg class="abs" style="${box(cx - R0 - 10, cy - R0 - 10, 2 * R0 + 20, 2 * R0 + 20)}" viewBox="0 0 ${2 * R0 + 20} ${2 * R0 + 20}"><circle cx="${R0 + 10}" cy="${R0 + 10}" r="${R0}" fill="none" stroke="${k.t.accent}" stroke-opacity=".6" stroke-width="5" transform="rotate(-90 ${R0 + 10} ${R0 + 10})"${A("draw", 0.2, 1.4)}/></svg>`;
  const bw = k.sz(400, 360);
  const bh = k.sz(160, 160);
  scene.items.forEach((text, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const x = cx + R0 * Math.cos(ang) - bw / 2;
    const y = cy + R0 * Math.sin(ang) - bh / 2;
    html += `<div class="card cy-n" style="${box(x, y, bw, bh)}"${A("pop", 0.4 + i * 0.22, 0.7)}><div class="cy-t fit" data-fit="20" data-group="cyt" style="width:100%;height:${bh - 30}px;font-size:${k.sz(54, 50)}px;display:flex;align-items:center;justify-content:center">${k.keep(text)}</div></div>`;
    sfx(k, "tick", 0.45 + i * 0.22, 0.22);
  });
  return { html, css, end: 1.4 + n * 0.22, compose: true };
}

// Pros and cons in two columns.
function proscons(scene, k) {
  const a = area(k);
  const css = `.pc-col{position:absolute}
.pc-h{font-size:${k.sz(26, 26)}px;margin-bottom:24px}
.pc-row{display:flex;align-items:flex-start;gap:22px;margin-bottom:${k.sz(26, 22)}px}
.pc-i{flex:none;width:${k.sz(76, 70)}px;height:${k.sz(76, 70)}px;border-radius:50%;display:grid;place-items:center;font-size:${k.sz(42, 40)}px;font-weight:800}
.pc-t{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.02em;line-height:1.15;font-size:${k.sz(64, 58)}px}`;
  const pros = scene.pros || [];
  const cons = scene.cons || [];
  const colW = k.sz((a.w - 80) / 2, a.w);
  const top = k.sz(scene.title ? 300 : 220, scene.title ? 520 : 420);
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 250), w: a.w, h: k.sz(150, 200), size: k.sz(92, 84), a: "rise", t: 0.05 }) : "";
  const col = (list, good, x, y, t0) => `<div class="pc-col" style="left:${R(x)}px;top:${R(y)}px;width:${R(colW)}px">` +
    list.map((text, i) => `<div class="pc-row"${A("left", t0 + i * 0.18, 0.6, 0, ' data-y="50"')}><span class="pc-i" style="background:${good ? "var(--accent)" : k.rgba("#FF6B6B", 0.18)};color:${good ? "var(--on)" : "#FF6B6B"}">${k.icon(good ? "check" : "x", "bold")}</span><span class="pc-t">${k.keep(text)}</span></div>`).join("") + `</div>`;
  html += col(pros, true, a.x, top, 0.3);
  html += col(cons, false, k.sz(a.x + colW + 80, a.x), k.sz(top, top + 120 * pros.length + 80), 0.3 + pros.length * 0.18 + 0.2);
  sfx(k, "tick", 0.35, 0.25);
  sfx(k, "tick", 0.55 + pros.length * 0.18, 0.25);
  return { html, css, end: 1.4 + (pros.length + cons.length) * 0.18 };
}

// ─── product moments ───────────────────────────────────────────────────────
// Notifications landing one after another and stacking.
function notify(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.nt{position:absolute;display:flex;align-items:center;gap:${k.sz(30, 26)}px;padding:0 ${k.sz(36, 30)}px}
.nt .box{width:${k.sz(92, 86)}px;height:${k.sz(92, 86)}px;font-size:${k.sz(46, 42)}px}
.nt-t{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);letter-spacing:-.02em;line-height:1.1}
.nt-p{color:var(--muted);line-height:1.25;margin-top:6px}
.fam-gridline .nt-t,.fam-pop .nt-t{color:#15131A}
.fam-gridline .nt-p,.fam-pop .nt-p{color:#4A4D5C}
.nt-time{position:absolute;right:${k.sz(34, 28)}px;top:${k.sz(26, 22)}px;font-size:${k.sz(24, 24)}px;color:var(--muted)}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 250), w: a.w, h: k.sz(150, 200), size: k.sz(92, 84), align: "center", a: "rise", t: 0.05 }) : "";
  const w = k.sz(1100, a.w);
  const x = (k.W - w) / 2;
  const top = k.sz(scene.title ? 300 : 220, scene.title ? 520 : 420);
  const h = Math.min(k.sz(170, 190), (k.H - k.safe.bottom - top) / n - 20);
  scene.items.forEach((it, i) => {
    const y = top + i * (h + 20);
    html += `<div class="card nt" style="${box(x, y, w, h)}"${A("down", 0.3 + i * 0.35, 0.7, 0, ' data-y="70"')}>` +
      (it.icon ? `<div class="box">${k.icon(it.icon)}</div>` : "") +
      `<div style="flex:1;min-width:0"><div class="nt-t fit" data-fit="22" data-group="ntt" style="height:${R(h * 0.36)}px;font-size:${k.sz(48, 46)}px;white-space:nowrap;overflow:hidden">${k.keep(it.title)}</div>` +
      (it.text ? `<div class="nt-p fit" data-fit="18" data-group="ntp" style="height:${R(h * 0.36)}px;font-size:${k.sz(34, 34)}px">${k.keep(it.text)}</div>` : "") + `</div>` +
      (it.time ? `<div class="nt-time label">${k.keep(it.time)}</div>` : "") + `</div>`;
    k.cue("notification", (0.35 + i * 0.35), 0.28);
  });
  return { html, css, end: 1.2 + n * 0.35 };
}

// A conversation: bubbles from the two sides, one after another.
function chat(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.ch-b{position:relative;max-width:${k.sz(1100, 860)}px;padding:${k.sz(26, 24)}px ${k.sz(36, 30)}px;border-radius:34px;font-size:${k.sz(44, 42)}px;line-height:1.28}
.ch-me{align-self:flex-end;background:var(--accent);color:var(--on);border-bottom-right-radius:10px}
.ch-them{align-self:flex-start;background:${k.t.dark ? "rgba(255,255,255,.1)" : "#FFFFFF"};color:${k.t.dark ? "var(--fg)" : "#15131A"};border-bottom-left-radius:10px${k.fam === "pop" ? ";box-shadow:0 0 0 4px #15131A" : ""}}
.ch-from{font-size:${k.sz(22, 22)}px;color:var(--muted);margin:0 10px 8px}
.ch-me+.ch-from,.ch-from.me{align-self:flex-end}`;
  const parts = [];
  scene.items.forEach((it, i) => {
    const me = String(it.from).toLowerCase() === "me";
    if (!me) parts.push(`<div class="ch-from label"${A("fade", 0.25 + i * 0.5, 0.4)}>${k.keep(it.from)}</div>`);
    parts.push(`<div class="ch-b ${me ? "ch-me" : "ch-them"}"${A("pop", 0.3 + i * 0.5, 0.6, 0, ' data-from="0.6"')}>${k.keep(it.text)}</div>`);
    k.cue(me ? "whoosh-short" : "pop", 0.3 + i * 0.5, 0.25);
  });
  const html = (scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(100, 250), w: a.w, h: k.sz(150, 200), size: k.sz(88, 80), align: "center", a: "rise", t: 0.05 }) : "") +
    `<div class="stk" style="left:${R(k.sz(a.x + 140, a.x))}px;top:${k.sz(scene.title ? 300 : 200, scene.title ? 520 : 420)}px;width:${R(k.sz(a.w - 280, a.w))}px;gap:${k.sz(18, 16)}px">${parts.join("")}</div>`;
  return { html, css, end: 0.9 + n * 0.5 };
}

// A query typed into a search box, then its results rising under it.
function search(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const q = k.plain(scene.value);
  const css = `.sr-box{display:flex;align-items:center;gap:24px;width:100%;height:${k.sz(120, 120)}px;padding:0 36px;border-radius:999px}
.fam-launch .sr-box,.fam-aurora .sr-box{background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 0 60px ${k.rgba(k.t.accent, 0.25)}}
.fam-gridline .sr-box{background:#fff;border-radius:4px;box-shadow:0 0 0 2px #111218}
.fam-pop .sr-box{background:#fff;color:#15131A;box-shadow:0 0 0 5px #15131A}
.sr-q{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);font-size:${k.sz(52, 46)}px;white-space:nowrap;overflow:hidden}
.sr-caret{display:inline-block;width:4px;height:1em;background:var(--accent);vertical-align:-.12em;animation:srb 1s steps(1) infinite}
@keyframes srb{50%{opacity:0}}
.sr-r{width:100%;padding:${k.sz(26, 24)}px ${k.sz(36, 30)}px;position:relative}
.sr-t{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:var(--hw);font-size:${k.sz(44, 42)}px;letter-spacing:-.02em;color:var(--accent)}
.sr-p{font-size:${k.sz(32, 32)}px;color:var(--muted);margin-top:6px}
.fam-pop .sr-t{color:#15131A}.fam-pop .sr-p,.fam-gridline .sr-p{color:#4A4D5C}`;
  const tq = 0.3;
  const cps = Math.max(16, q.length / 1.4);
  const done = tq + q.length / cps;
  const parts = [
    `<div class="sr-box"${A("pop", 0.05, 0.6, 0, ' data-from="0.85"')}><span style="font-size:${k.sz(48, 44)}px;color:var(--accent)">${k.icon("magnifying-glass", "bold")}</span>` +
      `<span class="sr-q"><span${A("type", tq, 0, 0, ` data-v="${k.esc(q)}" data-cps="${R(cps)}"`)}>${k.esc(q)}</span><span class="sr-caret"></span></span></div>`,
    ...scene.items.map((it, i) => `<div class="card sr-r" style="position:relative"${A("up", done + 0.2 + i * 0.18, 0.6)}><div class="sr-t">${k.keep(it.title)}</div>${it.text ? `<div class="sr-p">${k.keep(it.text)}</div>` : ""}</div>`),
  ];
  const html = `<div class="stk" style="left:${R(k.sz(a.x + 120, a.x))}px;top:${k.sz(200, 420)}px;width:${R(k.sz(a.w - 240, a.w))}px;gap:${k.sz(22, 20)}px">${parts.join("")}</div>`;
  k.cue("typing", tq, 0.3);
  sfx(k, "item", done + 0.25, 0.25);
  return { html, css, end: done + 0.9 + n * 0.18 };
}

// Plan cards side by side, the highlighted one forward and lit.
function pricing(scene, k) {
  const a = area(k);
  const n = scene.items.length;
  const css = `.pr{position:absolute;padding:${k.sz(48, 40)}px}
.pr-n{font-size:${k.sz(28, 26)}px;color:var(--muted)}
.pr-p{font-family:var(--head),system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-weight:800;letter-spacing:-.05em;line-height:1;margin-top:18px;white-space:nowrap}
.pr-per{font-size:${k.sz(30, 28)}px;color:var(--muted);margin-left:8px;font-weight:500;letter-spacing:0}
.pr ul{list-style:none;margin:26px 0 0;padding:0}
.pr li{font-size:${k.sz(32, 30)}px;line-height:1.3;margin-top:12px;display:flex;gap:12px}
.pr li::before{content:"";flex:none;width:12px;height:12px;margin-top:.45em;border-radius:50%;background:var(--accent)}
.fam-gridline .pr,.fam-pop .pr{color:#15131A}
.pr.hi{box-shadow:inset 0 0 0 3px var(--accent),0 40px 100px ${k.rgba(k.t.accent, 0.35)}}`;
  let html = scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(90, 240), w: a.w, h: k.sz(140, 200), size: k.sz(88, 80), align: "center", a: "rise", t: 0.05 }) : "";
  const slots = cardSlots(k, n, { top: k.sz(scene.title ? 270 : 200, scene.title ? 500 : 400), height: k.sz(560, 360), gap: k.sz(36, 28), maxW: 520 });
  slots.forEach((s, i) => {
    const it = scene.items[i];
    html += `<div class="card pr${it.highlight ? " hi" : ""}" style="${box(s.x, s.y, s.w, s.h)}"${A("card", 0.4 + i * 0.18, 0.9, 0, ` data-to='{"rotationY":${s.rot},"z":${it.highlight ? 60 : 0}}'`)}>` +
      `<div class="pr-n label">${k.keep(it.name)}</div>` +
      `<div class="pr-p num" style="font-size:${k.sz(100, 90)}px">${k.keep(it.price)}${it.period ? `<span class="pr-per">${k.keep(it.period)}</span>` : ""}</div>` +
      (it.features && it.features.length ? `<ul>${it.features.map((f) => `<li>${k.keep(f)}</li>`).join("")}</ul>` : "") + `</div>`;
    sfx(k, "item", 0.5 + i * 0.18, 0.25);
  });
  return { html, css, end: 1.5 + n * 0.18 };
}

// A code card whose lines type in.
function code(scene, k) {
  const a = area(k);
  const lines = scene.code || [];
  const css = `.cd{position:absolute;padding:${k.sz(50, 40)}px;border-radius:26px;background:#0D1117;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 40px 90px rgba(0,0,0,.5)}
.cd-dots{display:flex;gap:10px;margin-bottom:26px}.cd-dots i{width:14px;height:14px;border-radius:50%;display:block}
.cd pre{margin:0;font-family:"JetBrains Mono",monospace;color:#E6EDF3;line-height:1.45;white-space:pre}`;
  const fs = Math.min(k.sz(40, 30), R(k.sz(1500, 900) / Math.max(20, ...lines.map((l) => l.length)) / 0.62));
  const total = lines.join("\n");
  const cps = Math.max(40, total.length / 1.8);
  const html = (scene.title ? bigType(k, k.marked(scene.title), { x: a.x, y: k.sz(90, 240), w: a.w, h: k.sz(140, 200), size: k.sz(84, 76), a: "rise", t: 0.05 }) : "") +
    `<div class="cd" style="left:${R(a.x)}px;top:${k.sz(scene.title ? 270 : 180, scene.title ? 500 : 380)}px;width:${R(a.w)}px"${A("card", 0.1, 0.8)}><div class="cd-dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>` +
    `<pre style="font-size:${fs}px"><span${A("type", 0.5, 0, 0, ` data-v="${k.esc(total)}" data-cps="${R(cps)}"`)}>${k.esc(total)}</span></pre></div>`;
  k.cue("typing", 0.5, 0.3);
  return { html, css, end: 0.6 + total.length / cps };
}

module.exports = { opener, point, headline, bigword, wordstack, typewriter, strike, quote, term, spotlight, number, numbers, change, donut, progress, features, steps, timeline, flow, checklist, tiles, compare, bars, columns,
  ranking, split, line, gauge, rating, funnel, cycle, proscons, notify, chat, search, pricing, code, KIT_CSS };
