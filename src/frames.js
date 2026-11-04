"use strict";
// ─── frames ────────────────────────────────────────────────────────────────
// Stills of a finished film, for looking at before it is handed over, and
// the cuts they are taken around. The cuts come from the timeline the render
// writes next to the film (exact), from a list given, or from the picture
// itself: a frame far more unlike the one before than the frames around it
// is a hard cut, and a picture that starts to change after it stood still
// is a soft change (a crossfade, or something that starts to move). The
// frames command saves two stills a shot and a contact sheet; check uses the
// same cuts and sheet.

const fs = require("fs");
const path = require("path");
const { mustRun, probe, readPixels, writePng } = require("./ffmpeg");
const draw = require("./draw");

// A path as one value inside an ffmpeg filter graph.
const filterPath = (p) => `'${String(p).replace(/\\/g, "/").replace(/'/g, "\\'").replace(/:/g, "\\:")}'`;

// The clips launch-film's render listed next to the film, or null.
function readTimeline(film) {
  try {
    const t = JSON.parse(fs.readFileSync(film.replace(/\.mp4$/i, "") + ".timeline.json", "utf8"));
    return Array.isArray(t.clips) && t.clips.length ? t.clips : null;
  } catch {
    return null;
  }
}

// Stretches that touch or nearly touch, made one.
function joinStretches(list, gap = 0.05) {
  const out = [];
  for (const s of [...list].sort((a, b) => a.from - b.from)) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to + gap) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out.map((s) => ({ from: +s.from.toFixed(3), to: +s.to.toFixed(3), seconds: +(s.to - s.from).toFixed(3) }));
}

// One pass over the picture, made small: each frame's difference from the
// one before (scdet's score and mean difference), and the stretches
// blackdetect and freezedetect find. `work` is a folder for the pass's notes.
async function scanVideo(film, { work, duration }) {
  const notes = path.join(work, `.scan-video-${process.pid}.txt`);
  try {
    await mustRun(["-i", film, "-an", "-vf",
      `scale=320:-2,scdet=threshold=100,blackdetect=d=0.04:pix_th=0.10:pic_th=0.98,freezedetect=n=-60dB:d=0.5,metadata=mode=print:file=${filterPath(notes)}`,
      "-f", "null", "-"], "reading the picture");
    const frames = [];
    const black = [];
    const frozen = [];
    let cur = null;
    let blackFrom = null;
    let freezeFrom = null;
    for (const line of fs.readFileSync(notes, "utf8").split("\n")) {
      const f = /^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(line);
      if (f) {
        cur = { t: Number(f[1]), score: 0, mafd: 0 };
        frames.push(cur);
        continue;
      }
      const m = /^lavfi\.([\w.]+)=(\S+)/.exec(line);
      if (!m || !cur) continue;
      const v = Number(m[2]);
      if (m[1] === "scd.score") cur.score = v;
      else if (m[1] === "scd.mafd") cur.mafd = v;
      else if (m[1] === "black_start") blackFrom = v;
      else if (m[1] === "black_end") {
        black.push({ from: blackFrom === null ? 0 : blackFrom, to: v });
        blackFrom = null;
      } else if (m[1] === "freezedetect.freeze_start") freezeFrom = v;
      else if (m[1] === "freezedetect.freeze_end") {
        frozen.push({ from: freezeFrom === null ? 0 : freezeFrom, to: v });
        freezeFrom = null;
      }
    }
    // A stretch still open at the end runs to the end.
    if (blackFrom !== null) black.push({ from: blackFrom, to: duration });
    if (freezeFrom !== null) frozen.push({ from: freezeFrom, to: duration });
    return { frames, black: joinStretches(black), frozen: joinStretches(frozen) };
  } finally {
    fs.rmSync(notes, { force: true });
  }
}

