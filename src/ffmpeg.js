"use strict";
// ─── ffmpeg ────────────────────────────────────────────────────────────────
// ffmpeg encodes the frames, reads and writes pictures as raw pixels, joins
// the clips and lays the sound under them. LAUNCH_FILM_FFMPEG and
// LAUNCH_FILM_FFPROBE point at other builds.

const { spawn, spawnSync } = require("child_process");

const FFMPEG = process.env.LAUNCH_FILM_FFMPEG || "ffmpeg";
const FFPROBE = process.env.LAUNCH_FILM_FFPROBE || "ffprobe";

function available() {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-version"], { encoding: "utf8", timeout: 10_000 });
  if (r.status !== 0) return null;
  const m = /ffmpeg version (\S+)/.exec(r.stdout || "");
  return m ? m[1] : "unknown";
}

// Runs ffmpeg and resolves { code, stderr } (the end of it).
function run(args, { input = null, timeout = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-3000)));
    let timer = null;
    if (timeout) {
      timer = setTimeout(() => child.kill("SIGKILL"), timeout);
      timer.unref();
    }
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stderr });
    });
    child.on("error", (err) => resolve({ code: -1, stderr: err.message }));
    if (input) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

async function mustRun(args, what, opts) {
  const r = await run(args, opts);
  if (r.code !== 0) throw new Error(`${what}: ffmpeg failed: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  return r;
}

function probe(file) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file],
    { encoding: "utf8", timeout: 20_000 });
  try {
    const info = JSON.parse(r.stdout);
    const video = (info.streams || []).find((s) => s.codec_type === "video") || {};
    return {
      width: Number(video.width) || 0,
      height: Number(video.height) || 0,
      duration: Number((info.format || {}).duration) || 0,
      audio: (info.streams || []).some((s) => s.codec_type === "audio"),
    };
  } catch {
    return { width: 0, height: 0, duration: 0, audio: false };
  }
}

// A picture's pixels as RGBA, at most `max` px on its long side when given:
// { data, width, height }.
function readPixels(file, max = 0) {
  const info = probe(file);
  if (!info.width || !info.height) throw new Error(`${file} could not be read as a picture`);
  const k = max ? Math.min(1, max / Math.max(info.width, info.height)) : 1;
  const width = Math.max(1, Math.round(info.width * k));
  const height = Math.max(1, Math.round(info.height * k));
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${width}:${height}:flags=area,format=rgba`, "-f", "rawvideo", "-"],
    { timeout: 30_000, maxBuffer: width * height * 4 + 1024 });
  if (r.status !== 0 || !r.stdout || r.stdout.length !== width * height * 4) throw new Error(`${file} could not be read as a picture`);
  return { data: r.stdout, width, height, scale: k, sourceWidth: info.width, sourceHeight: info.height };
}

// RGBA pixels written as a PNG.
function writePng(file, { data, width, height }) {
  return mustRun(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-i", "-", "-frames:v", "1", file], "writing a picture", { input: data });
}

// A frame encoder: JPEG frames in, an H.264 MP4 out.
function encoder({ output, fps = 25, crf = 15 }) {
  const child = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-an", "-r", String(fps), "-movflags", "+faststart", output],
  { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
  child.stdin.on("error", () => {});
  const closed = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return {
    async write(jpeg) {
      if (!child.stdin.write(jpeg)) await new Promise((resolve) => child.stdin.once("drain", resolve));
    },
    async end() {
      child.stdin.end();
      const code = await closed;
      if (code !== 0) throw new Error(`ffmpeg failed: ${err.trim().split("\n").slice(-2).join(" | ")}`);
    },
    kill: () => child.kill("SIGKILL"),
  };
}

module.exports = { FFMPEG, FFPROBE, available, run, mustRun, probe, readPixels, writePng, encoder };
