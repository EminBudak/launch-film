"use strict";
// The stills' pages are tested as HTML; making them needs Chrome and ffmpeg
// and is skipped when either is missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome } = require("../src/chrome");
const { available, probe, readPixels } = require("../src/ffmpeg");
const { makeStills, parseTargets, galleryClips, TARGETS } = require("../src/stills");
const motion = require("../src/motion");
const { readBrand } = require("../src/brand");
const { planFilm } = require("../src/plan");

const skip = !findChrome() ? "Chrome not found" : !available() ? "ffmpeg not found" : false;
const fixture = path.join(__dirname, "fixtures", "acme");
const fonts = { css: "", head: "Inter", body: "Inter", label: "JetBrains Mono", weight: { head: 700, body: 500 } };

test("targets: their names and sizes, and one that is not a target", () => {
  assert.deepEqual(parseTargets(), ["ph", "og", "x", "play", "chrome"]);
  assert.deepEqual(parseTargets("og, x,og"), ["og", "x"]);
  assert.throws(() => parseTargets("tiktok"), /choose from ph, og, x, play, chrome/);
  const sizes = Object.values(TARGETS).flat().filter((t) => t.kind !== "frames").map((t) => `${t.name} ${t.W}x${t.H}`);
  assert.deepEqual(sizes, ["ph-1 1270x760", "ph-thumbnail 240x240", "og 1200x630", "x 1600x900", "play-feature 1024x500", "chrome-small 440x280", "chrome-marquee 1400x560"]);
});

test("the gallery takes the film's scenes but the opener and the screen the first picture shows", () => {
  const clip = (kind, type) => ({ kind, scene: type ? { type } : undefined });
  const clips = [clip("scene", "opener"), clip("screen"), clip("scene", "headline"), clip("scene", "features"), clip("shots"), clip("scene", "number"), clip("logo")];
  const kinds = (list) => list.map((c) => (c.scene ? c.scene.type : c.kind));
  assert.deepEqual(kinds(galleryClips(clips, { heroScreen: true })), ["headline", "features", "shots", "number", "logo"]);
  // Six would be one too many: a screen goes before a scene does.
  assert.deepEqual(kinds(galleryClips(clips, { heroScreen: false })), ["headline", "features", "shots", "number", "logo"]);
  const longer = [...clips.slice(0, 3), clip("phone"), ...clips.slice(3)];
  const g = galleryClips(longer, { heroScreen: true });
  assert.equal(g.length, 5);
  assert.equal(g[g.length - 1].kind, "logo");
  assert.ok(!g.some((c) => c.kind === "phone"), "a phone goes before a scene");
});

test("every look lays out a hero, a hero with no words and a tile", () => {
  for (const look of Object.keys(motion.LOOKS)) {
    const hero = motion.stillHtml({ kind: "hero", look, W: 1920, H: 1008, brand: { accent: "#5B4FE9" }, fonts, mark: { file: "mark.png", w: 560, h: 240, ground: "#FFFFFF" },
      name: "Acme Notes", title: "Notes that *think* with you", site: "acme-notes.example", screen: { file: "screen.png", w: 2880, h: 1800 }, shots: [] });
    assert.match(hero.html, /class="st-win"/, look);
    assert.match(hero.html, /<span class="mk">think<\/span>/, look);
    assert.match(hero.html, /acme-notes\.example/, look);
    assert.ok(!/undefined|NaN/.test(hero.html), `${look}: undefined or NaN in the hero`);
    const bare = motion.stillHtml({ kind: "hero", look, W: 1920, H: 768, brand: {}, fonts, mark: null, name: "Acme Notes", title: "Notes", site: "acme-notes.example", words: false,
      screen: null, shots: [{ file: "shot-0.png", w: 1290, h: 2796 }] });
    assert.ok(!/class="[^"]*st-(title|site)|acme-notes\.example/.test(bare.html), `${look}: the words are left out`);
    assert.match(bare.html, /class="st-shot"/, look);
    const tile = motion.stillHtml({ kind: "tile", look, W: 1920, H: 1222, brand: {}, fonts, mark: { file: "icon.png", w: 360, h: 360, icon: true, ground: "#5B4FE9" }, name: "Acme Notes", title: "x", site: "y" });
    assert.match(tile.html, /st-mark icon/, look);
    assert.ok(!/class="[^"]*st-(title|site)/.test(tile.html), `${look}: a tile has no words`);
  }
});

test("stills come out at their exact sizes from a film's plan", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-stills-"));
  fs.cpSync(fixture, path.join(dir, "brand"), { recursive: true });
  const brand = readBrand(path.join(dir, "brand", "brand.json"));
  const words = JSON.parse(fs.readFileSync(path.join(fixture, "words.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "film.json"), JSON.stringify(planFilm(brand, words, { filmDir: dir })));
  const r = await makeStills(path.join(dir, "film.json"));
  const names = r.files.map((f) => f.name);
  assert.deepEqual(names.filter((n) => !/^ph-[2-9]/.test(n)), ["ph-1.png", "ph-thumbnail.png", "og.png", "x.png", "play-feature.png", "chrome-small.png", "chrome-marquee.png"]);
  const gallery = names.filter((n) => /^ph-\d/.test(n)).length;
  assert.ok(gallery >= 3 && gallery <= 6, `${gallery} gallery pictures`);
  for (const f of r.files) {
    const info = probe(f.file);
    assert.deepEqual([info.width, info.height], [f.W, f.H], f.name);
    assert.equal(info.pixFmt, "rgb24", `${f.name} is opaque`);
  }
  // The hero is a picture, not a blank.
  const px = readPixels(path.join(r.dir, "og.png"), 320);
  const lum = [];
  for (let i = 0; i < px.data.length; i += 4) lum.push(px.data[i] + px.data[i + 1] + px.data[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  assert.ok(Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length) > 20, "og.png has something on it");
  const md = fs.readFileSync(path.join(r.dir, "STILLS.md"), "utf8");
  assert.match(md, /\| og\.png \| 1200x630 \| og:image/);
  assert.ok(!/[\u2013\u2014]/.test(md), "STILLS.md has no dashes");
  assert.ok(!fs.readdirSync(r.dir).some((n) => n.startsWith(".work")), "the work files are gone");
});