// Hard cuts and soft changes in the frames' differences. A hard cut scores
// 10 or more on scdet's scale and three times its neighbours; a soft change
// starts after three frames that stood still, and keeps changing for the
// next ten.
function detectCuts(frames) {
  const found = [];
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  for (let i = 1; i < frames.length; i++) {
    const s = frames[i].score;
    if (s < 10) continue;
    const around = [...frames.slice(Math.max(1, i - 4), i), ...frames.slice(i + 1, i + 5)].map((f) => f.score);
    if (s >= 3 * Math.max(0.3, median(around))) found.push({ at: frames[i].t, hard: true, score: +s.toFixed(1) });
  }
  const still = (f) => f.mafd < 0.15;
  for (let i = 3; i < frames.length; i++) {
    if (still(frames[i]) || !still(frames[i - 1]) || !still(frames[i - 2]) || !still(frames[i - 3])) continue;
    const next = frames.slice(i, i + 10).map((f) => f.mafd);
    const early = next.slice(0, 6);
    if (early.reduce((a, b) => a + b, 0) / early.length >= 0.4 && next.reduce((a, b) => a + b, 0) >= 4) found.push({ at: frames[i].t, hard: false, score: +next[0].toFixed(2) });
  }
  found.sort((a, b) => a.at - b.at);
  const out = [];
  for (const c of found) {
    const near = out.find((o) => Math.abs(o.at - c.at) < (o.hard && c.hard ? 0.25 : 0.5));
    if (!near) out.push(c);
    else if (c.hard && (!near.hard || c.score > near.score)) Object.assign(near, c);
  }
  return out;
}

// Cuts given by hand: seconds as "3.2,7.5", or a JSON file holding seconds
// ([3.2, 7.5]), frames ({ "fps": 30, "cuts": [96, 225] }) or a launch-film
// timeline ({ "clips": [{ "start": 3.2 }] }).
function givenCuts(given) {
  const text = String(given);
  if (fs.existsSync(text) && fs.statSync(text).isFile()) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(text, "utf8"));
    } catch (err) {
      throw new Error(`${text} could not be read as JSON: ${err.message}`);
    }
    let seconds = null;
    if (Array.isArray(raw)) seconds = raw.map(Number);
    else if (raw && Array.isArray(raw.clips)) seconds = raw.clips.map((c) => Number(c && c.start));
    else if (raw && Array.isArray(raw.cuts) && Number(raw.fps) > 0) seconds = raw.cuts.map((f) => Number(f) / Number(raw.fps));
    if (!seconds || seconds.some((s) => !Number.isFinite(s) || s < 0)) throw new Error(`${text} holds no cuts: give seconds, { "fps", "cuts" } in frames, or a launch-film timeline`);
    return seconds;
  }
  const seconds = text.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (!seconds.length || seconds.some((s) => !Number.isFinite(s) || s < 0)) throw new Error(`--cuts "${text}" is not a list of seconds or a file`);
  return seconds;
}

// The film's cuts, the first at 0: [{ at, hard, source, label }]. source is
// "timeline", "given" or "picture"; only the picture's soft changes are
// unsure (hard: false).
async function findCuts(film, { info, work, scan = null, given = null }) {
  const clips = given ? null : readTimeline(film);
  let cuts;
  let source;
  if (given) {
    source = "given";
    cuts = givenCuts(given).map((at) => ({ at, hard: true, source, label: "" }));
  } else if (clips) {
    source = "timeline";
    cuts = clips.map((c) => ({ at: Number(c.start) || 0, hard: true, source, label: [c.kind, c.type].filter(Boolean).join(" ") }));
  } else {
    source = "picture";
    const frames = (scan || (await scanVideo(film, { work, duration: info.duration }))).frames;
    cuts = detectCuts(frames).map((c) => ({ ...c, source, label: c.hard ? "" : "soft" }));
  }
  cuts = cuts.filter((c) => c.at < info.duration - 0.05).sort((a, b) => a.at - b.at);
  if (!cuts.length || cuts[0].at > 0.05) cuts.unshift({ at: 0, hard: true, source, label: "" });
  cuts.forEach((c, i) => {
    c.index = i + 1;
    c.at = +c.at.toFixed(3);
  });
  return { cuts, source };
}

// The shots between the cuts: [{ index, start, seconds, label }].
const shotsOf = (cuts, duration) => cuts.map((c, i) => ({ index: c.index, start: c.at, seconds: (i + 1 < cuts.length ? cuts[i + 1].at : duration) - c.at, label: c.label, hard: c.hard }));

// A shot's settled moment: once its entrance has played.
const settled = (shot) => shot.start + Math.min(shot.seconds * 0.55, 2.4);

