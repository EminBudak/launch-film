"use strict";
// ─── Chrome over a DevTools pipe ───────────────────────────────────────────
// Every clip is an HTML page rendered frame by frame in headless Chrome: the
// page's clock is virtual, so a frame is drawn for its time and captured,
// however long the drawing takes. No ports are opened: the DevTools protocol
// runs over the pipe Chrome gets as file descriptors 3 and 4.
//
// On a Mac, Chrome asks for the login keychain under a fresh profile unless
// it is given a mock keychain and a basic password store: without them a
// dialog came up on every render. The real HOME stays, so Chrome finds its
// own files; the profile is a temp folder of its own.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { encoder } = require("./ffmpeg");

function onPath(name) {
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      // Not here.
    }
  }
  return null;
}

// The browser to render with: LAUNCH_FILM_CHROME, else an installed Chrome
// or Chromium.
function findChrome() {
  const given = process.env.LAUNCH_FILM_CHROME || process.env.CHROME_PATH;
  if (given) return fs.existsSync(given) ? given : null;
  const mac = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  ];
  const win = [
    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  ];
  const listed = process.platform === "darwin" ? mac : process.platform === "win32" ? win : [];
  for (const file of listed) if (file && fs.existsSync(file)) return file;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const found = onPath(name);
    if (found) return found;
  }
  return null;
}

// A browser with its own temp profile, answering protocol calls by promise.
async function launch({ W = 1920, H = 1080, network = false } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome was not found. Install Google Chrome or Chromium, or set LAUNCH_FILM_CHROME to its path.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-chrome-"));
  const args = [
    "--headless=new", "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-sync", "--disable-default-apps", "--disable-background-networking",
    "--disable-component-update", "--disable-domain-reliability", "--disable-breakpad", "--metrics-recording-only",
    "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
    "--use-mock-keychain", "--password-store=basic", "--force-color-profile=srgb", "--font-render-hinting=none",
    "--allow-file-access-from-files",
    ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ...(process.env.LAUNCH_FILM_GPU === "0" ? ["--disable-gpu"] : []),
    // Pages render offline: they carry their fonts and pictures with them.
    ...(network ? [] : ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]),
    "--remote-debugging-pipe", `--user-data-dir=${profile}`, `--window-size=${W},${H}`, "about:blank",
  ];
  const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const pending = new Map();
  const listeners = new Set();
  let id = 0;
  let buf = Buffer.alloc(0);
  let dead = null;
  child.on("exit", (code) => {
    dead = new Error(`Chrome stopped (exit ${code})${stderr ? `: ${stderr.trim().split("\n").slice(-2).join(" | ")}` : ""}`);
    for (const w of pending.values()) w.reject(dead);
    pending.clear();
  });
  child.on("error", (e) => (dead = e));
  child.stdio[4].on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let i;
    while ((i = buf.indexOf(0)) >= 0) {
      const msg = JSON.parse(buf.subarray(0, i).toString("utf8"));
      buf = buf.subarray(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const w = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) w.reject(new Error(msg.error.message));
        else w.resolve(msg.result || {});
      } else for (const l of listeners) l(msg);
    }
  });
  child.stdio[3].on("error", () => {});
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const n = ++id;
    // A call with no answer in 60 s is an error, not a hang.
    const timer = setTimeout(() => {
      if (pending.delete(n)) reject(new Error(`Chrome did not answer ${method} within 60 s`));
    }, 60_000);
    timer.unref();
    pending.set(n, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
    child.stdio[3].write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  await send("Browser.getVersion");
  return {
    send,
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    async page() {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      return { sessionId, targetId, call: (m, p) => send(m, p, sessionId) };
    },
    close() {
      child.kill("SIGKILL");
      setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 300).unref();
    },
  };
}

