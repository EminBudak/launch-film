"use strict";
// ─── the film ──────────────────────────────────────────────────────────────
// film.json in, an MP4 out: each clip is a page rendered on its own (two at a
// time), the clips are joined with short crossfades that start on the cut,
// and one sound track (the music bed and every clip's effects at their
// times) is laid under the whole film.

const fs = require("fs");
const os = require("os");
const path = require("path");
const motion = require("./motion");
const { parseScene, resolveFonts, iconSvg } = require("./scene");
const { renderPage } = require("./chrome");
const { run, mustRun, probe, readPixels } = require("./ffmpeg");
const { prepareLogo, prepareIcon } = require("./logo");
const { readBrand } = require("./brand");
const audio = require("./audio");

const FPS = 25;
// A crossfade between clips, starting on the cut.
const FADE = 0.4;
const KINDS = new Set(["scene", "screen", "phone", "scroll", "shots", "logo"]);

// Reads and checks a film.json; returns { film, dir, brand, clips, problems }.
function loadFilm(file) {
  const dir = path.dirname(path.resolve(file));
  let film;
  try {
    film = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { problems: [`${file} is not valid JSON: ${err.message}`] };
  }
  const problems = [];
  if (!motion.LOOKS[film.look]) problems.push(`"look" must be one of ${Object.keys(motion.LOOKS).join(", ")}`);
  if (film.aspect && !["16:9", "9:16"].includes(film.aspect)) problems.push('"aspect" must be "16:9" or "9:16"');
  let brand = null;
  if (film.brand) {
    try {
      brand = readBrand(path.resolve(dir, film.brand));
    } catch (err) {
      problems.push(`the brand could not be read from ${film.brand}: ${err.message}`);
    }
  }
  const mood = audio.MOODS[film.look] || audio.MOODS.launch;
  const bar = 240 / mood.bpm;
  const clips = Array.isArray(film.clips) ? film.clips : [];
  if (!clips.length) problems.push('"clips" is empty');
  const out = [];
  clips.forEach((c, i) => {
    const at = `clips[${i}]`;
    if (!c || !KINDS.has(c.kind)) {
      problems.push(`${at}.kind must be one of ${[...KINDS].join(", ")}`);
      return;
    }
    const seconds = c.seconds !== undefined ? Number(c.seconds) : Number(c.bars || 2) * bar;
    if (!(seconds >= 2 && seconds <= 12)) problems.push(`${at} must last 2-12 seconds (it is ${seconds.toFixed(2)})`);
    const fileOf = (rel, what) => {
      const abs = rel ? path.resolve(dir, rel) : null;
      if (!abs || !fs.existsSync(abs)) problems.push(`${at}.${what} "${rel || ""}" is not a file`);
      return abs;
    };
    const clip = { ...c, index: i, seconds };
    if (c.kind === "scene") {
      const { scene, problems: p } = parseScene(c.scene, { look: film.look, portrait: film.aspect === "9:16", brand: brandColours(brand) });
      p.forEach((msg) => problems.push(`${at}.scene: ${msg}`));
      clip.parsed = scene;
    } else if (c.kind === "shots") {
      const list = Array.isArray(c.images) ? c.images : [];
      if (list.length < 1 || list.length > 3) problems.push(`${at}.images must list 1-3 pictures`);
      clip.imageFiles = list.slice(0, 3).map((rel, k) => fileOf(rel, `images[${k}]`));
    } else if (c.kind === "logo") {
      if (c.icon) clip.iconFile = fileOf(c.icon, "icon");
      else clip.logoFile = fileOf(c.logo, "logo");
    } else {
      clip.imageFile = fileOf(c.image, "image");
      if (c.kind === "screen" && c.mode === "zoom" && !(Array.isArray(c.box) && c.box.length === 4 && c.box.every((v) => v >= 0))) {
        problems.push(`${at}.box must be [x, y, w, h] in the picture's pixels for a zoom`);
      }
    }
    out.push(clip);
  });
  const total = out.reduce((s, c) => s + c.seconds, 0);
  if (total > 90) problems.push(`the film would last ${total.toFixed(1)} s; keep it under 90`);
  return { film, dir, brand, clips: out, bar, problems };
}

