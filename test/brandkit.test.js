"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { brandkitCommands, runBrandkit } = require("../src/brand");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));

// Runs fn with PATH set to dir alone and LAUNCH_FILM_BRANDKIT unset.
async function withPath(dir, fn) {
  const saved = [process.env.LAUNCH_FILM_BRANDKIT, process.env.PATH];
  delete process.env.LAUNCH_FILM_BRANDKIT;
  process.env.PATH = dir;
  try {
    return await fn();
  } finally {
    if (saved[0] === undefined) delete process.env.LAUNCH_FILM_BRANDKIT;
    else process.env.LAUNCH_FILM_BRANDKIT = saved[0];
    process.env.PATH = saved[1];
  }
}

// A stand-in for npx: it notes each package it is asked for in npx.log and
// runs the shell line given for that package ($3 is the URL, $5 the folder).
async function withFakeNpx(cases, fn) {
  const dir = tmp();
  const npx = path.join(dir, "npx");
  const lines = Object.entries(cases).map(([spec, line]) => `  "${spec}") ${line} ;;`);
  fs.writeFileSync(npx, ["#!/bin/sh", 'echo "$2" >> "$0.log"', 'case "$2" in', ...lines, "esac", ""].join("\n"), { mode: 0o755 });
  await withPath(dir, () => fn(dir, () => fs.readFileSync(`${npx}.log`, "utf8").trim().split("\n")));
}

const NOT_ON_NPM = 'echo "npm error code E404" >&2; echo "npm error 404 Not Found - GET https://registry.npmjs.org/@eminbudak%2fbrandkit - Not found" >&2; exit 1';
const WRITES_KIT = '/bin/mkdir -p "$5" && echo "{}" > "$5/brand.json"';
const CANNOT_OPEN = 'echo "Opening $3..."; echo "brandkit: Could not open $3: net::ERR_NAME_NOT_RESOLVED" >&2; exit 1';
const noShell = process.platform === "win32" && "the stand-in npx is a shell script";

test("the brandkit to run: a script path, a command, one on PATH, else npm and then GitHub through npx", async () => {
  const dir = tmp();
  const script = path.join(dir, "brandkit.js");
  fs.writeFileSync(script, "");
  assert.deepEqual(brandkitCommands(script), [[process.execPath, script]]);
  assert.deepEqual(brandkitCommands("my-brandkit --flag"), [["my-brandkit", "--flag"]]);
  await withPath(dir, () => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    assert.deepEqual(brandkitCommands(), [[npx, "-y", "@eminbudak/brandkit"], [npx, "-y", "github:EminBudak/brandkit"]]);
    const installed = path.join(dir, process.platform === "win32" ? "brandkit.cmd" : "brandkit");
    fs.writeFileSync(installed, "", { mode: 0o755 });
    assert.deepEqual(brandkitCommands(), [[installed]]);
  });
});

test("when npx cannot fetch brandkit from npm, it is fetched from GitHub", { skip: noShell }, async () => {
  await withFakeNpx({ "@eminbudak/brandkit": NOT_ON_NPM, "github:EminBudak/brandkit": WRITES_KIT }, async (dir, asked) => {
    assert.equal(await runBrandkit("https://example.com", path.join(dir, "out")), path.join(dir, "out", "brand.json"));
    assert.deepEqual(asked(), ["@eminbudak/brandkit", "github:EminBudak/brandkit"]);
  });
  await withFakeNpx({ "@eminbudak/brandkit": NOT_ON_NPM, "github:EminBudak/brandkit": NOT_ON_NPM }, async (dir) => {
    await assert.rejects(runBrandkit("https://example.com", path.join(dir, "out")), /could not be fetched \(npm error code E404\)\. Install brandkit \(npm install -g @eminbudak\/brandkit\)/);
  });
});

test("a brandkit that ran and failed is not run again", { skip: noShell }, async () => {
  await withFakeNpx({ "@eminbudak/brandkit": CANNOT_OPEN, "github:EminBudak/brandkit": WRITES_KIT }, async (dir, asked) => {
    await assert.rejects(runBrandkit("https://example.com", path.join(dir, "out")), /brandkit failed \(exit 1\).*Could not open https:\/\/example\.com/);
    assert.deepEqual(asked(), ["@eminbudak/brandkit"]);
  });
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
