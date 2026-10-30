#!/usr/bin/env node
"use strict";
// Draws the test brand, "Acme Notes", a product that does not exist: its
// header logo, the first screen of its site, a store screenshot and an app
// icon, with brand.json in brandkit's shape. Run it again to change them:
//
//   node test/fixtures/make-fixture.js

const fs = require("fs");
const path = require("path");
const { stillOf } = require("../../src/chrome");

const out = path.join(__dirname, "acme");
const ACCENT = "#5B4FE9";
const INK = "#16151D";
const font = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

const mark = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${ACCENT}"/>` +
  `<path d="M18 44 L32 16 L46 44" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 34 H40" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`;

const pages = {
  // The header logo as brandkit cuts it: on the header's own white ground.
  "logo-header.png": { W: 560, H: 240, html: `<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:240px;${font}">
    <div style="display:flex;align-items:center;gap:22px">${mark(96)}<b style="font-size:64px;color:${INK};letter-spacing:-.03em">Acme Notes</b></div></body>` },
  "screenshot-1.png": { W: 1440, H: 900, html: `<body style="margin:0;background:#FBFAFF;${font};color:${INK}">
    <header style="display:flex;align-items:center;justify-content:space-between;padding:22px 64px;border-bottom:1px solid #ECEAF5">
      <div style="display:flex;align-items:center;gap:12px">${mark(36)}<b style="font-size:24px;letter-spacing:-.02em">Acme Notes</b></div>
      <nav style="display:flex;gap:34px;font-size:17px;color:#5A5870"><span>Product</span><span>Pricing</span><span>Changelog</span><span>Log in</span></nav>
      <span style="background:${ACCENT};color:#fff;padding:12px 22px;border-radius:10px;font-weight:600">Start free</span></header>
    <main style="display:grid;grid-template-columns:1fr 1.15fr;gap:56px;padding:80px 64px;align-items:center">
      <div><h1 style="font-size:64px;line-height:1.02;letter-spacing:-.035em;margin:0 0 24px">Notes that think with you</h1>
        <p style="font-size:22px;line-height:1.5;color:#5A5870;margin:0 0 34px">Write once and find it anywhere. Acme links your notes, meetings and tasks on its own.</p>
        <span style="background:${ACCENT};color:#fff;padding:16px 28px;border-radius:12px;font-weight:600;font-size:19px">Start free</span></div>
      <div style="background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(40,30,120,.16);padding:26px;display:grid;grid-template-columns:180px 1fr;gap:22px;height:470px">
        <div style="display:flex;flex-direction:column;gap:12px;font-size:15px;color:#5A5870">
          <b style="color:${INK}">Workspace</b><span>Inbox</span><span style="color:${ACCENT};font-weight:600">Product notes</span><span>Meetings</span><span>Roadmap</span><span>Ideas</span></div>
        <div><b style="font-size:24px">Launch plan</b>
          ${[0.92, 0.76, 0.84, 0.6, 0.88, 0.7].map((w) => `<div style="height:13px;width:${w * 100}%;background:#EEECF8;border-radius:7px;margin-top:18px"></div>`).join("")}
          <div style="margin-top:26px;padding:16px;border-radius:12px;background:#F3F1FF;color:${ACCENT};font-size:15px;font-weight:600">3 linked notes found</div></div></div></main></body>` },
  "appstore-1.png": { W: 645, H: 1398, html: `<body style="margin:0;background:#F6F5FF;${font};color:${INK}">
    <div style="padding:120px 44px 0"><div style="font-size:52px;font-weight:800;letter-spacing:-.03em;line-height:1.05">Today</div>
      <div style="margin-top:12px;font-size:24px;color:#6B6880">4 notes, 2 meetings</div>
      ${["Design review", "Launch plan", "Customer call", "Weekly sync"].map((t, i) => `<div style="margin-top:28px;background:#fff;border-radius:26px;padding:30px;box-shadow:0 10px 30px rgba(40,30,120,.08)">
        <div style="display:flex;align-items:center;gap:16px"><span style="width:18px;height:18px;border-radius:50%;background:${i === 1 ? ACCENT : "#C9C5EA"}"></span><b style="font-size:30px">${t}</b></div>
        <div style="height:12px;width:80%;background:#EEECF8;border-radius:6px;margin-top:20px"></div><div style="height:12px;width:56%;background:#EEECF8;border-radius:6px;margin-top:12px"></div></div>`).join("")}
    </div></body>` },
  "app-icon.png": { W: 512, H: 512, html: `<body style="margin:0;background:${ACCENT};display:grid;place-items:center;height:512px">
    <svg width="300" height="300" viewBox="0 0 64 64"><path d="M18 46 L32 14 L46 46" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 35 H40" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg></body>` },
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const [file, p] of Object.entries(pages)) {
    const { png } = await stillOf({ html: `<!doctype html><html><head><meta charset="utf-8"></head>${p.html}</html>`, W: p.W, H: p.H });
    fs.writeFileSync(path.join(out, file), png);
    console.log(file, png.length);
  }
  const brand = {
    version: 1,
    url: "https://acme-notes.example/",
    name: "Acme Notes",
    colors: [{ hex: ACCENT, role: "button" }, { hex: INK, role: "heading" }, { hex: "#5A5870", role: "link" }, { hex: "#FFFFFF", role: "header" }, { hex: "#FBFAFF", role: "surface" }],
    fonts: { heading: "Inter", body: "Inter" },
    logos: [{ file: "logo-header.png", where: "header", kind: "img", background: "#FFFFFF", width: 560, height: 240, src: "https://acme-notes.example/logo.svg", alt: "Acme Notes" }],
    screenshots: [{ file: "screenshot-1.png", width: 1440, height: 900 }],
    icons: [],
    images: [],
    manifest: null,
    links: [{ type: "appstore", url: "https://apps.apple.com/app/id0000000000", from: "footer" }],
    stores: [{ type: "appstore", url: "https://apps.apple.com/app/id0000000000", ok: true, name: "Acme Notes", by: "Acme", description: "Notes that link themselves.",
      assets: [{ file: "app-icon.png", kind: "icon", width: 512, height: 512, alpha: false }, { file: "appstore-1.png", kind: "screenshot", width: 645, height: 1398, alpha: false }] }],
    notes: [],
  };
  fs.writeFileSync(path.join(out, "brand.json"), JSON.stringify(brand, null, 2) + "\n");
  // The page's words, as words.json would hold them.
  const words = {
    lang: "en", title: "Acme Notes | Notes that think with you", description: "Write once and find it anywhere. Acme links your notes, meetings and tasks on its own.",
    siteName: "Acme Notes", ogTitle: "", ogDescription: "", jsonld: [], ctas: ["Start free"], paragraphs: ["Trusted by 12,000+ teams worldwide"],
    headings: [
      { level: 1, text: "Notes that think with you", after: "Write once and find it anywhere." },
      { level: 2, text: "Everything links itself", after: "Acme reads what you write and connects it." },
      { level: 3, text: "Instant search", after: "Find any note in a blink, even offline." },
      { level: 3, text: "Private by design", after: "Your notes are encrypted end to end." },
      { level: 3, text: "Shared spaces", after: "Plan launches together with your team." },
    ],
  };
  fs.writeFileSync(path.join(out, "words.json"), JSON.stringify(words, null, 2) + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
