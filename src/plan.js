"use strict";
// ─── the plan ──────────────────────────────────────────────────────────────
// A film without a brief: its clips are chosen from what the brand has. The
// product's name and promise open it, its real screen comes in as a window,
// its own sentence is set as a headline, its sections become feature cards,
// a number it states counts up, its store screens stand in a phone, and its
// logo closes it. Every word on screen is the page's own.
//
// The plan is written as film.json, which an agent (or a person) may edit
// before the render: the words, the order, the look, the lengths.

const path = require("path");
const { LOOKS } = require("./motion");
const { MOODS } = require("./audio");
const { pickLook } = require("./brand");

// ─── words ─────────────────────────────────────────────────────────────────
const STOP = new Set("a an and are as at be by for from has have in into is it its of on or our that the their this to was we with you your will can more all any every just than then them they".split(" "));
const NAV = /^(home|about|about us|blog|pricing|plans|login|log in|sign in|sign up|signup|get started|contact|contact us|careers|jobs|faq|faqs|help|docs|documentation|support|resources|company|customers|features|product|products|solutions|legal|privacy|terms|cookies|menu|search|download|testimonials|newsletter|subscribe|follow us|press|partners|integrations|changelog|status|community|events|security)$/i;
// A spaced dash between two phrases reads as a comma on screen.
const clean = (t) => String(t || "").replace(/\s+/g, " ").replace(/\s[\u2013\u2014]\s/g, ", ").trim();
const wordsIn = (t) => clean(t).split(" ").filter(Boolean);
// A heading read two or three times over ("Plan and build Plan and build":
// a page that draws its text more than once for an effect) is said once.
function once(text) {
  const w = wordsIn(text);
  for (let k = 2; k <= 4; k++) {
    if (w.length < 2 * k || w.length % k) continue;
    const n = w.length / k;
    const first = w.slice(0, n).join(" ");
    if (Array.from({ length: k }, (_, i) => w.slice(i * n, (i + 1) * n).join(" ")).every((part) => part === first)) return first;
  }
  return clean(text);
}
// The first clause of a sentence that fits, cut at a comma or a semicolon,
// never in the middle of a phrase; "" when even that is too long.
function clause(text, max) {
  const t = clean(text).replace(/[.]$/, "");
  if ([...t].length <= max) return t;
  const parts = t.split(/(?<=[,;])\s+/);
  let out = "";
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if ([...next].length > max) break;
    out = next;
  }
  return out.replace(/[,;]$/, "");
}
const secondSentence = (t) => {
  const s = clean(t);
  const m = /^.{12,}?[.!?]\s+(.{12,}?[.!?])(\s|$)/.exec(s);
  return m ? m[1].replace(/[.]$/, "") : "";
};
const firstSentence = (t) => {
  const s = clean(t);
  const m = /^(.{12,}?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).replace(/[.]$/, "");
};
// Cut to a length at a word, never mid-word.
function fit(text, max) {
  const t = clean(text);
  if ([...t].length <= max) return t;
  const words = t.split(" ");
  let out = "";
  for (const w of words) {
    if ([...(out ? `${out} ${w}` : w)].length > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return out.replace(/[,;:]$/, "");
}
// The page title without the brand's name and its separator.
function withoutName(title, name) {
  const parts = String(title || "").replace(/\s+/g, " ").trim().split(/\s+[|\u2013\u2014\-:\u00b7\u2022]\s+/);
  const n = String(name || "").toLowerCase();
  const rest = parts.filter((p) => p.toLowerCase() !== n && !(n && p.toLowerCase().startsWith(n) && p.length < n.length + 4));
  return rest.length ? clean(rest.sort((a, b) => b.length - a.length)[0]) : "";
}
// Marks the last one or two content words, where an English sentence puts
// its weight: "Ship *faster*".
function markEnd(text) {
  const words = clean(text).split(" ");
  const content = (w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 3 && !STOP.has(w.toLowerCase().replace(/[^\p{L}]/gu, ""));
  let end = words.length - 1;
  while (end >= 0 && !content(words[end])) end--;
  if (end < 0) return clean(text);
  let start = end;
  if (end > 0 && content(words[end - 1]) && (words[end - 1] + words[end]).length <= 16 && !/[,.;:!?]$/.test(words[end - 1])) start = end - 1;
  // Punctuation after the mark stays outside it.
  const tail = /([,.;:!?]+)$/.exec(words[end]);
  if (tail) words[end] = words[end].slice(0, -tail[1].length);
  words[start] = `*${words[start]}`;
  words[end] = `${words[end]}*${tail ? tail[1] : ""}`;
  return words.join(" ");
}

// Icons for a feature's words (Phosphor names).
const ICONS = [
  [/fast|speed|quick|instant|real.?time|second|lightning/i, "lightning"],
  [/pay|money|price|billing|invoice|bank|finance|cost|save|card\b/i, "credit-card"],
  [/to-?dos?\b|task|check|done|habit/i, "check-square"],
  [/project|kanban|board|roadmap/i, "kanban"],
  [/secur|privacy|private|encrypt|safe|protect|complian|trust/i, "shield-check"],
  [/team|collab|share|together|multiplayer|people|member/i, "users-three"],
  [/search|find|discover|explore/i, "magnifying-glass"],
  [/\bai\b|smart|intelligen|magic|assist|gpt|model|agent/i, "sparkle"],
  [/analytic|insight|metric|report|dashboard|data|track/i, "chart-line-up"],
  [/integrat|connect|api|plugin|extension|webhook/i, "plugs-connected"],
  [/mobile|phone|ios|android|app\b/i, "device-mobile"],
  [/cloud|sync|backup|storage|upload/i, "cloud-arrow-up"],
  [/automat|workflow|pipeline|schedul/i, "flow-arrow"],
  [/chat|message|comment|inbox|conversation|support/i, "chat-circle-dots"],
  [/calendar|time|deadline|plan|today|schedul/i, "calendar-check"],
  [/global|world|language|translat|international|everywhere/i, "globe-hemisphere-west"],
  [/code|developer|deploy|git|build|ship|terminal|cli/i, "code"],
  [/design|create|edit|brand|canvas|draw/i, "paint-brush"],
  [/video|camera|record|stream|film/i, "video-camera"],
  [/music|audio|sound|voice|podcast/i, "music-notes"],
  [/health|care|wellness|fitness|sleep/i, "heart"],
  [/open.?source|free|community/i, "hand-heart"],
  [/note|write|doc|page|content|text/i, "note-pencil"],
  [/learn|course|educat|student|teach/i, "graduation-cap"],
  [/shop|store|cart|order|deliver|commerce/i, "shopping-bag"],
  [/notif|alert|remind/i, "bell-ringing"],
  [/custom|flexib|config|setting|control/i, "sliders-horizontal"],
  [/offline|local|device/i, "hard-drives"],
  [/scale|grow|performance/i, "trend-up"],
  [/area|space|folder|organi[sz]|categor/i, "squares-four"],
];
const SPARE_ICONS = ["sparkle", "check-circle", "rocket-launch", "star-four", "lightbulb", "target"];
// The title's own words choose the icon; a title they say nothing about
// gets a plain one. (The line under a title mentioned "finance" in passing
// and gave a card about areas of life a credit card.)
function iconFor(title, line, used) {
  for (const [re, name] of ICONS) if (re.test(title) && !used.has(name)) return name;
  return SPARE_ICONS.find((n) => !used.has(n)) || "sparkle";
}

const VERBS = /^(have|has|had|use|uses|used|are|is|was|were|trust|trusts|rely|relies|choose|chose|run|runs|love|loves|build|built|ship|shipped|on|since|and|to|who|that|with|across|in)$/i;
const AFTER = /^(through|for|from|by|via|like|including|over|per|at|of)$/i;
// A number the page states with what it counts: "10,000+ teams",
// "99.9% uptime", "4.8 stars".
function findNumber(texts) {
  const re = /(^|[\s(])((?:\$|\u20ac|\u00a3)?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?(?:%|\+|x|k\+?|K\+?|M\+?|B\+?|million|billion)?)\s+([A-Za-z][A-Za-z0-9 &'.-]{2,60})/;
  for (const raw of texts) {
    const t = clean(raw);
    const m = re.exec(t);
    if (!m) continue;
    const value = m[2].replace(/\s+/g, "");
    const digits = value.replace(/[^\d]/g, "");
    // Years and lone small numbers are not boasts.
    if (/^(19|20)\d\d$/.test(digits) && value === digits) continue;
    if (!/[%+kKMBx]|million|billion|,|\./.test(value) && Number(digits) < 100) continue;
    // What it counts, up to the verb: "of Fortune 100 companies" from "50%
    // of Fortune 100 companies have used Stripe".
    const words = [];
    for (const word of wordsIn(m[3])) {
      // "of" may open the label ("50% of Fortune 100"); after its first
      // word a verb or a preposition ends it ("40+ languages through quick
      // lessons" counts languages).
      if (words.length >= 5 || (VERBS.test(word) && !(words.length === 0 && /^of$/i.test(word))) || (words.length && AFTER.test(word))) break;
      words.push(word);
      if (/[,.;:]$/.test(word)) break;
    }
    const label = words.join(" ").replace(/[,.;:]$/, "");
    if (label.length < 4) continue;
    // "over 40,000 teams" is 40,000+.
    const more = /\b(over|more than|above|beyond)\s*$/i.test(t.slice(0, m.index + m[1].length)) && !/[+]$/.test(value);
    return { value: (value + (more ? "+" : "")).slice(0, 16), text: fit(label, 40) };
  }
  return null;
}

// The headings to take copy from. brandkit's are the ones the page shows,
// in reading order, without the navigation and footer; the page as read
// here adds the line under each. A store listing's feature lines (read
// here from its description) come first when there are any.
function mergeHeadings(kit, read) {
  const key = (t) => once(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const fromStore = read.filter((h) => h.from === "store");
  if (kit.length < 2 || fromStore.length >= 2) return read.map((h) => ({ ...h, text: once(h.text) }));
  const lines = new Map(read.filter((h) => h.after).map((h) => [key(h.text), h.after]));
  return kit.map((h) => ({ ...h, text: once(h.text), after: h.after || lines.get(key(h.text)) || "" }));
}

// The copy a film needs, from the page's words and the brand.
function copyFrom(brand, words) {
  // The page's words as read, filled in from brandkit's where they are thin.
  const read = words || {};
  const kit = brand.text || {};
  const w = {
    ...kit,
    ...read,
    title: read.title || kit.title || "",
    description: read.description || kit.description || "",
    headings: mergeHeadings(kit.headings || [], read.headings || []),
  };
  const name = clean(brand.name || w.siteName || withoutName(w.title || "", "") || brand.host);
  const h1 = (w.headings || []).find((h) => h.level === 1);
  const headings = (w.headings || []).filter((h) => !NAV.test(h.text) && h.text.length >= 3);
  const ld = (w.jsonld || []).find((j) => j.slogan || j.description) || {};
  const candidates = [
    h1 && h1.text,
    // A headline that carries its subheading too ("Financial infrastructure
    // to grow your revenue. Accept payments...") gives its first sentence.
    h1 && firstSentence(h1.text).replace(/[.!]$/, ""),
    ld.slogan,
    withoutName(w.ogTitle || "", name),
    withoutName(w.title || "", name),
    firstSentence(w.ogDescription || w.description || brand.description || ""),
    ...(brand.profiles || []).map(firstSentence),
  ].map(clean).filter((t) => t && wordsIn(t).length >= 2 && t.toLowerCase() !== name.toLowerCase());
  const promise = candidates.find((t) => [...t].length <= 60 && wordsIn(t).length <= 10) || fit(candidates[0] || "", 60);
  const description = firstSentence(w.ogDescription || w.description || ld.description || brand.description || "");
  // A second sentence for the headline: the description, unless it says
  // the promise again.
  let statement = description && description.toLowerCase() !== promise.toLowerCase() ? description : "";
  // An app description often opens with a short cry ("Get things done!")
  // and says what it is in the next sentence.
  if (statement && statement.toLowerCase() === promise.toLowerCase().replace(/[.!]$/, "")) statement = "";
  if (!statement || [...statement].length > 90) {
    // A section title stands in only when it is a sentence, not a label.
    const h2 = headings.find((h) => h.level === 2 && [...h.text].length <= 90 && wordsIn(h.text).length >= 5 && h.text !== promise);
    if (h2) statement = h2.text;
    else statement = clause(statement || secondSentence(w.description || ""), 90);
  }
  // Features: short headings (2-6 words) with a line under them, in the
  // page's order. Cards (h3) come before sections (h2) when there are at
  // least two. Text from a drawn product screen (an issue title over
  // "vehicle_state", a ticket number) is not a feature.
  const codeLike = /[_{}<>\\]|\b[a-z]+[A-Z]\w*\b|#\d+|\b[A-Z]{2,}-\d+\b/;
  const usable = headings.filter((h) => {
    const n = wordsIn(h.text).length;
    // A store listing's feature lines may be one word ("Reminders").
    return n >= (h.from === "store" ? 1 : 2) && n <= 6 && [...h.text].length <= 34 && h.text !== promise && h.text !== statement && !/[?:]$/.test(h.text) &&
      !codeLike.test(`${h.text} ${h.after || ""}`) && h.level >= 2 && h.level <= 4;
  });
  const withLine = (list) => list.filter((h) => wordsIn(firstSentence(h.after || "")).length >= 3);
  const byLevel = (level) => (withLine(usable.filter((h) => h.level === level)).length >= 2 ? withLine(usable.filter((h) => h.level === level)) : usable.filter((h) => h.level === level));
  const pool = [3, 2, 4].map(byLevel).find((list) => list.length >= 2) || usable;
  const used = new Set();
  const features = [];
  for (const h of pool) {
    if (features.length >= 3) break;
    if (features.some((f) => f.title.toLowerCase() === h.text.toLowerCase())) continue;
    const icon = iconFor(h.text, h.after || "", used);
    used.add(icon);
    features.push({ icon, title: h.text, text: firstSentence(h.after || "") });
  }
  // A card's line is read along with its title: short lines all round, or
  // titles alone, so the cards match.
  const short = features.every((f) => f.text && [...f.text].length <= 48);
  for (const f of features) f.text = short ? f.text.replace(/[.]$/, "") : "";
  const stat = findNumber([...(w.headings || []).map((h) => h.text), ...(w.paragraphs || []).slice(0, 40), w.description || ""]);
  const lang = /^[a-z]{2}$/.test(w.lang || "") ? w.lang : "";
  return { name, promise, statement, features, stat, cta: (w.ctas || [])[0] || "", lang };
}

// ─── clips ─────────────────────────────────────────────────────────────────
// Lengths are whole bars of the look's music, so cuts land on downbeats.
function planFilm(brand, words, { look = null, seconds = 30, aspect = "16:9", filmDir = path.dirname(brand.dir) } = {}) {
  const chosen = look && LOOKS[look] ? look : pickLook(brand);
  const mood = MOODS[chosen];
  const bar = 240 / mood.bpm;
  const copy = copyFrom(brand, words);
  const clips = [];
  // Paths in film.json are relative to its own folder.
  const rel = (file) => path.relative(filmDir, file).split(path.sep).join("/");
  const scene = (spec, bars = 2) => clips.push({ kind: "scene", bars, scene: spec });
  // The name opens the film, its promise under it in the accent.
  scene({ type: "opener", title: fit(copy.name, 60), ...(copy.promise ? { text: fit(copy.promise, 60) } : {}) }, 2);
  if (brand.screens[0]) clips.push({ kind: "screen", bars: 2, image: rel(brand.screens[0].file), mode: "pan", side: "center" });
  if (copy.statement) scene({ type: "headline", title: markEnd(fit(copy.statement, 90)) }, 2);
  if (copy.features.length >= 2) scene({ type: "features", title: "", items: copy.features }, copy.features.length >= 3 ? 3 : 2);
  // Store screenshots stand side by side as they are: many are pictures of
  // a phone already, and a drawn phone around them made a phone in a phone.
  if (brand.phoneScreens.length) clips.push({ kind: "shots", bars: 2, images: brand.phoneScreens.slice(0, 3).map((s) => rel(s.file)) });
  if (copy.stat) scene({ type: "number", value: copy.stat.value, text: copy.stat.text }, 2);
  // An app's store rating, when it has enough ratings to mean something.
  else if (brand.rating && brand.rating.score >= 4 && brand.rating.count >= 50) {
    const n = brand.rating.count;
    const count = n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString("en-US");
    scene({ type: "rating", value: brand.rating.score.toFixed(1), score: Math.min(5, brand.rating.score), text: `${count} ratings` }, 2);
  }
  // Short films get the name once more, big, and a second look at the
  // screen before the close (never two screens in a row).
  const sum = () => clips.reduce((s, c) => s + c.bars * bar, 0);
  if (sum() + 2 * bar < 20) scene({ type: "bigword", title: fit(copy.name, 24) }, 2);
  if (sum() + 2 * bar < 20 && brand.screens[0]) clips.push({ kind: "screen", bars: 2, image: rel(brand.screens[0].file), mode: "pan", side: "top" });
  // Long films lose the clips that matter least first.
  while (sum() + 2 * bar > seconds + bar && clips.length > 3) {
    const drop = ["number", "rating", "shots", "headline"].map((t) => clips.findIndex((c) => (c.scene && c.scene.type === t) || c.kind === t)).find((i) => i > 0);
    if (drop === undefined) break;
    clips.splice(drop, 1);
  }
  // An app given by its store page closes on its icon; a site on its logo.
  const siteOf = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const logo = brand.app && brand.appIcon ? { kind: "logo", bars: 2, icon: rel(brand.appIcon.file), site: siteOf(brand.app.site) || copy.name }
    : brand.logos[0] ? { kind: "logo", bars: 2, logo: rel(brand.logos[0].file), site: brand.host || "" }
      : brand.appIcon ? { kind: "logo", bars: 2, icon: rel(brand.appIcon.file), site: copy.name } : null;
  if (logo) clips.push(logo);
  else scene({ type: "bigword", title: fit(copy.name, 24) }, 2);
  return {
    version: 1,
    url: brand.url,
    brand: rel(path.join(brand.dir, "brand.json")),
    look: chosen,
    aspect,
    lang: copy.lang || undefined,
    music: true,
    sfx: true,
    clips,
  };
}

module.exports = { planFilm, copyFrom, markEnd, findNumber, fit, withoutName };
