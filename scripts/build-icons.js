#!/usr/bin/env node
"use strict";
// Builds assets/phosphor.json.gz from the Phosphor Icons package
// (@phosphor-icons/core, MIT): every icon's fill and bold drawing, without
// its outer <svg>, on Phosphor's 256 grid.
//
//   npm pack @phosphor-icons/core && tar -xzf phosphor-icons-core-*.tgz
//   node scripts/build-icons.js package

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/build-icons.js <unpacked @phosphor-icons/core folder>");
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8").trim();
const icons = {};
for (const weight of ["fill", "bold"]) {
  const dir = path.join(root, "assets", weight);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()) {
    const name = file.replace(/\.svg$/, "").replace(new RegExp(`-${weight}$`), "");
    const svg = fs.readFileSync(path.join(dir, file), "utf8");
    const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg);
    if (!body) continue;
    (icons[name] = icons[name] || {})[weight] = body[1].trim();
  }
}
const out = { source: `${pkg.name}@${pkg.version}`, license, size: 256, icons };
const file = path.join(__dirname, "..", "assets", "phosphor.json.gz");
fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
console.log(`${Object.keys(icons).length} icons from ${out.source} written to ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
