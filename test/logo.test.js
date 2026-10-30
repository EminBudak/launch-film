"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { prepareLogo, prepareIcon } = require("../src/logo");
const { available, readPixels, mustRun } = require("../src/ffmpeg");

const fixture = path.join(__dirname, "fixtures", "acme");
const noFfmpeg = !available();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "launch-film-test-"));

test("a header logo is cut out and keyed off its ground", { skip: noFfmpeg && "ffmpeg not found" }, async () => {
  const out = path.join(tmp(), "mark.png");
  const mark = await prepareLogo(path.join(fixture, "logo-header.png"), out);
  assert.equal(mark.ground, "#FFFFFF");
  // The mark itself is at most 42% of the frame's width; its keyed margin
  // comes on top.
  assert.ok(mark.w > 300 && mark.w <= 0.6 * 1920, `width ${mark.w}`);
  const px = readPixels(out);
  // The corners are clear; the purple square of the mark is solid.
  assert.equal(px.data[3], 0);
  let solid = 0;
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] === 255) solid++;
  assert.ok(solid > 0.1 * px.width * px.height, "the mark is solid");
});

test("a logo cut off at an edge is refused", { skip: noFfmpeg && "ffmpeg not found" }, async () => {
  const dir = tmp();
  const cut = path.join(dir, "cut.png");
  // Cuts through the middle of the square mark, a margin of ground on the left.
  await mustRun(["-i", path.join(fixture, "logo-header.png"), "-vf", "crop=100:240:0:0", cut], "cropping");
  await assert.rejects(prepareLogo(cut, path.join(dir, "m.png")), /runs off the right edge/);
});

test("a page screenshot is not taken for a logo", { skip: noFfmpeg && "ffmpeg not found" }, async () => {
  const dir = tmp();
  await assert.rejects(prepareLogo(path.join(fixture, "screenshot-1.png"), path.join(dir, "m.png")), /not a logo|too small/);
});

test("an app icon is kept whole", { skip: noFfmpeg && "ffmpeg not found" }, async () => {
  const icon = await prepareIcon(path.join(fixture, "app-icon.png"), path.join(tmp(), "icon.png"));
  assert.equal(icon.icon, true);
  assert.equal(icon.ground, "#5B4FE9");
});
