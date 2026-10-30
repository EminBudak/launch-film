#!/usr/bin/env node
"use strict";
// launch-film: a launch film from a website or an App Store page.

const fs = require("fs");
const path = require("path");

const HELP = `launch-film: a 20-40 second launch film made from a product's own site.

Usage:
  launch-film <url> [options]          Read the brand, plan the film, render it.
  launch-film plan <url> [options]     Read the brand and write film.json only.
  launch-film render <film.json>       Render a film.json (after editing it).
  launch-film frames <film.mp4>        Save stills of each clip and a contact sheet.
  launch-film looks                    List the looks.
  launch-film types                    List the scene types and their fields.
  launch-film icons <word>             Find icon names for a scene.
  launch-film doctor                   Check that Chrome and ffmpeg are found.

Options:
  --out <dir>          Folder for the brand, film.json and the film
                       (default: ./launch-film-<site>).
  --brand <path>       Use a brandkit folder or brand.json you already have.
  --words <file>       Use a words.json you already have instead of reading
                       the page again.
  --brandkit <cmd>     The brandkit to run: a command, or the path of its
                       scripts/brandkit.js (default: LAUNCH_FILM_BRANDKIT, a
                       brandkit on PATH, else @eminbudak/brandkit with npx).
                       Install it with npm install -g @eminbudak/brandkit.
  --look <name>        launch, aurora, gridline, pop or journal (default: picked
                       from the brand).
  --seconds <n>        Aim for this length, 20-40 (default 30).
  --aspect <ratio>     16:9 (default) or 9:16.
  --jobs <n>           Clips rendered at once (default 2).
  --no-music           Leave out the music bed.
  --no-sfx             Leave out the sound effects.
  --keep               Keep the work files (each clip's MP4).

Everything renders on this machine with Chrome and ffmpeg. No account or key.
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.flags.help = true;
    else if (a === "--version" || a === "-v") out.flags.version = true;
    else if (/^--no-/.test(a)) out.flags[a.slice(5)] = false;
    else if (a === "--keep") out.flags.keep = true;
    else if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split("=");
      out.flags[key] = inline !== undefined ? inline : argv[++i];
    } else out._.push(a);
  }
  return out;
}

const say = (text) => process.stderr.write(text);
function fail(message) {
  say(`launch-film: ${message}\n`);
  process.exit(1);
}

function normaliseUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return /^[a-z0-9.-]+$/i.test(u.hostname) && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

async function makePlan(url, flags) {
  const { runBrandkit, readBrand } = require("../src/brand");
  const { readWords } = require("../src/words");
  const { planFilm } = require("../src/plan");
  const host = new URL(url).hostname.replace(/^www\./, "");
  const out = path.resolve(flags.out || `launch-film-${host.replace(/[^a-z0-9.-]/gi, "-")}`);
  fs.mkdirSync(out, { recursive: true });
  const { isStoreUrl, appStoreId, storeBrand } = require("../src/store");
  let brandFile;
  let storeWords = null;
  if (flags.brand) {
    brandFile = path.resolve(flags.brand);
    if (fs.existsSync(brandFile) && fs.statSync(brandFile).isDirectory()) brandFile = path.join(brandFile, "brand.json");
    if (!fs.existsSync(brandFile)) fail(`no brand.json at ${brandFile}`);
    // The film refers to the brand by a path from its own folder.
    const local = path.join(out, "brand");
    if (path.dirname(brandFile) !== local) {
      fs.rmSync(local, { recursive: true, force: true });
      fs.cpSync(path.dirname(brandFile), local, { recursive: true });
      brandFile = path.join(local, path.basename(brandFile));
    }
  } else if (isStoreUrl(url)) {
    // brandkit reads a store listing and the maker's site it names. When it
    // cannot (an older brandkit, none installed), an App Store listing is
    // read here from Apple's lookup API.
    const dir = path.join(out, "brand");
    say(`Reading the store listing with brandkit...\n`);
    try {
      brandFile = await runBrandkit(url, dir, { command: flags.brandkit, log: (t) => flags.verbose && say(t) });
      const kit = JSON.parse(fs.readFileSync(brandFile, "utf8"));
      const listing = (kit.stores || []).find((s) => s && /appstore|googleplay/i.test(String(s.type)) && s.ok !== false);
      if (!listing) throw new Error("brandkit read no store listing from it");
      kit.app = { name: listing.name || kit.name || "", by: listing.by || "", site: listing.site || "" };
      fs.writeFileSync(brandFile, JSON.stringify(kit, null, 2) + "\n");
    } catch (err) {
      if (!appStoreId(url)) fail(`${err.message}`);
      say(`brandkit could not read the listing (${err.message.split(". ")[0]}); reading it from the App Store instead.\n`);
      fs.rmSync(dir, { recursive: true, force: true });
      const made = await storeBrand(url, dir, { runBrandkit: (u, d, o) => runBrandkit(u, d, { ...o, command: flags.brandkit }), log: say });
      brandFile = made.brandFile;
    }
  } else {
    say(`Reading the brand of ${url} with brandkit...\n`);
    brandFile = await runBrandkit(url, path.join(out, "brand"), { command: flags.brandkit, log: (t) => flags.verbose && say(t) });
  }
  const brand = readBrand(brandFile);
  // A kit made from an App Store page carries the listing's description.
  if (!storeWords && brand.app && brand.stores[0]) storeWords = require("../src/store").wordsFromListing({ name: brand.name, description: brand.stores[0].description });
  let words;
  if (flags.words) words = JSON.parse(fs.readFileSync(path.resolve(flags.words), "utf8"));
  else if (storeWords) words = storeWords;
  else {
    say(`Reading the words on the page...\n`);
    words = await readWords(brand.url || url, { log: say });
  }
  fs.writeFileSync(path.join(out, "words.json"), JSON.stringify(words, null, 2) + "\n");
  const seconds = Math.min(40, Math.max(20, Number(flags.seconds) || 30));
  const film = planFilm(brand, words, { look: flags.look, seconds, aspect: flags.aspect === "9:16" ? "9:16" : "16:9", filmDir: out });
  if (flags.music === false) film.music = false;
  if (flags.sfx === false) film.sfx = false;
  const filmFile = path.join(out, "film.json");
  fs.writeFileSync(filmFile, JSON.stringify(film, null, 2) + "\n");
  for (const note of brand.notes) say(`note: ${note}\n`);
  say(`Planned ${film.clips.length} clips in the ${film.look} look: ${path.relative(process.cwd(), filmFile) || filmFile}\n`);
  return { filmFile, out };
}

async function render(filmFile, flags) {
  const { renderFilm } = require("../src/film");
  const started = Date.now();
  const result = await renderFilm(filmFile, {
    output: flags.output || null,
    jobs: Math.max(1, Math.min(4, Number(flags.jobs) || 2)),
    keep: Boolean(flags.keep),
    log: say,
  });
  for (const note of result.notes) say(`note: ${note}\n`);
  say(`Rendered ${result.seconds.toFixed(1)} s in ${((Date.now() - started) / 1000).toFixed(0)} s: ${result.output}\n`);
  return result;
}

async function frames(file, flags) {
  const { saveFrames } = require("../src/frames");
  const r = await saveFrames(file, { out: flags.out });
  say(`Saved ${r.stills.length} stills and a contact sheet: ${r.sheet}\n`);
  return r;
}

async function main() {
  const { _: args, flags } = parseArgs(process.argv.slice(2));
  if (flags.version) {
    process.stdout.write(`${require("../package.json").version}\n`);
    return;
  }
  if (flags.help || !args.length) {
    process.stdout.write(HELP);
    return;
  }
  const [command, ...rest] = args;
  if (command === "looks") {
    const { LOOKS } = require("../src/motion");
    for (const [name, look] of Object.entries(LOOKS)) process.stdout.write(`${name.padEnd(9)} ${look.about}. Suits ${look.suits}.\n`);
    return;
  }
  if (command === "types") {
    const { catalog } = require("../src/scene");
    for (const t of catalog()) {
      const fields = [...t.fields, ...(t.items ? [`items (${t.items.count.join("-")}): ${Array.isArray(t.items.fields) ? t.items.fields.join(", ") : t.items.fields}`] : [])];
      process.stdout.write(`${t.type.padEnd(11)} ${t.about}${fields.length ? `\n${" ".repeat(12)}fields: ${fields.join("; ")}` : ""}\n`);
    }
    return;
  }
  if (command === "icons") {
    const { iconSearch } = require("../src/scene");
    process.stdout.write(`${iconSearch(rest[0] || "").join("\n")}\n`);
    return;
  }
  if (command === "doctor") {
    const { findChrome } = require("../src/chrome");
    const { available } = require("../src/ffmpeg");
    const chrome = findChrome();
    const ffmpeg = available();
    const node = Number(process.versions.node.split(".")[0]);
    process.stdout.write(`node    ${process.versions.node}${node >= 22 ? "" : " (22 or newer is needed)"}\nchrome  ${chrome || "not found: install Chrome or set LAUNCH_FILM_CHROME"}\nffmpeg  ${ffmpeg || "not found: install ffmpeg or set LAUNCH_FILM_FFMPEG"}\n`);
    if (!chrome || !ffmpeg || node < 22) process.exitCode = 1;
    return;
  }
  if (command === "render") {
    if (!rest[0]) fail("give the film.json to render");
    await render(path.resolve(rest[0]), flags);
    return;
  }
  if (command === "frames") {
    if (!rest[0]) fail("give the film's MP4");
    await frames(path.resolve(rest[0]), flags);
    return;
  }
  const isPlan = command === "plan";
  const url = normaliseUrl(isPlan ? rest[0] : command);
  if (!url) fail(isPlan ? "give the site's address, e.g. launch-film plan example.com" : `"${command}" is not a command or an address. Run launch-film --help.`);
  const { filmFile, out } = await makePlan(url, flags);
  if (isPlan) return;
  const result = await render(filmFile, flags);
  await frames(result.output, { out: path.join(out, "frames") });
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
