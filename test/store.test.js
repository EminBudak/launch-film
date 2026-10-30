"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { appStoreId, isStoreUrl, wordsFromListing } = require("../src/store");
const { copyFrom } = require("../src/plan");
const motion = require("../src/motion");

test("App Store addresses are told apart from sites", () => {
  assert.deepEqual(appStoreId("https://apps.apple.com/gb/app/some-app/id123456789"), { id: "123456789", country: "gb" });
  assert.deepEqual(appStoreId("https://apps.apple.com/app/id123456789"), { id: "123456789", country: "us" });
  assert.equal(appStoreId("https://apps.apple.com/"), null);
  assert.equal(appStoreId("https://example.com/id123456789"), null);
  assert.ok(isStoreUrl("https://play.google.com/store/apps/details?id=com.example"));
  assert.ok(!isStoreUrl("https://example.com"));
});

const LISTING = {
  name: "Acme Notes",
  description: [
    "Get it all down! Acme Notes keeps your notes, meetings and tasks in one calm place.",
    "",
    "\u201cThe best notes app we tried.\u201d",
    "",
    "KEY FEATURES",
    "\u2022 Your Notes",
    "Write in plain text and find anything later, even offline.",
    "\u2022 Reminders \u2014 set a time and Acme will remind you.",
    "\u2022 Tags: sort notes your own way.",
  ].join("\n"),
};

test("a listing's description gives the words and the feature lines", () => {
  const w = wordsFromListing(LISTING);
  assert.equal(w.title, "Acme Notes");
  assert.deepEqual(w.headings.map((h) => h.text), ["Your Notes", "Reminders", "Tags"]);
  assert.equal(w.headings[0].after, "Write in plain text and find anything later, even offline.");
  assert.equal(w.headings[1].after, "set a time and Acme will remind you.");
  assert.ok(!w.paragraphs.some((p) => p.startsWith("\u201c")), "press quotes are left out");
});

test("an app's film copy comes from its listing", () => {
  const brand = { name: "Acme Notes", host: "", profiles: [], text: null, description: "" };
  const copy = copyFrom(brand, wordsFromListing(LISTING));
  assert.equal(copy.promise, "Get it all down!");
  assert.equal(copy.statement, "Acme Notes keeps your notes, meetings and tasks in one calm place");
  assert.deepEqual(copy.features.map((f) => f.title), ["Your Notes", "Reminders", "Tags"]);
});

test("store screenshots are drawn side by side in every look", () => {
  for (const look of Object.keys(motion.LOOKS)) {
    for (const port of [false, true]) {
      const page = motion.galleryHtml({ look, port, seconds: 4, accent: "#3366FF", images: [1, 2, 3].map((i) => ({ file: `shot-${i}.jpg`, w: 1290, h: 2796 })) });
      assert.equal((page.html.match(/class="shot"/g) || []).length, 3, `${look} ${port}`);
      assert.ok(page.cues.length >= 4);
    }
  }
});
