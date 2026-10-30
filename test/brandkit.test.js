"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { brandkitCommand, runBrandkit } = require("../src/brand");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));

test("the brandkit to run: a script path, a command, else its repository through npx", () => {
  const dir = tmp();
  const script = path.join(dir, "brandkit.js");
  fs.writeFileSync(script, "");
  assert.deepEqual(brandkitCommand(script), [process.execPath, script]);
  assert.deepEqual(brandkitCommand("my-brandkit --flag"), ["my-brandkit", "--flag"]);
  const saved = [process.env.LAUNCH_FILM_BRANDKIT, process.env.PATH];
  try {
    delete process.env.LAUNCH_FILM_BRANDKIT;
    process.env.PATH = dir;
    assert.deepEqual(brandkitCommand(), [process.platform === "win32" ? "npx.cmd" : "npx", "-y", "github:EminBudak/brandkit"]);
  } finally {
    if (saved[0] === undefined) delete process.env.LAUNCH_FILM_BRANDKIT;
    else process.env.LAUNCH_FILM_BRANDKIT = saved[0];
    process.env.PATH = saved[1];
  }
});

test("a bot check says what to do instead", async () => {
  const dir = tmp();
  const fake = path.join(dir, "brandkit.js");
  fs.writeFileSync(fake, 'process.stderr.write("https://example.com answered with a bot check, so no kit was saved.\\n"); process.exit(1);');
  await assert.rejects(runBrandkit("https://example.com", path.join(dir, "out"), { command: fake }), /bot check.*ask for the logo file and the main colors/);
});

test("a brandkit that writes brand.json resolves its path", async () => {
  const dir = tmp();
  const fake = path.join(dir, "brandkit.js");
  fs.writeFileSync(fake, 'const fs = require("fs"); const out = process.argv[process.argv.indexOf("--out") + 1]; fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(out + "/brand.json", "{}");');
  assert.equal(await runBrandkit("https://example.com", path.join(dir, "out"), { command: fake }), path.join(dir, "out", "brand.json"));
});
