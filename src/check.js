"use strict";
// ─── check ─────────────────────────────────────────────────────────────────
// A render checked by measurement, for agents that can neither watch it nor
// listen to it: its size, frame rate and length; black, still and silent
// stretches; loudness, true peak and clipping; and, given the music's cues,
// whether the cuts land on the beat. ffmpeg's own filters measure it all
// (scdet, blackdetect, freezedetect, ebur128, silencedetect). It writes
// CHECK.md (pass or fail, in words), check.json, sheet.png (a frame for each
// cut) and wave.png (loudness over time, with the cuts and the cues).
//
// Holds are often meant: a title that rests, an end card, a fade at either
// end. So a black, still or silent stretch is a warning, not a failure,
// unless it fills most of the film; the short ones RULES allows and the
// stretches `allow` lists raise nothing at all.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { FFMPEG, run, probe, writePng } = require("./ffmpeg");
const frames = require("./frames");
const { readCues } = require("./cues");
const draw = require("./draw");

const RULES = {
  // What a film may hold at its start and its end (a fade in, an end card).
  start: { black: 1, still: 1.5, silence: 1 },
  end: { black: 2, still: 6, silence: 2 },
  // A stretch inside the film shorter than this is a hold.
  hold: { black: 0.5, still: 2, silence: 1 },
  // A film this share black, still or silent fails.
  most: 0.5,
  // Seconds either side of the length asked for.
  seconds: 0.5,
  // LU either side of the loudness asked for.
  lufs: 1,
  // The true peak most platforms ask for, in dBTP.
  truePeak: -1,
  // Frames a cut may sit from its beat: on it, then near it.
  onBeat: 1,
  nearBeat: 2,
};

const NAMES = { black: "black", still: "still picture", silence: "silence" };

// "1920x1080@30", "1920x1080" or "@30".
function parseExpect(text) {
  if (!text) return {};
  const m = /^(?:(\d+)\s*[x\u00d7]\s*(\d+))?\s*(?:@\s*(\d+(?:\.\d+)?))?$/i.exec(String(text).trim());
  if (!m || (!m[1] && !m[3])) throw new Error(`--expect "${text}" should look like 1920x1080@30`);
  return { width: m[1] ? Number(m[1]) : null, height: m[2] ? Number(m[2]) : null, fps: m[3] ? Number(m[3]) : null };
}

// "30" (give or take RULES.seconds) or "28-32".
function parseSeconds(text) {
  if (text === undefined || text === null || text === "") return null;
  const m = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/.exec(String(text).trim());
  if (!m) throw new Error(`--seconds "${text}" should be a length like 30, or a range like 28-32`);
  const a = Number(m[1]);
  return m[2] ? { min: Math.min(a, Number(m[2])), max: Math.max(a, Number(m[2])), text: `${m[1]} to ${m[2]} s` } : { min: a - RULES.seconds, max: a + RULES.seconds, text: `${m[1]} s, give or take ${RULES.seconds}` };
}

// "27-30,0-0.5": stretches of the film, in seconds, where a hold is meant.
function parseAllow(text) {
  if (!text) return [];
  return String(text).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (!m) throw new Error(`--allow "${s}" should be a stretch in seconds, like 27-30`);
    return { from: Math.min(Number(m[1]), Number(m[2])), to: Math.max(Number(m[1]), Number(m[2])) };
  });
}

