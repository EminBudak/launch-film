# Third-party notes

launch-film has no npm dependencies. This file lists everything in it, or used by it, that someone else made.

## Shipped in this package

### Phosphor Icons

`assets/phosphor.json.gz` holds the fill and bold drawings of the 1,512 icons in `@phosphor-icons/core` 2.1.1, unchanged, built with `scripts/build-icons.js`. Scenes draw them for feature cards and the logo close.

MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Fetched while it runs, not shipped

### Typefaces from Google Fonts

No font files are in this package. When a film renders, its typefaces are downloaded from Google Fonts by family name and kept in `~/.cache/launch-film/fonts`:

- the brand's own families, when Google Fonts has them, each under its own license as listed on Google Fonts (the SIL Open Font License 1.1 or the Apache License 2.0);
- the looks' families, all under the SIL Open Font License 1.1: Inter, Plus Jakarta Sans, JetBrains Mono, Archivo, Bricolage Grotesque, Space Mono and Fraunces.

They are embedded in the pages that are rendered, and reach the film only as pixels.

### brandkit

`launch-film <url>` and `launch-film plan <url>` run [brandkit](https://github.com/EminBudak/brandkit) (MIT, by the same author) to read the site: a brandkit installed on PATH, or else `npx -y github:EminBudak/brandkit`. `LAUNCH_FILM_BRANDKIT` names another command.

## Used from your machine, not shipped

- Google Chrome or Chromium renders the frames.
- ffmpeg encodes the film, joins the clips and reads and writes pictures.

## Written for this package

- The timeline that moves every page (`src/runtime/timeline.js`) is this package's own code. Its method names follow the shape of GSAP's (`gsap.timeline()`, `tl.from()`, `"expo.out"`) because motion designers know them, but no GSAP code is included or loaded.
- Every sound (the music bed and all sound effects) is synthesised by `src/audio.js`. There are no recordings or samples.
- The test brand in `test/fixtures/acme`, "Acme Notes", is a made-up product drawn by `test/fixtures/make-fixture.js`.
