"use strict";
// ─── the logo ──────────────────────────────────────────────────────────────
// The close shows the brand's own mark: its pixels, cut out of the capture
// and keyed off the ground they were captured on, never redrawn or
// recoloured. A capture is checked before it is used: one whose mark runs
// off an edge (a header cut through the icon), one that is a photo or a
// page, and one too small to close on sharply are refused, so the next
// capture is tried.

const { readPixels, writePng } = require("./ffmpeg");

const hexOf = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const lumOf = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

// The mark's box in a capture, after edge bands are cut away: neighbours a
// header capture caught at its edges (half a line of text under the logo,
// the tops of two buttons, a border line) touch the edge and stand apart
// from the band that holds most of the mark.
function measure(px, sw, sh, bg) {
  const inMark = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const j = 4 * i;
    const solid = px[j + 3] > 128;
    inMark[i] = solid && Math.abs(px[j] - bg[0]) + Math.abs(px[j + 1] - bg[1]) + Math.abs(px[j + 2] - bg[2]) > 60 ? 1 : 0;
  }
  const keep = { y0: 0, y1: sh - 1, x0: 0, x1: sw - 1 };
  const cut = (count, length, gap, edgeAt) => {
    const bands = [];
    for (let a = 0; a < length; ) {
      if (!count(a)) {
        a++;
        continue;
      }
      let b = a;
      let empty = 0;
      for (let c = a + 1; c < length && empty < gap; c++) {
        if (count(c)) {
          b = c;
          empty = 0;
        } else empty++;
      }
      let pixels = 0;
      let edge = a === 0 || b === length - 1;
      for (let c = a; c <= b; c++) {
        pixels += count(c);
        edge = edge || edgeAt(c);
      }
      bands.push({ a, b, pixels, edge });
      a = b + gap;
    }
    if (bands.length < 2) return null;
    const main = bands.reduce((m, band) => (band.pixels > m.pixels ? band : m));
    const total = bands.reduce((sum, band) => sum + band.pixels, 0);
    const kept = bands.filter((band) => band === main || !band.edge);
    if (kept.length === bands.length || kept.reduce((sum, band) => sum + band.pixels, 0) < 0.5 * total) return null;
    const dropped = bands.filter((band) => !kept.includes(band));
    const lo = Math.max(0, ...dropped.filter((band) => band.b < main.a).map((band) => band.b + 1));
    const hi = Math.min(length - 1, ...dropped.filter((band) => band.a > main.b).map((band) => band.a - 1));
    return [lo, hi];
  };
  const inRow = (y) => {
    let n = 0;
    for (let x = keep.x0; x <= keep.x1; x++) n += inMark[y * sw + x];
    return n;
  };
  const rows = cut(inRow, sh, Math.max(2, Math.round(0.02 * sh)), (y) => inMark[y * sw + keep.x0] || inMark[y * sw + keep.x1]);
  if (rows) [keep.y0, keep.y1] = rows;
  let height = 0;
  for (let y = keep.y0; y <= keep.y1; y++) if (inRow(y)) height++;
  const inColumn = (x) => {
    let n = 0;
    for (let y = keep.y0; y <= keep.y1; y++) n += inMark[y * sw + x];
    return n;
  };
  // Columns need a wide gap: letters stand apart too.
  const columns = cut(inColumn, sw, Math.max(3, Math.round(0.6 * height)), (x) => inMark[keep.y0 * sw + x] || inMark[keep.y1 * sw + x]);
  if (columns) [keep.x0, keep.x1] = columns;
  let [x0, y0, x1, y1] = [sw, sh, -1, -1];
  for (let y = keep.y0; y <= keep.y1; y++) {
    for (let x = keep.x0; x <= keep.x1; x++) {
      if (inMark[y * sw + x]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  return { inMark, keep, box: x1 < 0 ? null : [x0, y0, x1, y1], trimmed: Boolean(rows || columns) };
}

// The ground a capture was taken on: the middle colour of its border.
function borderColour(px, sw, sh) {
  const border = [];
  for (let x = 0; x < sw; x++) border.push(x, (sh - 1) * sw + x);
  for (let y = 1; y < sh - 1; y++) border.push(y * sw, y * sw + sw - 1);
  return [0, 1, 2].map((c) => border.map((i) => px[4 * i + c]).sort((a, b) => a - b)[border.length >> 1]);
}

// Prepares a logo capture for the close. Returns { file, w, h, ground } (w,
// h: the size to show it at on a 1920x1080 page) or throws why it cannot be
// used. A see-through capture is set on white under a dark mark and on
// near-black under a light one first.
async function prepareLogo(input, output, { portrait = false } = {}) {
  const full = readPixels(input);
  const { width: W0, height: H0 } = full;
  const px = Buffer.from(full.data);
  let clear = 0;
  let solidLum = 0;
  let solid = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) clear++;
    else if (px[i + 3] > 200) {
      solid++;
      solidLum += lumOf([px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (clear > 0.05 * (px.length / 4) && solid) {
    const g = solidLum / solid < 0.55 ? [255, 255, 255] : [17, 19, 24];
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3] / 255;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * a + g[c] * (1 - a));
      px[i + 3] = 255;
    }
  }
  // Measured on a copy at most 400 px long: the background is the middle
  // colour of the border, the mark every pixel clearly unlike it.
  const k = Math.min(1, 400 / Math.max(W0, H0));
  const sw = Math.max(2, Math.round(W0 * k));
  const sh = Math.max(2, Math.round(H0 * k));
  const small = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(W0 - 1, Math.floor(x / k));
      const sy = Math.min(H0 - 1, Math.floor(y / k));
      px.copy(small, 4 * (y * sw + x), 4 * (sy * W0 + sx), 4 * (sy * W0 + sx) + 4);
    }
  }
  const bg = borderColour(small, sw, sh);
  const { box, keep, trimmed } = measure(small, sw, sh, bg);
  if (!box) throw new Error("the picture is one colour");
  const [x0, y0, x1, y1] = box;
  // A mark that runs off one edge, with an empty margin on the other side,
  // is cut off (a tight crop touches both sides and passes).
  const off = [
    x1 >= sw - 2 && x0 > 0.25 * sw && "right",
    x0 <= 1 && x1 < 0.75 * sw && "left",
    y1 >= sh - 2 && y0 > 0.25 * sh && "bottom",
    y0 <= 1 && y1 < 0.75 * sh && "top",
  ].find(Boolean);
  if (off) throw new Error(`its mark runs off the ${off} edge`);
  // A logo is drawn in a few flat colours: its eight commonest tones cover
  // most of it. A photo or a page is spread over hundreds.
  const tones = new Map();
  let marked = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = 4 * (y * sw + x);
      if (Math.abs(small[i] - bg[0]) + Math.abs(small[i + 1] - bg[1]) + Math.abs(small[i + 2] - bg[2]) <= 60) continue;
      const tone = ((small[i] >> 4) << 8) | ((small[i + 1] >> 4) << 4) | (small[i + 2] >> 4);
      tones.set(tone, (tones.get(tone) || 0) + 1);
      marked++;
    }
  }
  const common = [...tones.values()].sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0);
  if (tones.size > 150 && common < 0.6 * marked) throw new Error("it is a photo or a page, not a logo");
  const bw = (x1 - x0 + 1) / k;
  const bh = (y1 - y0 + 1) / k;
  const shape = Math.max(W0, H0) / Math.min(W0, H0);
  if (Math.min(W0, H0) > 700 && shape >= 1.25 && shape <= 2.5 && bw * bh > 0.5 * W0 * H0) throw new Error("it is a screenshot of a page, not a logo");
  const room = Math.min((x0 - keep.x0) / k, (keep.x1 - x1) / k, (y0 - keep.y0) / k, (keep.y1 - y1) / k);
  const margin = trimmed ? Math.max(0, Math.min(Math.max(6, 0.15 * Math.min(bw, bh)), room)) : Math.max(6, 0.15 * Math.min(bw, bh));
  const cx = Math.max(0, Math.floor(x0 / k - margin));
  const cy = Math.max(0, Math.floor(y0 / k - margin));
  const cw = Math.min(W0, Math.ceil((x1 + 1) / k + margin)) - cx;
  const ch = Math.min(H0, Math.ceil((y1 + 1) / k + margin)) - cy;
  // On the page the mark is at most 42% of the width and 24% of the height
  // (9:16: 70% and 14%), and at most twice its captured size.
  const [PW, PH] = portrait ? [1080, 1920] : [1920, 1080];
  const scale = Math.min(((portrait ? 0.7 : 0.42) * PW) / bw, ((portrait ? 0.14 : 0.24) * PH) / bh, 2);
  if (Math.max(bw, bh) * scale < 0.15 * Math.min(PW, PH)) throw new Error(`its mark is too small to close on (${Math.round(bw)}x${Math.round(bh)} px)`);
  // A neutral mid-grey ground is a page dimmed by an open overlay, not the
  // brand's: the ground becomes white under a dark mark and near-black under
  // a light one.
  let ground = bg;
  let near = 0.08;
  const groundLum = lumOf(bg);
  if (Math.max(...bg) - Math.min(...bg) < 14 && groundLum > 0.25 && groundLum < 0.75) {
    let lum = 0;
    let n = 0;
    for (let i = 0; i < small.length; i += 4) {
      if (Math.abs(small[i] - bg[0]) + Math.abs(small[i + 1] - bg[1]) + Math.abs(small[i + 2] - bg[2]) <= 60) continue;
      lum += lumOf([small[i], small[i + 1], small[i + 2]]);
      n++;
    }
    ground = n && lum / n < groundLum ? [255, 255, 255] : [17, 19, 24];
    near = 0.12;
  }
  // Keyed: a pixel as close to the ground as `near` is clear, one a little
  // further is part clear with the ground's colour taken out of it, so the
  // mark's soft edges sit cleanly on any stage. Near the cut the alpha
  // fades, so no box shows.
  const out = Buffer.alloc(cw * ch * 4);
  const feather = Math.max(1, Math.round(margin * 0.8));
  const far = near + 0.06;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = 4 * ((cy + y) * W0 + (cx + x));
      const o = 4 * (y * cw + x);
      const c = [px[si], px[si + 1], px[si + 2]];
      const d = Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) / (255 * Math.sqrt(3));
      let a = d <= near ? 0 : d >= far ? 1 : (d - near) / (far - near);
      a *= Math.min(1, Math.min(x, cw - 1 - x, y, ch - 1 - y) / feather);
      for (let i = 0; i < 3; i++) out[o + i] = a > 0.02 ? Math.max(0, Math.min(255, Math.round((c[i] - bg[i] * (1 - a)) / a))) : bg[i];
      out[o + 3] = Math.round(a * 255);
    }
  }
  await writePng(output, { data: out, width: cw, height: ch });
  return { file: output, w: Math.round(cw * scale), h: Math.round(ch * scale), ground: hexOf(ground), size: [cw, ch] };
}

// An app's store icon for the close: square art shown whole, with rounded
// corners drawn by the page.
async function prepareIcon(input, output) {
  const p = readPixels(input, 1024);
  if (Math.abs(p.width / p.height - 1) > 0.05) throw new Error("an app icon is square");
  if (p.width < 240) throw new Error("the icon is too small");
  await writePng(output, p);
  return { file: output, w: 360, h: 360, ground: hexOf(borderColour(p.data, p.width, p.height)), icon: true };
}

module.exports = { prepareLogo, prepareIcon, borderColour };
