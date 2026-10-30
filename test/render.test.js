"use strict";
// Renders in Chrome and encodes with ffmpeg: skipped when either is missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, launch, openPage, evaluate } = require("../src/chrome");
const { available, probe, readPixels, mustRun } = require("../src/ffmpeg");
const { renderFilm } = require("../src/film");

const skip = !findChrome() ? "Chrome not found" : !available() ? "ffmpeg not found" : false;
const fixture = path.join(__dirname, "fixtures", "acme");
const TIMELINE = fs.readFileSync(path.join(__dirname, "..", "src", "runtime", "timeline.js"), "utf8");

async function withPage(body, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><script>${TIMELINE}</script></head><body>${body}</body></html>`);
  const browser = await launch({ W: 800, H: 600 });
  try {
    const { page } = await openPage(browser, dir, { W: 800, H: 600 });
    return await fn((expr) => evaluate(page, expr));
  } finally {
    browser.close();
  }
}

test("the timeline seeks tweens to a time", { skip }, async () => {
  await withPage(`<div id="a" style="width:100px;height:20px"></div><div id="b"></div><span id="c">0</span>
    <p id="t" style="font-size:40px;width:600px">Notes that think</p>`, async (js) => {
    await js(`window.tl = gsap.timeline({ paused: true });
      tl.from("#a", { y: 100, opacity: 0, duration: 1, ease: "none" }, 0.5);
      tl.fromTo("#b", { x: 0 }, { x: 200, duration: 1, ease: "none" }, 1);
      tl.to("#b", { x: "+=50", duration: 1, ease: "none" }, 2);
      const o = { v: 0 };
      tl.to(o, { v: 100, duration: 1, ease: "none", onUpdate() { document.getElementById("c").textContent = Math.round(o.v); } }, 0);
      window.split = new SplitText("#t", { type: "words", mask: "words" });
      tl.from(split.words, { yPercent: 100, duration: 0.5, stagger: 0.25, ease: "none" }, 0);
      true`);
    const at = (s) => js(`tl.seek(${s}); [getComputedStyle(a).opacity, a.style.transform, b.style.transform, c.textContent, split.words.map((w) => w.style.transform)]`);
    let [op, ta, tb, count, words] = await at(0);
    assert.equal(op, "0");
    assert.equal(ta, "translate(0px, 100px)");
    assert.equal(tb, "none");
    assert.equal(count, "0");
    assert.equal(words.length, 3);
    assert.equal(words[2], "translate(0%, 100%)");
    [op, ta, tb, count, words] = await at(1);
    assert.equal(op, "0.5");
    assert.equal(ta, "translate(0px, 50px)");
    assert.equal(count, "100");
    assert.equal(words[0], "none");
    [op, ta, tb] = await at(1.5);
    assert.equal(tb, "translate(100px, 0px)");
    // The relative tween starts where the fromTo ended.
    [op, ta, tb] = await at(2.5);
    assert.equal(tb, "translate(225px, 0px)");
    [op, ta, tb] = await at(4);
    assert.equal(op, "1");
    assert.equal(ta, "none");
    assert.equal(tb, "translate(250px, 0px)");
    // Words sit in masks that clip them.
    assert.equal(await js(`getComputedStyle(split.words[0].parentElement).overflow`), "clip");
  });
});

test("eases, yoyo and an inline transform the element already has", { skip }, async () => {
  await withPage(`<div id="n" style="transform:rotate(-90deg)"></div><div id="y"></div><div id="k" style="transform:translateX(-50%)"></div>`, async (js) => {
    await js(`window.tl = gsap.timeline({ paused: true });
      tl.to("#n", { rotation: 0, duration: 1, ease: "power2.out" }, 0);
      tl.to("#y", { y: -10, duration: 1, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0);
      tl.from("#k", { y: 40, duration: 1 }, 0); true`);
    const at = (s) => js(`tl.seek(${s}); [n.style.transform, y.style.transform, k.style.transform]`);
    let [n, y, k] = await at(0.5);
    assert.equal(n, "rotate(-11.25deg)");
    assert.equal(y, "translate(0px, -5px)");
    assert.match(k, /^translate\(-50%, 0%\) translate\(0px, /);
    [n, y, k] = await at(1.5);
    assert.equal(n, "none");
    assert.equal(y, "translate(0px, -5px)");
    [n, y, k] = await at(10);
    assert.equal(y, "none");
    assert.equal(k, "translate(-50%, 0%)");
    const eases = await js(`["expo.out", "back.out(1.7)", "power3.inOut", "none", "steps(4)"].map((e) => +gsap.parseEase(e)(0.5).toFixed(4))`);
    assert.deepEqual(eases, [0.9688, 1.0875, 0.5, 0.5, 0.5]);
  });
});

test("a short film renders with picture and sound", { skip, timeout: 240_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));
  fs.cpSync(fixture, path.join(dir, "brand"), { recursive: true });
  const film = {
    version: 1, brand: "brand/brand.json", look: "launch", aspect: "16:9", music: true, sfx: true,
    clips: [
      { kind: "scene", seconds: 2.5, scene: { type: "opener", title: "Acme Notes", text: "Notes that think with you" } },
      { kind: "logo", seconds: 2.5, logo: "brand/logo-header.png", site: "acme-notes.example" },
    ],
  };
  fs.writeFileSync(path.join(dir, "film.json"), JSON.stringify(film));
  const result = await renderFilm(path.join(dir, "film.json"), { jobs: 2 });
  const info = probe(result.output);
  assert.equal(info.width, 1920);
  assert.equal(info.height, 1080);
  assert.ok(info.audio, "the film has sound");
  assert.ok(Math.abs(info.duration - 5) < 0.15, `duration ${info.duration}`);
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, "film.timeline.json"), "utf8"));
  assert.deepEqual(timeline.clips.map((c) => c.start), [0, 2.5]);
  // A still from each clip is a picture, not a blank frame.
  for (const at of [1.6, 4.2]) {
    const still = path.join(dir, `still-${at}.png`);
    await mustRun(["-ss", String(at), "-i", result.output, "-frames:v", "1", still], "a still");
    const px = readPixels(still, 320);
    const lum = [];
    for (let i = 0; i < px.data.length; i += 4) lum.push(px.data[i] + px.data[i + 1] + px.data[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const spread = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    assert.ok(spread > 20, `the still at ${at} s has something on it (spread ${spread.toFixed(1)})`);
  }
});