// ─── the virtual clock ─────────────────────────────────────────────────────
// Time stands still in the page until the renderer moves it: animation
// frames never fire on their own, timers wait for the clock, Math.random is
// seeded. __lfAdvance(ms) moves the clock, seeks every CSS animation to it
// and calls the page's own __seek(ms).
const CLOCK = String.raw`(() => {
  if (window.__lfAdvance) return;
  let now = 0;
  let seq = 0;
  const timers = new Map();
  let nextId = 1;
  let seed = 0x2f6b9a1d;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const EPOCH = 1767225600000;
  const RealDate = Date;
  function VirtualDate(...args) {
    if (!new.target) return new RealDate(EPOCH + now).toString();
    return args.length ? new RealDate(...args) : new RealDate(EPOCH + now);
  }
  VirtualDate.prototype = RealDate.prototype;
  VirtualDate.now = () => EPOCH + now;
  VirtualDate.parse = RealDate.parse;
  VirtualDate.UTC = RealDate.UTC;
  window.Date = VirtualDate;
  try {
    Object.defineProperty(performance, "now", { value: () => now, configurable: true, writable: true });
  } catch {}
  const frames = new Map();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.setTimeout = (fn, ms, ...args) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, seq: seq++ });
    return id;
  };
  window.setInterval = (fn, ms, ...args) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: now + every, every, fn, args, seq: seq++ });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  const errors = [];
  window.addEventListener("error", (e) => errors.length < 20 && errors.push(String(e.message || e)));
  window.__lfErrors = () => errors;
  window.__lfAdvance = (ms) => {
    now = ms;
    // Timers due by now, in order. Animation frames are not run: a page
    // here draws from __seek, and a frame loop of its own would race it.
    for (let guard = 0; guard < 1000; guard++) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= now && (!due || t.at < due[1].at || (t.at === due[1].at && t.seq < due[1].seq))) due = [id, t];
      if (!due) break;
      const [id, t] = due;
      if (t.every) t.at += t.every;
      else timers.delete(id);
      try { if (typeof t.fn === "function") t.fn(...t.args); } catch (e) { errors.length < 20 && errors.push(String(e && e.message || e)); }
    }
    for (const a of document.getAnimations()) {
      try {
        a.pause();
        a.currentTime = ms;
      } catch {}
    }
    if (typeof window.__seek === "function") window.__seek(ms);
    return true;
  };
})();`;

async function evaluate(page, expression, timeout = 20_000) {
  const r = await page.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(`the page failed: ${((d.exception && d.exception.description) || d.text || "error").split("\n")[0]}`);
  }
  return r.result ? r.result.value : undefined;
}

// Opens a page from a folder (index.html and the files next to it) with the
// clock in place, and waits for its fonts and pictures.
async function openPage(browser, dir, { W, H, scale = 1 }) {
  const page = await browser.page();
  const exceptions = [];
  browser.on((msg) => {
    if (msg.sessionId !== page.sessionId) return;
    if (msg.method === "Runtime.exceptionThrown" && exceptions.length < 20) {
      const d = msg.params.exceptionDetails || {};
      exceptions.push(String((d.exception && d.exception.description) || d.text || "error").split("\n")[0].slice(0, 300));
    }
  });
  await page.call("Page.enable");
  await page.call("Runtime.enable");
  await page.call("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
  await page.call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: scale, mobile: false });
  const loaded = new Promise((resolve) => {
    const on = (msg) => {
      if (msg.sessionId === page.sessionId && msg.method === "Page.loadEventFired") {
        browser.off(on);
        resolve(true);
      }
    };
    browser.on(on);
    setTimeout(() => resolve(false), 30_000).unref();
  });
  const url = `file://${path.join(dir, "index.html").split(path.sep).map((p, i) => (i ? encodeURIComponent(p) : p)).join("/")}`;
  await page.call("Page.navigate", { url });
  if (!(await loaded)) throw new Error("the page did not load within 30 s");
  const failedFonts = await evaluate(page, `Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))])
    .then(() => document.fonts.ready).then(() => [...document.fonts].filter((f) => f.status === "error").map((f) => f.family))`);
  return { page, exceptions, failedFonts: failedFonts || [] };
}

// Renders a page to a silent MP4: `seconds` at `fps`, each frame drawn for
// its time and captured as a JPEG into ffmpeg. files: { name: Buffer } served
// next to the page.
async function renderPage({ html, files = {}, output, seconds, W = 1920, H = 1080, scale = 1, fps = 25, onFrame = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-page-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  const browser = await launch({ W, H });
  const enc = encoder({ output, fps });
  try {
    const { page, exceptions, failedFonts } = await openPage(browser, dir, { W, H, scale });
    const frames = Math.round(seconds * fps);
    for (let f = 0; f < frames; f++) {
      await evaluate(page, `__lfAdvance(${((f * 1000) / fps).toFixed(3)})`);
      const shot = await page.call("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
      await enc.write(Buffer.from(shot.data, "base64"));
      if (onFrame) onFrame(f + 1, frames);
    }
    await enc.end();
    const errors = [...exceptions, ...((await evaluate(page, "window.__lfErrors ? window.__lfErrors() : []").catch(() => [])) || [])];
    return { frames, errors, failedFonts };
  } catch (err) {
    enc.kill();
    throw err;
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// One still of a page at a time (ms), as PNG: for checks and tests.
async function stillOf({ html, files = {}, at = 0, W = 1920, H = 1080, scale = 1 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-page-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  const browser = await launch({ W, H });
  try {
    const { page, exceptions } = await openPage(browser, dir, { W, H, scale });
    // The clock moves forward to the time, as in a render.
    const step = 40;
    for (let ms = 0; ms < at; ms += step) await evaluate(page, `__lfAdvance(${ms})`);
    await evaluate(page, `__lfAdvance(${at})`);
    const shot = await page.call("Page.captureScreenshot", { format: "png" });
    return { png: Buffer.from(shot.data, "base64"), errors: exceptions };
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { findChrome, onPath, launch, openPage, renderPage, stillOf, evaluate, CLOCK };