// The sound, measured: ebur128's loudness every 100 ms and its summary
// (integrated loudness, range, sample and true peak), and silencedetect's
// stretches.
async function scanAudio(film, { work, duration }) {
  const notes = path.join(work, `.scan-audio-${process.pid}.txt`);
  try {
    const r = await run(["-i", film, "-vn", "-af",
      `ebur128=metadata=1:peak=true+sample:framelog=quiet,silencedetect=n=-50dB:d=0.5,astats=measure_overall=Peak_count+Flat_factor:measure_perchannel=none,ametadata=mode=print:file=${frames.filterPath(notes)}`,
      "-f", "null", "-"], { loglevel: "info" });
    if (r.code !== 0) throw new Error(`reading the sound: ffmpeg failed: ${r.stderr.trim().split("\n").slice(-2).join(" | ")}`);
    const num = (re) => {
      const m = re.exec(r.stderr);
      return m ? (m[1] === "-inf" ? -Infinity : Number(m[1])) : null;
    };
    const summary = {
      integrated: num(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf) LUFS/),
      range: num(/Loudness range:\s*\n\s*LRA:\s*(-?[\d.]+) LU/),
      samplePeak: num(/Sample peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/),
      truePeak: num(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/),
      // astats: how often the sound reached its peak, and how flat it stayed
      // there. Clipped sound sits on its peak, flat, many times over.
      peakCount: num(/Peak count:\s*([\d.]+)/),
      flat: num(/Flat factor:\s*(-?[\d.]+)/),
    };
    const loud = [];
    const silence = [];
    let cur = null;
    let from = null;
    for (const line of fs.readFileSync(notes, "utf8").split("\n")) {
      const f = /^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(line);
      if (f) {
        cur = { t: Number(f[1]), m: -120, s: -120 };
        loud.push(cur);
        continue;
      }
      const m = /^lavfi\.([\w.]+)=(\S+)/.exec(line);
      if (!m || !cur) continue;
      const v = Number(m[2]);
      if (m[1] === "r128.M") cur.m = v;
      else if (m[1] === "r128.S") cur.s = v;
      else if (m[1] === "silence_start") from = v;
      else if (m[1] === "silence_end") {
        silence.push({ from: from === null ? 0 : from, to: v });
        from = null;
      }
    }
    if (from !== null) silence.push({ from, to: duration });
    return { ...summary, loud, silence: frames.joinStretches(silence.map((s) => ({ from: Math.max(0, s.from), to: Math.min(duration, s.to) }))) };
  } finally {
    fs.rmSync(notes, { force: true });
  }
}

// The sound's outline: the loudest sample in each of `columns` slices, in
// dBFS, from a mono copy at 4 kHz.
function envelope(film, { duration, columns }) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", film, "-vn", "-ac", "1", "-ar", "4000", "-f", "f32le", "-"], { maxBuffer: Math.ceil(duration * 4000 * 4) + 1e6, timeout: 120_000 });
  if (r.status !== 0 || !r.stdout) return null;
  const n = Math.floor(r.stdout.length / 4);
  const peaks = new Array(columns).fill(0);
  for (let i = 0; i < n; i++) {
    const v = Math.abs(r.stdout.readFloatLE(4 * i));
    const col = Math.min(columns - 1, Math.floor(((i / 4000) / duration) * columns));
    if (v > peaks[col]) peaks[col] = v;
  }
  return peaks.map((p) => (p > 0 ? 20 * Math.log10(p) : -120));
}

// Black, still and silent stretches judged: each gets a `verdict` (meant,
// start, end, hold, warn or fail) and the kind's status is the worst. A film
// mostly black or silent fails; one mostly still only warns, since a film of
// slides is still on purpose.
function judgeStretches(kind, list, duration, allow, frame) {
  const items = list.map((s) => {
    const item = { ...s };
    const whole = s.from <= frame && s.to >= duration - frame;
    const meant = allow.some((a) => s.from >= a.from - 0.1 && s.to <= a.to + 0.1);
    if (meant) item.verdict = "meant";
    else if (whole) item.verdict = "fail";
    else if (s.from <= frame) item.verdict = s.seconds <= RULES.start[kind] ? "start" : "warn";
    else if (s.to >= duration - frame) item.verdict = s.seconds <= RULES.end[kind] ? "end" : "warn";
    else item.verdict = s.seconds < RULES.hold[kind] ? "hold" : "warn";
    return item;
  });
  const share = items.filter((s) => s.verdict !== "meant").reduce((a, s) => a + s.seconds, 0) / Math.max(0.001, duration);
  const most = share >= RULES.most;
  const status = items.some((s) => s.verdict === "fail") || (most && kind !== "still") ? "fail" : items.some((s) => s.verdict === "warn") || most ? "warn" : "pass";
  return { status, share: +share.toFixed(3), stretches: items };
}

