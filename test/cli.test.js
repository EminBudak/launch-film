"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const cli = (...args) => spawnSync(process.execPath, [path.join(root, "bin", "launch-film.js"), ...args], { encoding: "utf8", timeout: 30_000 });

test("help, looks and types", () => {
  const help = cli("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:\n {2}launch-film <url> \[options\]/);
  const looks = cli("looks").stdout.trim().split("\n");
  assert.deepEqual(looks.map((l) => l.split(" ")[0]), ["launch", "aurora", "gridline", "pop", "journal"]);
  assert.match(cli("types").stdout, /^features /m);
  assert.match(cli("icons", "rocket").stdout, /rocket-launch/);
});

test("a bad address is refused plainly", () => {
  const r = cli("not a url");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not a command or an address/);
});

// The words people read: the README, the skill, the CLI's help and the
// look descriptions. No dashes as punctuation and none of the stock words.
test("public text has no em or en dashes and no hype words", () => {
  const texts = {
    "README.md": fs.readFileSync(path.join(root, "README.md"), "utf8"),
    "SKILL.md": fs.readFileSync(path.join(root, "skills", "launch-film", "SKILL.md"), "utf8"),
    "THIRD_PARTY.md": fs.readFileSync(path.join(root, "THIRD_PARTY.md"), "utf8"),
    help: cli("--help").stdout,
    looks: cli("looks").stdout,
    types: cli("types").stdout,
    "bin/launch-film.js": fs.readFileSync(path.join(root, "bin", "launch-film.js"), "utf8"),
  };
  const banned = /\b(delve|unleash|seamless(ly)?|cutting-edge|game-?changer|elevate|empower|robust|harness|revolutioni[sz]e|supercharge|effortless(ly)?|stunning|magic(al)?|blazing|world-class|next-gen)\b/i;
  for (const [name, text] of Object.entries(texts)) {
    assert.ok(!/[\u2013\u2014]/.test(text), `${name} has a dash: ${(/.{0,40}[\u2013\u2014].{0,40}/.exec(text) || [""])[0]}`);
    const hit = banned.exec(text);
    assert.ok(!hit, `${name} uses "${hit && hit[0]}"`);
  }
});
