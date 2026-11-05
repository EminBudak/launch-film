"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { version } = JSON.parse(read("package.json"));

// The skill runs the CLI release it was written for, so the commands it
// describes are the ones that run. A release bumps it with package.json.
test("the skill runs the release in package.json", () => {
  const pinned = [...read("skills/launch-film/SKILL.md").matchAll(/launch-film@([\w.-]*\w)/g)].map((m) => m[1]);
  assert.ok(pinned.length > 0);
  assert.deepEqual([...new Set(pinned)], [version]);
});

test("the plugin manifests carry the same version", () => {
  for (const file of [".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", "plugin.json"]) {
    const manifest = JSON.parse(read(file));
    assert.equal((manifest.plugins ? manifest.plugins[0] : manifest).version, version, file);
  }
});