// Saves a frame at each moment: [{ at, name }] in, [{ file, at, label }] out.
async function grabFrames(film, moments, dir, { duration, ext = "jpg" }) {
  const stills = [];
  for (const m of moments) {
    const at = Math.max(0, Math.min(duration - 0.05, m.at));
    const file = path.join(dir, `${m.name}.${ext}`);
    await mustRun(["-ss", at.toFixed(3), "-i", film, "-frames:v", "1", "-q:v", "3", file], "saving a still");
    stills.push({ file, at: +at.toFixed(2), label: m.label || "" });
  }
  return stills;
}

// A contact sheet: the stills four a row, each with its number, time and
// label under it, a title over them all. Written as PNG or JPEG by the file's
// extension.
async function contactSheet(stills, file, { title = "", cols = 4 } = {}) {
  const pics = stills.map((s) => readPixels(s.file, 480));
  const tileW = Math.max(...pics.map((p) => p.width));
  const tileH = Math.max(...pics.map((p) => p.height));
  const pad = 12;
  const label = 30;
  const head = title ? 44 : pad;
  const rows = Math.ceil(stills.length / cols);
  const width = pad + Math.min(cols, stills.length) * (tileW + pad);
  const height = head + rows * (tileH + label + pad);
  const c = draw.canvas(width, height, "#15171C");
  if (title) draw.text(c, pad, 15, title, "#E8EAF0", 2);
  stills.forEach((s, i) => {
    const x = pad + (i % cols) * (tileW + pad);
    const y = head + Math.floor(i / cols) * (tileH + label + pad);
    const p = pics[i];
    draw.rect(c, x, y, tileW, tileH, "#000000");
    draw.blit(c, p, x + Math.round((tileW - p.width) / 2), y + Math.round((tileH - p.height) / 2));
    const n = draw.text(c, x, y + tileH + 9, `${s.number || i + 1}`, "#FFFFFF", 2);
    const t = draw.text(c, x + n + 14, y + tileH + 9, `${s.at.toFixed(2)} S`, "#AEB4C4", 2);
    // The label is cut to the tile's width.
    const room = Math.floor((tileW - n - t - 28 + 2) / 12);
    const words = String(s.label || "");
    if (words && room > 2) draw.text(c, x + n + t + 28, y + tileH + 9, words.length > room ? `${words.slice(0, room - 1)}.` : words, s.labelColour || "#7D8494", 2);
  });
  await writePng(file, c);
  return file;
}

// The frames command: two stills a shot (once its entrance has played, and
// near its end) and a contact sheet of them all. A film with one shot gets
// twelve stills spread evenly.
async function saveFrames(file, { out = null } = {}) {
  const film = path.resolve(file);
  const info = probe(film);
  if (!info.duration) throw new Error(`${file} could not be read as a video`);
  const dir = path.resolve(out || path.join(path.dirname(film), "frames"));
  fs.mkdirSync(dir, { recursive: true });
  const { cuts } = await findCuts(film, { info, work: dir });
  const moments = [];
  if (cuts.length > 1) {
    for (const s of shotsOf(cuts, info.duration)) {
      moments.push({ at: settled(s), name: `clip-${s.index}-a`, label: s.label });
      moments.push({ at: s.start + s.seconds - 0.3, name: `clip-${s.index}-b`, label: s.label });
    }
  } else {
    for (let i = 0; i < 12; i++) moments.push({ at: ((i + 0.5) * info.duration) / 12, name: `still-${i + 1}` });
  }
  const stills = await grabFrames(film, moments, dir, { duration: info.duration });
  stills.forEach((s, i) => (s.number = cuts.length > 1 ? `${Math.floor(i / 2) + 1}${i % 2 ? "B" : "A"}` : `${i + 1}`));
  const sheet = path.join(dir, "sheet.jpg");
  await contactSheet(stills, sheet, { title: `${path.basename(film)}  ${info.duration.toFixed(2)} S  ${info.width}X${info.height}` });
  return { dir, stills, sheet, cuts };
}

module.exports = { saveFrames, scanVideo, detectCuts, findCuts, givenCuts, shotsOf, settled, grabFrames, contactSheet, readTimeline, joinStretches, filterPath };
