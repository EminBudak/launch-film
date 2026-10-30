"use strict";
// ─── fonts ─────────────────────────────────────────────────────────────────
// Typefaces come from Google Fonts by family name and are embedded in the
// pages as data URLs (latin and latin-ext faces, so accented letters are
// covered). Each family is fetched once and kept in the cache folder;
// a family Google does not have is remembered as missing.

const fs = require("fs");
const os = require("os");
const path = require("path");

function cacheDir() {
  const base = process.env.LAUNCH_FILM_CACHE || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "launch-film");
  const dir = path.join(base, "fonts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// A browser's user agent: Google Fonts answers it with WOFF2 faces.
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

// @font-face CSS for the family at the weights asked (the nearest it has
// when it lacks one), or "" when it cannot be had.
async function loadFont(family, weights = [400, 700]) {
  const name = String(family || "").trim();
  if (!/^[A-Za-z0-9 ]{2,60}$/.test(name)) return "";
  const dir = cacheDir();
  const key = `${name.replace(/[^A-Za-z0-9]+/g, "_")}-${weights.join("_")}`;
  const file = path.join(dir, `${key}.css`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    // Not fetched yet.
  }
  const missing = path.join(dir, `${name.replace(/[^A-Za-z0-9]+/g, "_")}.missing`);
  if (fs.existsSync(missing)) return "";
  const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}`;
  let css;
  try {
    css = await (await get(`${base}:wght@${weights.join(";")}&display=block`)).text();
  } catch {
    try {
      css = await (await get(`${base}&display=block`)).text();
    } catch (err) {
      // 400 is Google's answer for a family it does not have.
      if (/HTTP 400/.test(err.message)) fs.writeFileSync(missing, "");
      return "";
    }
  }
  const blocks = css.split("/* ").filter((b) => /^(latin|latin-ext) \*\//.test(b));
  if (!blocks.length) return "";
  let out = "";
  for (const block of blocks) {
    const url = (/url\((https:[^)]+)\)/.exec(block) || [])[1];
    if (!url) continue;
    const data = Buffer.from(await (await get(url)).arrayBuffer()).toString("base64");
    out += block.slice(block.indexOf("@font-face")).replace(url, `data:font/woff2;base64,${data}`) + "\n";
  }
  if (out) fs.writeFileSync(file, out);
  return out;
}

module.exports = { loadFont, cacheDir };
