"use strict";
// ─── store pages ───────────────────────────────────────────────────────────
// An App Store address is read as the app, not as the store's website: its
// listing comes from Apple's public lookup API (name, maker, icon,
// screenshots, rating, description and the maker's own site). The maker's
// site, when the listing names one, is read with easybrandkit for its colors,
// fonts and first screen; the app's icon and screenshots are added to that
// kit. Without a site the kit is made from the listing alone.

const fs = require("fs");
const path = require("path");
const { readPixels } = require("./ffmpeg");

const STORE_HOSTS = /(^|\.)(apple\.com|google\.com|youtube\.com|instagram\.com|x\.com|twitter\.com|facebook\.com|linkedin\.com|tiktok\.com|linktr\.ee)$/i;

// The App Store id and country of an address, or null.
function appStoreId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)apps\.apple\.com$|(^|\.)itunes\.apple\.com$/i.test(u.hostname)) return null;
    const id = /\/id(\d{5,})/.exec(u.pathname);
    if (!id) return null;
    const country = (/^\/([a-z]{2})\//i.exec(u.pathname) || [])[1] || "us";
    return { id: id[1], country: country.toLowerCase() };
  } catch {
    return null;
  }
}
const isStoreUrl = (url) => Boolean(appStoreId(url)) || /play\.google\.com\/store\/apps/i.test(String(url));

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json();
}
async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.basename(file)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// The listing from Apple's lookup API.
async function appStoreListing(url) {
  const at = appStoreId(url);
  if (!at) throw new Error("not an App Store address");
  const data = await getJson(`https://itunes.apple.com/lookup?id=${at.id}&country=${at.country}&entity=software`);
  const app = (data.results || []).find((r) => r.kind === "software" || r.trackName);
  if (!app) throw new Error(`the App Store has no app ${at.id} in ${at.country.toUpperCase()}`);
  let seller = "";
  try {
    const host = new URL(app.sellerUrl).hostname;
    if (!STORE_HOSTS.test(host)) seller = app.sellerUrl;
  } catch {
    // No site of its own.
  }
  return {
    url: String(app.trackViewUrl || url).replace(/\?.*$/, ""),
    name: String(app.trackName || "").trim(),
    by: String(app.sellerName || app.artistName || "").trim(),
    description: String(app.description || ""),
    rating: Number(app.averageUserRating) || 0,
    ratings: Number(app.userRatingCount) || 0,
    seller,
    icon: String(app.artworkUrl512 || app.artworkUrl100 || "").replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1024x1024bb.png"),
    // The iPhone screenshots at full width.
    screenshots: (app.screenshotUrls || []).map((u) => String(u).replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1290x0w.jpg")),
  };
}

// The main colours of a picture (an app icon): colourful tones that cover
// enough of it, most common first.
function iconColours(file) {
  const p = readPixels(file, 96);
  const counts = new Map();
  for (let i = 0; i < p.data.length; i += 4) {
    const [r, g, b] = [p.data[i], p.data[i + 1], p.data[i + 2]];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi < 40 || lo > 235 || (hi - lo) / Math.max(1, hi) < 0.3) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    counts.set(key, c);
  }
  const total = p.width * p.height;
  return [...counts.values()].filter((c) => c.n > 0.04 * total).sort((a, b) => b.n - a.n)
    .map((c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v / c.n).toString(16).padStart(2, "0")).join("").toUpperCase()}`);
}

// The page words an app's description gives: its first sentences, and its
// feature lines ("• Reminders: set a time", "• Your Projects" with the line
// under it) as section titles.
function wordsFromListing(listing) {
  const lines = listing.description.split(/\r?\n/).map((l) => l.trim());
  const headings = [];
  const bullet = /^[\u2022\u25cf\u25e6\u25aa\u2023\u2043\u2219*\-\u2013\u2014\u2713\u2714\u2605\u25b8]\s*/;
  for (let i = 0; i < lines.length; i++) {
    if (!bullet.test(lines[i])) continue;
    const content = lines[i].replace(bullet, "").trim();
    const split = /^(.{2,40}?)\s*(?:\s[\u2013\u2014-]\s|:\s)(.+)$/.exec(content);
    if (split) headings.push({ level: 3, text: split[1].trim(), after: split[2].trim(), from: "store" });
    else if ([...content].length <= 40) {
      const next = lines[i + 1] && !bullet.test(lines[i + 1]) ? lines[i + 1] : "";
      headings.push({ level: 3, text: content, after: next, from: "store" });
    }
  }
  const paragraphs = lines.filter((l) => l && !bullet.test(l) && !/^[\u201c"]/.test(l));
  return { lang: "", title: listing.name, description: paragraphs.slice(0, 2).join(" "), siteName: listing.name, ogTitle: "", ogDescription: "", headings, ctas: [], paragraphs, jsonld: [] };
}

// Makes the brand folder for an App Store address: easybrandkit on the maker's
// site when there is one (runEasybrandkit), the listing's icon and screenshots
// added to it. Returns { brandFile, words }.
async function storeBrand(url, dir, { runEasybrandkit, log = () => {} }) {
  const listing = await appStoreListing(url);
  fs.mkdirSync(dir, { recursive: true });
  let brand = null;
  if (listing.seller) {
    log(`Reading the maker's site ${listing.seller} with easybrandkit...\n`);
    try {
      await runEasybrandkit(listing.seller, dir, { log: () => {} });
      brand = JSON.parse(fs.readFileSync(path.join(dir, "brand.json"), "utf8"));
    } catch (err) {
      log(`The maker's site could not be read (${err.message}); the film is made from the App Store listing alone.\n`);
    }
  }
  const assets = [];
  if (listing.icon) {
    await download(listing.icon, path.join(dir, "appstore-icon.png"));
    assets.push({ file: "appstore-icon.png", kind: "icon", width: 1024, height: 1024, alpha: false });
  }
  for (const [i, shot] of listing.screenshots.slice(0, 3).entries()) {
    const file = `appstore-shot-${String(i + 1).padStart(2, "0")}.jpg`;
    try {
      await download(shot, path.join(dir, file));
      const p = readPixels(path.join(dir, file), 64);
      assets.push({ file, kind: "screenshot", width: p.sourceWidth, height: p.sourceHeight, alpha: false });
    } catch (err) {
      log(`A screenshot could not be fetched (${err.message}).\n`);
    }
  }
  const store = { type: "appstore", url: listing.url, ok: true, name: listing.name, by: listing.by, description: listing.description,
    rating: listing.rating || null, ratings: listing.ratings || null, assets };
  if (!brand) {
    const colours = assets.length ? iconColours(path.join(dir, "appstore-icon.png")) : [];
    brand = {
      version: 1, url: listing.url, name: listing.name, colors: colours.slice(0, 3).map((hex, i) => ({ hex, role: i ? "logo" : "button" })),
      fonts: {}, logos: [], screenshots: [], icons: [], images: [], manifest: null, links: [], stores: [],
      notes: ["Made from the App Store listing alone: the colors are the app icon's."],
    };
  }
  brand.name = listing.name || brand.name;
  brand.app = { name: listing.name, by: listing.by, site: listing.seller || "" };
  brand.stores = [store, ...(brand.stores || []).filter((s) => s && s.type !== "appstore")];
  const brandFile = path.join(dir, "brand.json");
  fs.writeFileSync(brandFile, JSON.stringify(brand, null, 2) + "\n");
  return { brandFile, words: wordsFromListing(listing), listing };
}

module.exports = { isStoreUrl, appStoreId, appStoreListing, storeBrand, wordsFromListing, iconColours };
