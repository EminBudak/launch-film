"use strict";
// ─── cues ──────────────────────────────────────────────────────────────────
// A track's beats as frame numbers, in cues.json: written by a tool that
// fits music to a cut (musicfit) or by hand, and read by check to see
// whether the film's cuts land on the beat. Every number is a whole frame
// at `fps`, and frame 0 is the first frame of the film and of the track:
//
//   { "fps": 30, "beats": [0, 15, 30, 45], "bars": [0, 60, 120],
//     "hits": [825], "frames": 960, "bpm": 120 }
//
// fps and beats are needed. bars (each bar's first beat), hits (accents an
// edit should land on, such as the drop), frames (the track's length) and
// bpm are optional. Other keys are left alone, so a tool can add its own.

const fs = require("fs");

function readCues(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file} could not be read as JSON: ${err.message}`);
  }
  const problems = [];
  const fps = Number(raw && raw.fps);
  if (!(fps > 0 && fps <= 1000)) problems.push('"fps" must be the frames a second the numbers count in');
  const list = (key, needed) => {
    const v = raw && raw[key];
    if (v === undefined || v === null) {
      if (needed) problems.push(`"${key}" is missing`);
      return [];
    }
    if (!Array.isArray(v) || v.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)) {
      problems.push(`"${key}" must be a list of frame numbers`);
      return [];
    }
    return [...new Set(v)].sort((a, b) => a - b);
  };
  const beats = list("beats", true);
  const bars = list("bars", false);
  const hits = list("hits", false);
  if (raw && Array.isArray(raw.beats) && !raw.beats.length) problems.push('"beats" is empty');
  if (problems.length) throw new Error(`${file}: ${problems.join("; ")}`);
  const seconds = (frames) => frames.map((f) => f / fps);
  return {
    fps,
    beats: seconds(beats),
    bars: seconds(bars),
    hits: seconds(hits),
    seconds: Number(raw.frames) > 0 ? Number(raw.frames) / fps : null,
    bpm: Number(raw.bpm) > 0 ? Number(raw.bpm) : null,
  };
}

module.exports = { readCues };