// The colours a brand gives the looks: its accent, a second colour, and a
// dark ground (its own dark colour, else its accent taken nearly to black).
function brandColours(brand) {
  if (!brand) return {};
  const { mix } = motion.helpers;
  const dark = brand.darkSite && brand.surface ? brand.surface : brand.darkColour;
  // A brand drawn in black and white keeps to it: its heading colour stands
  // in for an accent it does not have.
  const heading = (brand.colors.find((c) => c.role === "heading") || {}).hex || null;
  return {
    accent: brand.accent || (brand.darkSite && heading ? heading : null),
    accent2: brand.accent2,
    background: dark || (brand.accent ? mix(brand.accent, "#05070D", 0.9) : null),
    headingFont: brand.headingFont,
    bodyFont: brand.bodyFont,
  };
}

// The colour of a picture's first rows (a phone's status bar takes it).
function topColour(file) {
  const p = readPixels(file, 64);
  const rows = Math.max(1, Math.round(p.height * 0.02));
  const sum = [0, 0, 0];
  for (let y = 0; y < rows; y++) for (let x = 0; x < p.width; x++) for (let c = 0; c < 3; c++) sum[c] += p.data[4 * (y * p.width + x) + c];
  return `#${sum.map((v) => Math.round(v / (rows * p.width)).toString(16).padStart(2, "0")).join("")}`;
}

