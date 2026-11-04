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

// Runs ffmpeg and resolves { code, stderr } (the end of it). A filter's own
// report (ebur128's summary) needs loglevel "info".
function run(args, { input = null, timeout = 0, loglevel = "error" } = {}) {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ["-hide_banner", "-nostats", "-loglevel", loglevel, "-y", ...args], { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-6000)));
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

// "30000/1001" as a number.
const rate = (r) => {
  const [a, b] = String(r || "").split("/").map(Number);
  return a && b ? a / b : Number(a) || 0;
};

function probe(file) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,pix_fmt,sample_aspect_ratio,r_frame_rate,avg_frame_rate,sample_rate,channels",
    "-of", "json", file], { encoding: "utf8", timeout: 20_000 });
  try {
    const info = JSON.parse(r.stdout);
    const video = (info.streams || []).find((s) => s.codec_type === "video") || {};
    const sound = (info.streams || []).find((s) => s.codec_type === "audio") || null;
    return {
      width: Number(video.width) || 0,
      height: Number(video.height) || 0,
      duration: Number((info.format || {}).duration) || 0,
      audio: Boolean(sound),
      fps: rate(video.avg_frame_rate) || rate(video.r_frame_rate),
      baseFps: rate(video.r_frame_rate),
      codec: video.codec_name || "",
      pixFmt: video.pix_fmt || "",
      sar: video.sample_aspect_ratio || "",
      audioCodec: sound ? sound.codec_name || "" : "",
      sampleRate: sound ? Number(sound.sample_rate) || 0 : 0,
      channels: sound ? Number(sound.channels) || 0 : 0,
    };
  } catch {
    return { width: 0, height: 0, duration: 0, audio: false, fps: 0, baseFps: 0, codec: "", pixFmt: "", sar: "", audioCodec: "", sampleRate: 0, channels: 0 };
  }
}

// A picture made exactly W x H: scaled to cover the size and cut to it from
// the middle, as an opaque PNG (stores refuse transparency).
function coverPng(input, output, W, H) {
  return mustRun(["-i", input, "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1`,
    "-frames:v", "1", "-pix_fmt", "rgb24", output], `making ${output}`);
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

module.exports = { FFMPEG, FFPROBE, available, run, mustRun, probe, coverPng, readPixels, writePng, encoder };
