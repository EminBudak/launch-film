"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { readBrand, pickLook } = require("../src/brand");
const { planFilm, copyFrom, markEnd, findNumber, withoutName, fit } = require("../src/plan");
const { loadFilm } = require("../src/film");
const { MOODS } = require("../src/audio");

const fixture = path.join(__dirname, "fixtures", "acme");
const words = JSON.parse(fs.readFileSync(path.join(fixture, "words.json"), "utf8"));

test("brand.json is read with absolute paths and its colours sorted out", () => {
  const brand = readBrand(path.join(fixture, "brand.json"));
  assert.equal(brand.name, "Acme Notes");
  assert.equal(brand.host, "acme-notes.example");
  assert.equal(brand.accent, "#5B4FE9");
  assert.equal(brand.darkSite, false);
  assert.equal(brand.headingFont, "Inter");
  assert.ok(path.isAbsolute(brand.logos[0].file) && fs.existsSync(brand.logos[0].file));
  assert.equal(brand.phoneScreens.length, 1);
  assert.ok(brand.appIcon);
});

test("the copy comes from the page's own words", () => {
  const brand = readBrand(path.join(fixture, "brand.json"));
  const copy = copyFrom(brand, words);
  assert.equal(copy.name, "Acme Notes");
  assert.equal(copy.promise, "Notes that think with you");
  assert.equal(copy.statement, "Write once and find it anywhere");
  assert.deepEqual(copy.features.map((f) => f.title), ["Instant search", "Private by design", "Shared spaces"]);
  assert.deepEqual(copy.features.map((f) => f.icon), ["lightning", "shield-check", "users-three"]);
  assert.deepEqual(copy.stat, { value: "12,000+", text: "teams worldwide" });
});

test("the plan is whole bars of the look's music and 20-40 s long", () => {
  const brand = readBrand(path.join(fixture, "brand.json"));
  for (const look of ["launch", "aurora", "gridline", "pop", "journal"]) {
    const film = planFilm(brand, words, { look, filmDir: fixture });
    const bar = 240 / MOODS[look].bpm;
    const seconds = film.clips.reduce((s, c) => s + c.bars * bar, 0);
    assert.ok(seconds >= 20 && seconds <= 42, `${look}: ${seconds}`);
    assert.equal(film.clips[0].scene.type, "opener");
    assert.equal(film.clips[film.clips.length - 1].kind, "logo");
    assert.ok(film.clips.some((c) => c.kind === "screen"));
  }
});

test("a planned film.json loads without problems", () => {
  const brand = readBrand(path.join(fixture, "brand.json"));
  const film = planFilm(brand, words, { filmDir: fixture });
  const file = path.join(fixture, ".film-test.json");
  fs.writeFileSync(file, JSON.stringify(film));
  try {
    const loaded = loadFilm(file);
    assert.deepEqual(loaded.problems, []);
    assert.equal(loaded.clips.length, film.clips.length);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("a broken film.json says what is wrong", () => {
  const file = path.join(fixture, ".film-bad.json");
  fs.writeFileSync(file, JSON.stringify({ look: "neon", clips: [{ kind: "scene", scene: { type: "headline" } }, { kind: "screen", image: "nope.png" }] }));
  try {
    const { problems } = loadFilm(file);
    assert.match(problems.join("\n"), /"look" must be one of/);
    assert.match(problems.join("\n"), /clips\[1\]\.image "nope.png" is not a file/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("the look follows the brand", () => {
  const base = { headingFont: "Inter", bodyFont: "Inter", stores: [], accent: "#3366FF", darkSite: false };
  assert.equal(pickLook({ ...base, darkSite: true }), "launch");
  assert.equal(pickLook({ ...base, darkSite: true, accent: "#8B5CF6" }), "aurora");
  assert.equal(pickLook({ ...base, headingFont: "Playfair Display" }), "journal");
  assert.equal(pickLook({ ...base, stores: [{}], accent: "#FF4F7B" }), "pop");
  assert.equal(pickLook(base), "gridline");
});

test("text helpers", () => {
  assert.equal(markEnd("Ship software faster."), "Ship *software faster*.");
  assert.equal(markEnd("Notes that think with you"), "Notes that *think* with you");
  assert.equal(withoutName("Acme Notes | Notes that think with you", "Acme Notes"), "Notes that think with you");
  assert.equal(fit("one two three four", 9), "one two");
  assert.equal(findNumber(["Founded in 2015", "Loved by 2M+ creators every day"]).value, "2M+");
  assert.equal(findNumber(["We have 3 offices"]), null);
});

test("brandkit's headings come first, with the page's line under each", () => {
  const { copyFrom: copy } = require("../src/plan");
  const brand = { name: "Linear", host: "linear.app", profiles: [], description: "",
    text: { title: "", description: "", headings: [{ level: 1, text: "Plan and build" }, { level: 2, text: "Intake and integrations" }, { level: 2, text: "Planning and monitoring" }] } };
  const read = { headings: [{ level: 3, text: "Faster app launch", after: "Render UI before vehicle_state sync." },
    { level: 2, text: "Intake and integrations", after: "Turn feedback into issues." }, { level: 2, text: "Planning and monitoring", after: "Plan from idea to launch." }] };
  const c = copy(brand, read);
  assert.deepEqual(c.features.map((f) => [f.title, f.text]), [["Intake and integrations", "Turn feedback into issues"], ["Planning and monitoring", "Plan from idea to launch"]]);
});
