"use strict";
// ─── the words ─────────────────────────────────────────────────────────────
// A film made without a brief takes its words from the product's own page:
// its title and description, its headline, the headings of its sections with
// the line under each, and the numbers it is proud of. They are read from
// the page's HTML; a page that builds its text in the browser is read in
// Chrome instead.

const { launch, evaluate } = require("./chrome");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c",
  hellip: "\u2026", mdash: "\u2014", ndash: "\u2013", middot: "\u00b7", bull: "\u2022", copy: "\u00a9", reg: "\u00ae", trade: "\u2122", times: "\u00d7" };
function decode(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const textOf = (html) => decode(String(html).replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ").trim();
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : "";
};

// The words a page's HTML holds. The order of headings and paragraphs is the
// page's, so a section's heading is followed by its own line.
function fromHtml(html) {
  const out = { lang: "", title: "", description: "", siteName: "", ogTitle: "", ogDescription: "", headings: [], ctas: [], paragraphs: [], jsonld: [] };
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (htmlTag) out.lang = attr(htmlTag[0], "lang").slice(0, 2).toLowerCase();
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) out.title = textOf(title[1]);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], "property") || attr(m[0], "name")).toLowerCase();
    const content = attr(m[0], "content").replace(/\s+/g, " ").trim();
    if (!content) continue;
    if (key === "description" && !out.description) out.description = content;
    else if ((key === "og:description" || key === "twitter:description") && !out.ogDescription) out.ogDescription = content;
    else if ((key === "og:title" || key === "twitter:title") && !out.ogTitle) out.ogTitle = content;
    else if (key === "og:site_name" && !out.siteName) out.siteName = content;
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      for (const item of [data, ...(Array.isArray(data) ? data : []), ...((data && data["@graph"]) || [])]) {
        if (item && typeof item === "object" && !Array.isArray(item)) out.jsonld.push({ name: item.name || "", description: item.description || "", slogan: item.slogan || "" });
      }
    } catch {
      // Not JSON.
    }
  }
  const body = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  for (const m of body.matchAll(/<(h[1-4]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = textOf(m[2]);
    if (!text) continue;
    const tag = m[1].toLowerCase();
    if (tag === "p") out.paragraphs.push(text);
    else out.headings.push({ level: Number(tag[1]), text, after: "" });
    // The first paragraph after a heading is its line.
    if (tag === "p" && out.headings.length) {
      const last = out.headings[out.headings.length - 1];
      if (!last.after) last.after = text;
    }
  }
  for (const m of body.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const cls = attr(`<x ${m[2]}>`, "class");
    if (m[1].toLowerCase() === "a" && !/btn|button|cta|primary/i.test(cls)) continue;
    const text = textOf(m[3]);
    if (text && text.length <= 30 && !out.ctas.includes(text)) out.ctas.push(text);
  }
  return out;
}

// The same read in Chrome, from the page as it shows: only visible text.
const IN_PAGE = String.raw`(() => {
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const meta = (k) => { const m = document.querySelector('meta[property="' + k + '"],meta[name="' + k + '"]'); return m ? clean(m.content) : ""; };
  const out = { lang: (document.documentElement.lang || "").slice(0, 2).toLowerCase(), title: clean(document.title), description: meta("description"), siteName: meta("og:site_name"),
    ogTitle: meta("og:title") || meta("twitter:title"), ogDescription: meta("og:description") || meta("twitter:description"), headings: [], ctas: [], paragraphs: [], jsonld: [] };
  const inChrome = (el) => el.closest("nav,footer,header [role=navigation],dialog,[aria-modal=true]");
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p")) {
    if (!seen(el) || inChrome(el)) continue;
    const text = clean(el.innerText);
    if (!text) continue;
    if (el.tagName === "P") {
      out.paragraphs.push(text);
      const last = out.headings[out.headings.length - 1];
      if (last && !last.after) last.after = text;
    } else out.headings.push({ level: Number(el.tagName[1]), text, after: "" });
  }
  for (const el of document.querySelectorAll("a,button")) {
    if (!seen(el) || inChrome(el)) continue;
    const cls = String(el.className || "");
    const s = getComputedStyle(el);
    const filled = s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor);
    if (el.tagName === "A" && !/btn|button|cta|primary/i.test(cls) && !filled) continue;
    const text = clean(el.innerText);
    if (text && text.length <= 30 && !out.ctas.includes(text)) out.ctas.push(text);
  }
  return out;
})()`;

async function fromChrome(url) {
  const browser = await launch({ W: 1440, H: 900, network: true });
  try {
    const page = await browser.page();
    await page.call("Page.enable");
    await page.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
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
    await page.call("Page.navigate", { url });
    await loaded;
    // Pages that fetch their text after load get a moment more.
    await new Promise((r) => setTimeout(r, 2500));
    return await evaluate(page, IN_PAGE);
  } finally {
    browser.close();
  }
}

// The page's words: from its HTML, or from Chrome when the HTML has no
// headline.
async function readWords(url, { log = () => {} } = {}) {
  let words = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en;q=0.9,*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok && /html/i.test(res.headers.get("content-type") || "")) words = fromHtml(await res.text());
  } catch (err) {
    log(`The page could not be fetched (${err.message}); reading it in Chrome.\n`);
  }
  const enough = (w) => w && w.headings.some((h) => h.level === 1) && w.headings.length >= 3;
  if (!enough(words)) {
    try {
      const seen = await fromChrome(url);
      if (seen && (!words || seen.headings.length > words.headings.length)) words = { ...(words || {}), ...seen, jsonld: (words && words.jsonld) || [] };
    } catch (err) {
      log(`Chrome could not read the page (${err.message}).\n`);
    }
  }
  return words || fromHtml("");
}

module.exports = { readWords, fromHtml, decode };