// One clip's page: { html, files, cues, W, H }.
async function buildClip(clip, ctx) {
  const { look, port, fonts, colours, work } = ctx;
  const seconds = clip.render;
  const brandAccent = colours.accent || null;
  if (clip.kind === "scene") {
    const scene = { ...clip.parsed, font: colours.headingFont || "", bodyFont: colours.bodyFont || "" };
    const sceneFonts = scene.type === "code" ? await resolveFonts({ style: look, font: scene.font, bodyFont: scene.bodyFont, type: "code" }) : fonts;
    const page = motion.sceneHtml(scene, { fonts: sceneFonts, seconds, icon: iconSvg });
    if (!page) throw new Error(`clip ${clip.index + 1}: the ${scene.type} type has no drawing`);
    return { html: page.html, files: {}, cues: page.cues, W: page.W, H: page.H };
  }
  if (clip.kind === "screen") {
    const info = probe(clip.imageFile);
    const ext = path.extname(clip.imageFile).toLowerCase() === ".png" ? ".png" : ".jpg";
    const soft = path.join(work, `soft-${clip.index}.jpg`);
    const blurred = await run(["-i", clip.imageFile, "-vf", "scale='min(1400,iw)':-2,gblur=sigma=12", "-q:v", "5", soft]);
    const page = motion.screenHtml({ mode: clip.mode === "zoom" ? "zoom" : "pan", look, port, seconds, accent: brandAccent, brand: colours,
      image: { file: `capture${ext}`, w: info.width, h: info.height }, soft: blurred.code === 0 ? "soft.jpg" : null, box: clip.box || null,
      side: clip.side || "center", phone: info.height > info.width, fonts });
    const files = { [`capture${ext}`]: fs.readFileSync(clip.imageFile), ...(blurred.code === 0 ? { "soft.jpg": fs.readFileSync(soft) } : {}) };
    return { html: page.html, files, cues: page.cues, W: page.W, H: page.H };
  }
  if (clip.kind === "shots") {
    const images = clip.imageFiles.map((file, k) => {
      const info = probe(file);
      return { file: `shot-${k}${path.extname(file).toLowerCase() === ".png" ? ".png" : ".jpg"}`, w: info.width, h: info.height, src: file };
    });
    const page = motion.galleryHtml({ look, port, seconds, accent: brandAccent, brand: colours, images, fonts });
    return { html: page.html, files: Object.fromEntries(images.map((im) => [im.file, fs.readFileSync(im.src)])), cues: page.cues, W: page.W, H: page.H };
  }
  if (clip.kind === "phone" || clip.kind === "scroll") {
    const info = probe(clip.imageFile);
    const page = motion.deviceHtml({ mode: clip.kind, look, port, seconds, accent: brandAccent, brand: colours, image: { file: "screen.png", w: info.width, h: info.height },
      top: topColour(clip.imageFile), fonts });
    // The capture cut to what shows and made no larger than the page draws
    // it, with a quarter to spare: a whole page at 2x is tens of megapixels.
    const keepH = Math.min(info.height, Math.ceil(info.height * page.use) + 2);
    const width = 2 * Math.round(Math.min(info.width, Math.ceil(page.drawnW * 1.25)) / 2);
    const prepared = path.join(work, `device-${clip.index}.png`);
    await mustRun(["-i", clip.imageFile, "-vf", `crop=${info.width}:${keepH}:0:0,scale=${width}:-2:flags=lanczos`, "-frames:v", "1", prepared], `clip ${clip.index + 1}`);
    return { html: page.html, files: { "screen.png": fs.readFileSync(prepared) }, cues: page.cues, W: page.W, H: page.H };
  }
  // The logo close: the capture asked for, else the brand's other logo
  // captures, else its app icon. A capture that cannot close (cut off, too
  // small, not a logo) is passed over with a note.
  const markFile = path.join(work, `mark-${clip.index}.png`);
  const brand = ctx.brand;
  const tries = clip.iconFile ? [{ icon: clip.iconFile }] : [{ logo: clip.logoFile },
    ...(brand ? brand.logos.map((l) => ({ logo: l.file })).filter((t) => t.logo !== clip.logoFile) : []),
    ...(brand && brand.appIcon ? [{ icon: brand.appIcon.file }] : [])];
  let mark = null;
  const refused = [];
  for (const t of tries) {
    try {
      mark = t.icon ? await prepareIcon(t.icon, markFile) : await prepareLogo(t.logo, markFile, { portrait: port });
      if (refused.length) ctx.notes.push(`The logo close uses ${path.basename(t.icon || t.logo)}: ${refused.join("; ")}.`);
      break;
    } catch (err) {
      refused.push(`${path.basename(t.icon || t.logo)} was passed over (${err.message})`);
    }
  }
  if (!mark) throw new Error(`clip ${clip.index + 1}: no logo could close the film: ${refused.join("; ")}`);
  const page = motion.logoHtml({ style: look, portrait: port, brand: colours, mark: { file: "mark.png", w: mark.w, h: mark.h, icon: Boolean(mark.icon) },
    ground: mark.ground, site: clip.site || "", lang: ctx.lang }, { fonts, seconds, icon: iconSvg });
  return { html: page.html, files: { "mark.png": fs.readFileSync(markFile) }, cues: page.cues, W: page.W, H: page.H };
}

// Runs tasks with at most `jobs` at once.
async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
  return results;
}

