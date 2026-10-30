"use strict";
// ─── frames ────────────────────────────────────────────────────────────────
// Stills of a finished film, for looking at before it is handed over: two
// per clip (once its entrance has played, and near its end) and one contact
// sheet of them all. The clips' times come from the timeline file the render
// writes next to the film; without it the stills are spread evenly.

const fs = require("fs");
const path = require("path");
const { mustRun, probe } = require("./ffmpeg");

async function saveFrames(file, { out = null } = {}) {
  const film = path.resolve(file);
  const info = probe(film);
  if (!info.duration) throw new Error(`${file} could not be read as a video`);
  const dir = path.resolve(out || path.join(path.dirname(film), "frames"));
  fs.mkdirSync(dir, { recursive: true });
  let clips = null;
  try {
    clips = JSON.parse(fs.readFileSync(film.replace(/\.mp4$/i, "") + ".timeline.json", "utf8")).clips;
  } catch {
    // No timeline: even spacing.
  }
  const moments = [];
  if (clips && clips.length) {
    for (const c of clips) {
      moments.push({ at: c.start + Math.min(c.seconds * 0.55, 2.4), name: `clip-${c.index}-a` });
      moments.push({ at: c.start + c.seconds - 0.3, name: `clip-${c.index}-b` });
    }
  } else {
    for (let i = 0; i < 12; i++) moments.push({ at: ((i + 0.5) * info.duration) / 12, name: `still-${i + 1}` });
  }
  const stills = [];
  for (const m of moments) {
    const at = Math.max(0, Math.min(info.duration - 0.05, m.at));
    const png = path.join(dir, `${m.name}.jpg`);
    await mustRun(["-ss", at.toFixed(3), "-i", film, "-frames:v", "1", "-q:v", "3", png], "saving a still");
    stills.push({ file: png, at: +at.toFixed(2) });
  }
  // The sheet: four stills a row, each 480 px wide, with its time.
  const cols = 4;
  const rows = Math.ceil(stills.length / cols);
  const sheet = path.join(dir, "sheet.jpg");
  const inputs = stills.flatMap((s) => ["-i", s.file]);
  const scaled = stills.map((s, i) => `[${i}:v]scale=480:-2,setsar=1[s${i}]`).join(";");
  const pad = Array.from({ length: rows * cols - stills.length }, (_, k) => `color=c=black:s=480x${info.height && info.width ? Math.round((480 * info.height) / info.width / 2) * 2 : 270}:d=1[p${k}]`).join(";");
  const labels = [...stills.map((s, i) => `[s${i}]`), ...Array.from({ length: rows * cols - stills.length }, (_, k) => `[p${k}]`)];
  const graph = `${scaled}${pad ? `;${pad}` : ""};${labels.join("")}xstack=inputs=${labels.length}:layout=${labels.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, () => "w0").join("+") : "0"}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => "h0").join("+") : "0"}`).join("|")}[out]`;
  await mustRun([...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-q:v", "3", sheet], "making the contact sheet");
  return { dir, stills, sheet };
}

module.exports = { saveFrames };
