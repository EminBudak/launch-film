"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { easybrandkitCommands, runEasybrandkit } = require("../src/brand");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));

// Runs fn with PATH set to dir alone and LAUNCH_FILM_EASYBRANDKIT unset.
async function withPath(dir, fn) {
  const saved = [process.env.LAUNCH_FILM_EASYBRANDKIT, process.env.PATH];
  delete process.env.LAUNCH_FILM_EASYBRANDKIT;
  process.env.PATH = dir;
  try {
    return await fn();
  } finally {
    if (saved[0] === undefined) delete process.env.LAUNCH_FILM_EASYBRANDKIT;
    else process.env.LAUNCH_FILM_EASYBRANDKIT = saved[0];
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

const NOT_ON_NPM = 'echo "npm error code E404" >&2; echo "npm error 404 Not Found - GET https://registry.npmjs.org/easybrandkit - Not found" >&2; exit 1';
const WRITES_KIT = '/bin/mkdir -p "$5" && echo "{}" > "$5/brand.json"';
const CANNOT_OPEN = 'echo "Opening $3..."; echo "easybrandkit: Could not open $3: net::ERR_NAME_NOT_RESOLVED" >&2; exit 1';
const noShell = process.platform === "win32" && "the stand-in npx is a shell script";

test("the easybrandkit to run: a script path, a command, one on PATH, else npm and then GitHub through npx", async () => {
  const dir = tmp();
  const script = path.join(dir, "easybrandkit.js");
  fs.writeFileSync(script, "");
  assert.deepEqual(easybrandkitCommands(script), [[process.execPath, script]]);
  assert.deepEqual(easybrandkitCommands("my-easybrandkit --flag"), [["my-easybrandkit", "--flag"]]);
  await withPath(dir, () => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    assert.deepEqual(easybrandkitCommands(), [[npx, "-y", "easybrandkit"], [npx, "-y", "github:EminBudak/easybrandkit"]]);
    const installed = path.join(dir, process.platform === "win32" ? "easybrandkit.cmd" : "easybrandkit");
    fs.writeFileSync(installed, "", { mode: 0o755 });
    assert.deepEqual(easybrandkitCommands(), [[installed]]);
  });
});

test("when npx cannot fetch easybrandkit from npm, it is fetched from GitHub", { skip: noShell }, async () => {
  await withFakeNpx({ "easybrandkit": NOT_ON_NPM, "github:EminBudak/easybrandkit": WRITES_KIT }, async (dir, asked) => {
    assert.equal(await runEasybrandkit("https://example.com", path.join(dir, "out")), path.join(dir, "out", "brand.json"));
    assert.deepEqual(asked(), ["easybrandkit", "github:EminBudak/easybrandkit"]);
  });
  await withFakeNpx({ "easybrandkit": NOT_ON_NPM, "github:EminBudak/easybrandkit": NOT_ON_NPM }, async (dir) => {
    await assert.rejects(runEasybrandkit("https://example.com", path.join(dir, "out")), /could not be fetched \(npm error code E404\)\. Install easybrandkit \(npm install -g easybrandkit\)/);
  });
});

test("an easybrandkit that ran and failed is not run again", { skip: noShell }, async () => {
  await withFakeNpx({ "easybrandkit": CANNOT_OPEN, "github:EminBudak/easybrandkit": WRITES_KIT }, async (dir, asked) => {
    await assert.rejects(runEasybrandkit("https://example.com", path.join(dir, "out")), /easybrandkit failed \(exit 1\).*Could not open https:\/\/example\.com/);
    assert.deepEqual(asked(), ["easybrandkit"]);
  });
});

test("a bot check says what to do instead", async () => {
  const dir = tmp();
  const fake = path.join(dir, "easybrandkit.js");
  fs.writeFileSync(fake, 'process.stderr.write("https://example.com answered with a bot check, so no kit was saved.\\n"); process.exit(1);');
  await assert.rejects(runEasybrandkit("https://example.com", path.join(dir, "out"), { command: fake }), /bot check.*ask for the logo file and the main colors/);
});

test("an easybrandkit that writes brand.json resolves its path", async () => {
  const dir = tmp();
  const fake = path.join(dir, "easybrandkit.js");
  fs.writeFileSync(fake, 'const fs = require("fs"); const out = process.argv[process.argv.indexOf("--out") + 1]; fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(out + "/brand.json", "{}");');
  assert.equal(await runEasybrandkit("https://example.com", path.join(dir, "out"), { command: fake }), path.join(dir, "out", "brand.json"));
});