const at = (s) => `${s.toFixed(2)} s`;
const span = (s) => `${at(s.from)} to ${at(s.to)} (${s.seconds.toFixed(2)} s)`;
const WHY = { meant: "allowed", start: "at the start, allowed", end: "at the end, allowed", hold: "a short hold, allowed", warn: "look at it", fail: "most of the film" };

// The nearest beat to a time, and how far off it is in frames.
function nearest(list, t, fps) {
  let best = null;
  for (const b of list) if (best === null || Math.abs(b - t) < Math.abs(best - t)) best = b;
  return best === null ? null : { beat: best, off: +((t - best) * fps).toFixed(2) };
}

// Checks a film. opts: { out, expect, seconds, lufs, cues, cuts, allow }
// (the command's options as given). Returns { pass, checks, dir, files }.
async function checkFilm(file, opts = {}) {
  const film = path.resolve(file);
  if (!fs.existsSync(film)) throw new Error(`${file} is not a file`);
  const info = probe(film);
  if (!info.duration || !info.width) throw new Error(`${file} could not be read as a video`);
  const expect = parseExpect(opts.expect);
  const seconds = parseSeconds(opts.seconds);
  const target = opts.lufs === undefined || opts.lufs === null || opts.lufs === "" ? null : Number(opts.lufs);
  if (target !== null && !(target < 0 && target > -70)) throw new Error(`--lufs "${opts.lufs}" should be a loudness like -14`);
  const allow = parseAllow(opts.allow);
  const cues = opts.cues ? readCues(path.resolve(opts.cues)) : null;
  const dir = path.resolve(opts.out || path.join(path.dirname(film), "check"));
  fs.mkdirSync(dir, { recursive: true });
  const duration = info.duration;
  const fps = info.fps || 25;
  const frame = 1.5 / fps;

  const scan = await frames.scanVideo(film, { work: dir, duration });
  const sound = info.audio ? await scanAudio(film, { work: dir, duration }) : null;
  const { cuts, source } = await frames.findCuts(film, { info, work: dir, scan, given: opts.cuts || null });

  const checks = [];
  const add = (name, status, expected, found, extra = {}) => checks.push({ name, status, expected, found, ...extra });

  // Size and frame rate.
  const size = `${info.width}x${info.height}`;
  if (expect.width) add("size", size === `${expect.width}x${expect.height}` ? "pass" : "fail", `${expect.width}x${expect.height}`, size);
  else add("size", "info", "", size);
  const shownFps = +fps.toFixed(3);
  if (expect.fps) add("frame rate", Math.abs(fps - expect.fps) < 0.01 ? "pass" : "fail", `${expect.fps} fps`, `${shownFps} fps`);
  else add("frame rate", "info", "", `${shownFps} fps`);
  if (info.baseFps && Math.abs(info.baseFps - fps) > 0.01) add("steady frame rate", "warn", "one frame rate throughout", `${+info.baseFps.toFixed(3)} fps at most, ${shownFps} on average: the frame rate varies`);
  if (info.sar && info.sar !== "1:1" && info.sar !== "0:1") add("square pixels", "warn", "1:1", info.sar);

  // Length.
  const length = +duration.toFixed(3);
  if (seconds) add("length", length >= seconds.min && length <= seconds.max ? "pass" : "fail", seconds.text, `${length} s`);
  else add("length", "info", "", `${length} s`);

  // Black and still stretches. A black stretch is still too; it is told once.
  const black = judgeStretches("black", scan.black, duration, allow, frame);
  const stillOnly = scan.frozen.filter((f) => {
    const covered = scan.black.reduce((a, b) => a + Math.max(0, Math.min(f.to, b.to) - Math.max(f.from, b.from)), 0);
    return covered < 0.8 * f.seconds;
  });
  const still = judgeStretches("still", stillOnly, duration, allow, frame);
  add("black", black.status, "no black stretch in the film", black.stretches.length ? `${black.stretches.length} stretch${black.stretches.length > 1 ? "es" : ""}` : "none", { stretches: black.stretches });
  add("still picture", still.status, "no long still stretch", still.stretches.length ? `${still.stretches.length} stretch${still.stretches.length > 1 ? "es" : ""}` : "none", { stretches: still.stretches });

  // The sound.
  if (!sound) {
    add("sound", target !== null ? "fail" : "info", target !== null ? "a sound track" : "", "no sound track");
  } else {
    const silence = judgeStretches("silence", sound.silence, duration, allow, frame);
    const silent = !(sound.integrated > -70);
    add("silence", silent ? (target !== null ? "fail" : "warn") : silence.status, "no long silence", silent ? "the sound is silent throughout" : silence.stretches.length ? `${silence.stretches.length} stretch${silence.stretches.length > 1 ? "es" : ""}` : "none", { stretches: silence.stretches });
    const I = sound.integrated;
    const shownI = Number.isFinite(I) ? `${I.toFixed(1)} LUFS` : "silent";
    if (target !== null) add("loudness", Number.isFinite(I) && Math.abs(I - target) <= RULES.lufs ? "pass" : "fail", `${target} LUFS, give or take ${RULES.lufs}`, shownI, { range: sound.range });
    else add("loudness", "info", "", shownI, { range: sound.range });
    const tp = sound.truePeak;
    add("true peak", !Number.isFinite(tp) || tp <= RULES.truePeak ? "pass" : tp <= 0 ? "warn" : "fail", `${RULES.truePeak} dBTP or lower`, Number.isFinite(tp) ? `${tp.toFixed(1)} dBTP` : "silent");
    // Clipping: the sound reaches full scale, or sits flat on its peak many
    // times over (clipped earlier, then turned down).
    const sp = sound.samplePeak;
    const flatTops = sound.flat > 1 && sound.peakCount >= 50;
    add("clipping", (Number.isFinite(sp) && sp >= -0.05) || flatTops ? "fail" : "pass", "below full scale, no flat tops",
      Number.isFinite(sp) ? `sample peak ${sp.toFixed(1)} dBFS${flatTops ? `, flat on its peak ${Math.round(sound.peakCount)} times` : ""}` : "silent");
  }

  // The cuts against the beat. Soft changes found in the picture are shown
  // but not judged: they may be crossfades, or something starting to move.
  const judged = cuts.filter((c) => c.at > frame && c.hard);
  if (cues) {
    for (const c of cuts) {
      const n = nearest(cues.beats, c.at, fps);
      if (!n) continue;
      c.beat = +n.beat.toFixed(3);
      c.off = n.off;
      c.onBar = cues.bars.some((b) => Math.abs(b - n.beat) < 0.001);
      if (c.at > frame && c.hard) c.verdict = Math.abs(n.off) <= RULES.onBeat + 0.01 ? "on" : Math.abs(n.off) <= RULES.nearBeat + 0.01 ? "near" : "off";
    }
    const off = judged.filter((c) => c.verdict === "off").length;
    const near = judged.filter((c) => c.verdict === "near").length;
    const on = judged.length - off - near;
    const soft = cuts.filter((c) => !c.hard).length;
    add("cuts on beats", !judged.length ? "warn" : off ? "fail" : near ? "warn" : "pass", `within ${RULES.onBeat} frame of a beat`,
      judged.length ? `${on} of ${judged.length} on the beat${near ? `, ${near} near it` : ""}${off ? `, ${off} off it` : ""}` : `no cut to judge${soft ? ` (${soft} soft change${soft > 1 ? "s" : ""} found; give --cuts)` : ""}`);
    if (cues.seconds && Math.abs(cues.seconds - duration) > 1) add("cues length", "warn", `${length} s, as the film`, `${cues.seconds.toFixed(2)} s`);
  }

  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");
  const pass = !failed.length;

  // The pictures: a frame for each cut, and the sound over time.
  const shots = frames.shotsOf(cuts, duration);
  const temp = shots.map((s) => ({ at: frames.settled(s), name: `.cut-${process.pid}-${s.index}`, label: s.label }));
  const stills = await frames.grabFrames(film, temp, dir, { duration });
  stills.forEach((s, i) => {
    const c = cuts[i];
    s.number = String(c.index);
    s.at = c.at;
    s.label = [c.label, c.verdict ? { on: "ON BEAT", near: `NEAR BEAT ${c.off > 0 ? "+" : ""}${c.off}F`, off: `OFF BEAT ${c.off > 0 ? "+" : ""}${c.off}F` }[c.verdict] : ""].filter(Boolean).join("  ");
    s.labelColour = c.verdict === "off" ? "#F87171" : c.verdict === "near" ? "#FACC15" : c.verdict === "on" ? "#4ADE80" : "#7D8494";
  });
  const sheet = path.join(dir, "sheet.png");
  try {
    await frames.contactSheet(stills, sheet, { title: `${path.basename(film)}  ${length} S  ${size}  ${shownFps} FPS  ${cuts.length} CUT${cuts.length > 1 ? "S" : ""} (${source.toUpperCase()})` });
  } finally {
    for (const s of stills) fs.rmSync(s.file, { force: true });
  }
  const wave = path.join(dir, "wave.png");
  await drawWave(wave, { film, duration, sound, target, cuts, cues, fps });

  const result = {
    file: path.relative(dir, film),
    pass,
    failed: failed.map((c) => c.name),
    warnings: warned.map((c) => c.name),
    checks,
    video: { width: info.width, height: info.height, fps: shownFps, seconds: length, codec: info.codec, pixFmt: info.pixFmt },
    audio: sound ? { codec: info.audioCodec, sampleRate: info.sampleRate, channels: info.channels, integrated: sound.integrated, range: sound.range, truePeak: sound.truePeak, samplePeak: sound.samplePeak } : null,
    cuts: cuts.map((c) => ({ index: c.index, at: c.at, frame: Math.round(c.at * fps), source: c.source, hard: c.hard, label: c.label || undefined, beat: c.beat, off: c.off, onBar: c.onBar, verdict: c.verdict })),
    cues: cues ? { fps: cues.fps, beats: cues.beats.length, bars: cues.bars.length, hits: cues.hits.map((h) => +h.toFixed(3)), bpm: cues.bpm, seconds: cues.seconds } : null,
    allow,
    rules: RULES,
    files: { report: "CHECK.md", sheet: "sheet.png", wave: "wave.png" },
  };
  fs.writeFileSync(path.join(dir, "check.json"), JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "CHECK.md"), report(result, { film, source }));
  return { ...result, dir };
}

