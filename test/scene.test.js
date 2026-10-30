"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScene, iconSvg, iconSearch, catalog } = require("../src/scene");
const motion = require("../src/motion");
const TYPES = require("../src/types");

test("a scene with its fields passes and keeps its words", () => {
  const { scene, problems } = parseScene({ type: "headline", title: "Ship *faster* with Acme" }, { look: "launch" });
  assert.deepEqual(problems, []);
  assert.equal(scene.type, "headline");
  assert.equal(scene.title, "Ship *faster* with Acme");
  assert.equal(scene.style, "launch");
});

test("missing and too long fields are named", () => {
  assert.match(parseScene({ type: "headline" }).problems.join(), /"title" is missing/);
  assert.match(parseScene({ type: "opener", title: "x".repeat(61) }).problems.join(), /longer than 60/);
  assert.match(parseScene({ type: "nope" }).problems.join(), /"type" must be one of/);
  assert.match(parseScene({ type: "features", items: [{ title: "One" }] }).problems.join(), /takes 2-6 "items"/);
});

test("an unknown icon is refused with names near it", () => {
  const { problems } = parseScene({ type: "spotlight", icon: "lightningg", title: "Fast" });
  assert.match(problems.join(), /is not an icon \(near: .*lightning/);
});

test("the icons are Phosphor's fill and bold drawings", () => {
  assert.match(iconSvg("rocket-launch"), /^<svg class="ic" viewBox="0 0 256 256"/);
  assert.notEqual(iconSvg("globe-simple", "bold"), iconSvg("globe-simple", "fill"));
  assert.equal(iconSvg("no-such-icon"), "");
  assert.ok(iconSearch("chart").includes("chart-line-up"));
});

test("every type in the catalogue has a drawing", () => {
  for (const t of catalog()) assert.equal(typeof TYPES[t.type], "function", t.type);
});

test("every look draws every type without throwing", () => {
  const samples = {
    opener: { title: "Acme Notes", text: "Notes that think with you" },
    headline: { title: "Write once, find it *anywhere*" },
    features: { items: [{ icon: "lightning", title: "Fast", text: "Quick" }, { icon: "lock-key", title: "Private", text: "Yours" }] },
    number: { value: "12,000+", text: "teams" },
    numbers: { items: [{ value: "99.9%", label: "uptime" }, { value: "4.8", label: "rating" }] },
    steps: { items: ["Sign up", "Write", "Share"] },
    quote: { text: "It changed how we plan.", source: "A customer" },
    bigword: { title: "Acme" },
  };
  for (const look of Object.keys(motion.LOOKS)) {
    for (const [type, fields] of Object.entries(samples)) {
      const { scene, problems } = parseScene({ type, ...fields }, { look });
      assert.deepEqual(problems, [], `${look} ${type}`);
      const page = motion.sceneHtml(scene, { fonts: { css: "", head: "P", body: "P", label: "P", weight: {} }, seconds: 4, icon: iconSvg });
      assert.ok(page && page.html.includes("window.__V2="), `${look} ${type}`);
      assert.ok(page.html.includes("window.gsap = gsapLike"), "the timeline is inlined");
      assert.ok(!/<script src=/.test(page.html), "the page loads no script from the network");
      for (const cue of page.cues) assert.ok(cue.at >= 0 && cue.volume > 0, `${look} ${type} cue`);
    }
  }
});

test("the words on screen are the scene's, escaped", () => {
  const { scene } = parseScene({ type: "headline", title: "Fast <b>& safe</b>" }, { look: "gridline" });
  const page = motion.sceneHtml(scene, { fonts: { css: "", head: "P", body: "P", label: "P", weight: {} }, seconds: 4, icon: iconSvg });
  assert.ok(page.html.includes("Fast &lt;b&gt;&amp; safe&lt;/b&gt;"));
});