// Renders film.json to an MP4. Returns { output, seconds, clips, notes }.
async function renderFilm(file, { output = null, jobs = 2, log = () => {}, keep = false, offline = false } = {}) {
  const loaded = loadFilm(file);
  if (loaded.problems.length) throw new Error(`film.json has problems:\n  - ${loaded.problems.join("\n  - ")}`);
  const { film, dir, brand, clips } = loaded;
  const look = film.look;
  const port = film.aspect === "9:16";
  const colours = brandColours(brand);
  const out = path.resolve(output || path.join(dir, "film.mp4"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-work-"));
  const notes = [...(brand ? brand.notes : [])];
  try {
    const fonts = await resolveFonts({ style: look, font: colours.headingFont || "", bodyFont: colours.bodyFont || "" }, { offline });
    if (fonts.missing.length) notes.push(`Not on Google Fonts, so the look's own typeface stood in: ${[...new Set(fonts.missing)].join(", ")}.`);
    // Every clip but the last runs on under the next one's crossfade.
    let at = 0;
    clips.forEach((c, i) => {
      c.start = at;
      c.render = c.seconds + (i < clips.length - 1 ? FADE : 0);
      at += c.seconds;
    });
    const total = at;
    const ctx = { look, port, fonts, colours, work, lang: film.lang || "", brand, notes };
    let done = 0;
    const rendered = await pool(clips, jobs, async (clip) => {
      const page = await buildClip(clip, ctx);
      const mp4 = path.join(work, `clip-${String(clip.index).padStart(2, "0")}.mp4`);
      const started = Date.now();
      const r = await renderPage({ html: page.html, files: page.files, output: mp4, seconds: clip.render, W: page.W, H: page.H, fps: FPS });
      done++;
      log(`clip ${clip.index + 1}/${clips.length} (${clip.kind}${clip.parsed ? ` ${clip.parsed.type}` : ""}, ${clip.seconds.toFixed(1)} s) rendered in ${((Date.now() - started) / 1000).toFixed(1)} s [${done}/${clips.length}]\n`);
      if (r.errors.length) notes.push(`clip ${clip.index + 1}: the page reported ${r.errors.slice(0, 2).join("; ")}`);
      if (r.failedFonts.length) notes.push(`clip ${clip.index + 1}: fonts failed to load: ${r.failedFonts.join(", ")}`);
      return { mp4, cues: page.cues.map((cue) => ({ ...cue, at: clip.start + cue.at })) };
    });
    // The clips joined: each crossfade starts on its clip's first frame.
    const video = path.join(work, "video.mp4");
    const inputs = rendered.flatMap((r) => ["-i", r.mp4]);
    let graph = "";
    let last = "[0:v]";
    for (let i = 1; i < clips.length; i++) {
      const label = i === clips.length - 1 ? "[v]" : `[x${i}]`;
      graph += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${clips[i].start.toFixed(3)}${label};`;
      last = label;
    }
    const map = clips.length > 1 ? ["-filter_complex", graph.replace(/;$/, ""), "-map", "[v]"] : ["-map", "0:v"];
    await mustRun([...inputs, ...map, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-t", total.toFixed(3), "-movflags", "+faststart", video], "joining the clips");
    // The sound: the bed for these cuts and every clip's effects.
    const cues = film.sfx === false ? [] : rendered.flatMap((r) => r.cues);
    const bed = film.music === false ? null : audio.music({ look, seconds: total, cuts: clips.map((c) => c.start), seed: clips.length }).bus;
    const wav = path.join(work, "sound.wav");
    audio.writeWav(wav, audio.mixFilm({ seconds: total, music: bed, cues, musicGain: film.music && film.music.volume !== undefined ? Number(film.music.volume) : 0.55 }));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await mustRun(["-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", total.toFixed(3), "-movflags", "+faststart", out], "adding the sound");
    const timeline = { film: path.relative(path.dirname(out), path.resolve(file)), seconds: +total.toFixed(3), look,
      clips: clips.map((c) => ({ index: c.index + 1, kind: c.kind, type: c.parsed ? c.parsed.type : undefined, start: +c.start.toFixed(3), seconds: +c.seconds.toFixed(3) })) };
    fs.writeFileSync(out.replace(/\.mp4$/i, "") + ".timeline.json", JSON.stringify(timeline, null, 2) + "\n");
    return { output: out, seconds: total, clips: timeline.clips, notes };
  } finally {
    if (!keep) fs.rmSync(work, { recursive: true, force: true });
    else log(`work files kept in ${work}\n`);
  }
}

module.exports = { loadFilm, renderFilm, brandColours, FPS, FADE };