// CHECK.md: the verdict first, then every check, the stretches and the cuts.
function report(r, { film, source }) {
  const lines = [];
  const verdict = r.pass ? `PASS${r.warnings.length ? ` with ${r.warnings.length} warning${r.warnings.length > 1 ? "s" : ""}` : ""}` : `FAIL (${r.failed.join(", ")})`;
  lines.push(`# ${path.basename(film)}: ${verdict}`, "");
  lines.push(`${r.video.width}x${r.video.height} at ${r.video.fps} fps, ${r.video.seconds} s${r.audio ? `, sound ${r.audio.channels === 2 ? "in stereo" : `on ${r.audio.channels} channel${r.audio.channels > 1 ? "s" : ""}`} at ${r.audio.sampleRate} Hz` : ", no sound"}.`, "");
  lines.push("| Check | Result | Asked for | Found |", "| --- | --- | --- | --- |");
  for (const c of r.checks) lines.push(`| ${c.name} | ${c.status} | ${c.expected || ""} | ${c.found} |`);
  const stretchChecks = r.checks.filter((c) => c.stretches && c.stretches.length);
  if (stretchChecks.length) {
    lines.push("", "## Stretches", "");
    for (const c of stretchChecks) for (const s of c.stretches) lines.push(`- ${c.name === "still picture" ? "Still picture" : c.name[0].toUpperCase() + c.name.slice(1)} from ${span(s)}: ${WHY[s.verdict]}.`);
    lines.push("", `A stretch inside the film shorter than ${RULES.hold.black} s of black, ${RULES.hold.still} s of still picture or ${RULES.hold.silence} s of silence counts as a hold. At the start up to ${RULES.start.black} s of black, ${RULES.start.still} s still or ${RULES.start.silence} s silent is allowed, and at the end up to ${RULES.end.black} s, ${RULES.end.still} s and ${RULES.end.silence} s. Pass --allow with the stretches you meant (like 27-30) to have them counted as meant.`);
  }
  lines.push("", "## Cuts", "");
  const from = { timeline: "the timeline launch-film wrote next to the film", given: "--cuts", picture: "the picture (hard cuts, and soft changes that may be crossfades)" }[source];
  lines.push(`Taken from ${from}.`, "");
  if (r.cues) {
    lines.push("| # | At | Frame | Nearest beat | Off by | On the beat |", "| --- | --- | --- | --- | --- | --- |");
    for (const c of r.cuts) lines.push(`| ${c.index} | ${c.at.toFixed(3)} s | ${c.frame} | ${c.beat !== undefined ? `${c.beat.toFixed(3)} s${c.onBar ? " (bar)" : ""}` : ""} | ${c.off !== undefined ? `${c.off > 0 ? "+" : ""}${c.off} frames` : ""} | ${c.verdict || (c.hard ? "the start" : "soft change, not judged")} |`);
    if (r.cues.hits.length) lines.push("", `Hits in the cues: ${r.cues.hits.map((h) => at(h)).join(", ")}.`);
  } else {
    lines.push("| # | At | Frame | Kind |", "| --- | --- | --- | --- |");
    for (const c of r.cuts) lines.push(`| ${c.index} | ${c.at.toFixed(3)} s | ${c.frame} | ${c.label || (c.hard ? "cut" : "soft change")} |`);
    lines.push("", "Give the music's cues.json with --cues to check the cuts against the beat.");
  }
  lines.push("", "## Pictures", "", "- sheet.png: a frame from each shot, once its entrance has played, with the cut's number and time.",
    "- wave.png: the sound's outline and loudness over time, with the cuts as lines (green on the beat, yellow near it, red off it, white not judged), the beats and bars along the bottom, and the target loudness dashed.", "");
  return lines.join("\n");
}

// wave.png: the sound's outline in dBFS, its momentary and short-term
// loudness, the target, silent stretches, the cuts and the cues, over time.
async function drawWave(file, { film, duration, sound, target, cuts, cues, fps }) {
  const W = 1600;
  const H = 440;
  const x0 = 70;
  const x1 = W - 24;
  const y0 = 58;
  // The cues get a lane of their own under the chart.
  const lane = cues ? 24 : 0;
  const y1 = H - 48 - lane;
  const c = draw.canvas(W, H, "#101317");
  draw.rect(c, x0, y0, x1 - x0, y1 - y0, "#161A20");
  const X = (t) => x0 + (t / duration) * (x1 - x0);
  const Y = (db) => y0 + (Math.min(0, Math.max(-60, db)) / -60) * (y1 - y0);
  for (let db = 0; db >= -60; db -= 10) {
    draw.line(c, x0, Y(db), x1, Y(db), "#262B33");
    const label = `${db}`;
    draw.text(c, x0 - 10 - draw.textWidth(label, 2), Y(db) - 7, label, "#7D8494", 2);
  }
  // Time along the bottom: a label every 1, 2, 5, 10, 30 or 60 s.
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => duration / s <= 16) || 600;
  for (let t = 0; t <= duration + 0.001; t += step) {
    draw.line(c, X(t), y1 + lane, X(t), y1 + lane + 6, "#7D8494");
    const label = `${Math.round(t)} S`;
    draw.text(c, Math.min(x1 - draw.textWidth(label, 2), Math.max(0, X(t) - draw.textWidth(label, 2) / 2)), y1 + lane + 14, label, "#AEB4C4", 2);
  }
  if (sound) {
    for (const s of sound.silence) draw.rect(c, X(s.from), y0, Math.max(1, X(s.to) - X(s.from)), y1 - y0, "#7F1D2D", 0.45);
    const env = envelope(film, { duration, columns: Math.round(x1 - x0) });
    if (env) env.forEach((db, i) => db > -60 && draw.line(c, x0 + i, Y(db), x0 + i, y1, "#3A4250"));
    const curve = (key, colour, width, alpha) => {
      let last = null;
      for (const p of sound.loud) {
        const v = p[key];
        const pt = v > -60 ? [X(p.t), Y(v)] : null;
        if (pt && last) draw.line(c, last[0], last[1], pt[0], pt[1], colour, { width, alpha });
        last = pt;
      }
    };
    curve("m", "#4FA3FF", 1, 0.7);
    curve("s", "#7EE0FF", 3, 1);
  }
  if (target !== null) {
    draw.line(c, x0, Y(target), x1, Y(target), "#FFD166", { width: 2, dash: 8 });
    // The label on a dark patch, so the curves don't run through it.
    const label = `TARGET ${target} LUFS`;
    const lx = x1 - draw.textWidth(label, 2) - 10;
    draw.rect(c, lx - 6, Y(target) - 26, draw.textWidth(label, 2) + 12, 22, "#101317", 0.85);
    draw.text(c, lx, Y(target) - 22, label, "#FFD166", 2);
  }
  if (cues) {
    const top = y1 + 4;
    const bottom = y1 + lane - 2;
    draw.rect(c, x0, top, x1 - x0, bottom - top, "#1B2027");
    for (const b of cues.beats) if (b <= duration) draw.line(c, X(b), bottom - 8, X(b), bottom, "#8A97A8");
    for (const b of cues.bars) if (b <= duration) draw.line(c, X(b), top, X(b), bottom, "#D5DCE6", { width: 2 });
    for (const h of cues.hits) {
      if (h > duration) continue;
      draw.line(c, X(h), y0, X(h), y1, "#FF5FA2", { width: 2, dash: 6 });
      draw.rect(c, X(h) - 3, top, 6, bottom - top, "#FF5FA2");
    }
  }
  for (const cut of cuts) {
    const colour = cut.verdict === "off" ? "#F87171" : cut.verdict === "near" ? "#FACC15" : cut.verdict === "on" ? "#4ADE80" : cut.hard ? "#E5E7EB" : "#9CA3AF";
    draw.line(c, X(cut.at), y0, X(cut.at), y1, colour, { width: 2, dash: cut.hard ? 0 : 5 });
    draw.text(c, Math.min(x1 - 20, X(cut.at) + 4), y0 + 6, String(cut.index), colour, 2);
  }
  // The key, over the chart.
  let kx = x0;
  const key = (colour, label, dashed = false) => {
    draw.line(c, kx, 26, kx + 22, 26, colour, { width: 3, dash: dashed ? 4 : 0 });
    kx += 30 + draw.text(c, kx + 30, 20, label, "#C9CED8", 2) + 24;
  };
  key("#7EE0FF", "SHORT-TERM LUFS");
  key("#4FA3FF", "MOMENTARY");
  key("#3A4250", "PEAK DBFS");
  if (target !== null) key("#FFD166", "TARGET", true);
  key("#E5E7EB", "CUT");
  if (cues) {
    key("#8A97A8", "BEAT");
    key("#D5DCE6", "BAR");
    key("#FF5FA2", "HIT", true);
  }
  if (sound && sound.silence.length) key("#7F1D2D", "SILENCE");
  if (sound && Number.isFinite(sound.integrated)) {
    const label = `I ${sound.integrated.toFixed(1)} LUFS  TP ${Number.isFinite(sound.truePeak) ? sound.truePeak.toFixed(1) : "-"} DBTP`;
    draw.text(c, W - 24 - draw.textWidth(label, 2), 20, label, "#FFFFFF", 2);
  } else if (!sound) draw.text(c, W - 24 - draw.textWidth("NO SOUND TRACK", 2), 20, "NO SOUND TRACK", "#F87171", 2);
  await writePng(file, c);
  return file;
}

module.exports = { checkFilm, parseExpect, parseSeconds, parseAllow, judgeStretches, RULES };
