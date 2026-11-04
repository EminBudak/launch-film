"use strict";
// ─── pictures in pixels ────────────────────────────────────────────────────
// A small raster for the pictures check and frames draw (a contact sheet's
// labels, a loudness chart): RGBA pixels in a Buffer, written as PNG or JPEG
// by ffmpeg. Text is set in this file's own 5x7 pixel face, scaled in whole
// pixels, so the pictures come out the same on every machine and need no
// font installed.

// Each glyph is seven rows of five pixels, top row first, the leftmost
// pixel the highest bit: two hex digits a row.
const GLYPHS = {
  "0": "0e11131519110e", "1": "040c040404040e", "2": "0e11010204081f", "3": "1f02040201110e",
  "4": "02060a121f0202", "5": "1f101e0101110e", "6": "0608101e11110e", "7": "1f010204080808",
  "8": "0e11110e11110e", "9": "0e11110f01020c",
  A: "0e11111f111111", B: "1e11111e11111e", C: "0e11101010110e", D: "1c12111111121c",
  E: "1f10101e10101f", F: "1f10101e101010", G: "0e11101711110f", H: "1111111f111111",
  I: "0e04040404040e", J: "0702020202120c", K: "11121418141211", L: "1010101010101f",
  M: "111b1515111111", N: "11111915131111", O: "0e11111111110e", P: "1e11111e101010",
  Q: "0e11111115120d", R: "1e11111e141211", S: "0f10100e01011e", T: "1f040404040404",
  U: "1111111111110e", V: "11111111110a04", W: "1111111515150a", X: "11110a040a1111",
  Y: "1111110a040404", Z: "1f01020408101f",
  " ": "00000000000000", ".": "00000000000c0c", ",": "000000000c0408", "-": "0000000e000000",
  "+": "0004041f040400", ":": "000c0c000c0c00", "/": "01020204080810", "%": "18190204081303",
  "#": "0a0a1f0a1f0a0a", "(": "02040808080402", ")": "08040202020408", "=": "00001f001f0000",
  "@": "0e11171517100e", "<": "02040810080402", ">": "08040201020408", "|": "04040404040404",
};

const rows = (code) => Array.from({ length: 7 }, (_, i) => parseInt(code.slice(2 * i, 2 * i + 2), 16));
const FACE = Object.fromEntries(Object.entries(GLYPHS).map(([ch, code]) => [ch, rows(code)]));

// A colour as [r, g, b] from "#RRGGBB".
const hex = (h) => [1, 3, 5].map((k) => parseInt(String(h).replace("#", "").slice(k - 1, k + 1), 16));

function canvas(width, height, fill = "#000000") {
  const data = Buffer.alloc(width * height * 4);
  const [r, g, b] = hex(fill);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

// One pixel, blended over what is there.
function dot(c, x, y, rgb, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = 4 * (y * c.width + x);
  for (let k = 0; k < 3; k++) c.data[i + k] = Math.round(c.data[i + k] * (1 - alpha) + rgb[k] * alpha);
}

function rect(c, x, y, w, h, colour, alpha = 1) {
  const rgb = hex(colour);
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(c.width, Math.round(x + w));
  const y1 = Math.min(c.height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) dot(c, xx, yy, rgb, alpha);
}

// A line `width` pixels thick; `dash` draws every other `dash` pixels.
function line(c, x0, y0, x1, y1, colour, { width = 1, alpha = 1, dash = 0 } = {}) {
  const rgb = hex(colour);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const r = (width - 1) / 2;
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    if (dash && Math.floor(s / dash) % 2) continue;
    const x = x0 + ((x1 - x0) * s) / steps;
    const y = y0 + ((y1 - y0) * s) / steps;
    for (let dy = -Math.floor(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.floor(r); dx <= Math.ceil(r); dx++) {
        const key = `${Math.round(x + dx)},${Math.round(y + dy)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dot(c, x + dx, y + dy, rgb, alpha);
      }
    }
  }
}

const textWidth = (str, size = 2) => Math.max(0, String(str).length * 6 * size - size);

// Sets text with its top left corner at (x, y). Returns the width it took.
function text(c, x, y, str, colour, size = 2) {
  const rgb = hex(colour);
  let at = Math.round(x);
  for (const ch of String(str).toUpperCase()) {
    const glyph = FACE[ch] || FACE[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (!(glyph[row] & (16 >> col))) continue;
        for (let sy = 0; sy < size; sy++) for (let sx = 0; sx < size; sx++) dot(c, at + col * size + sx, Math.round(y) + row * size + sy, rgb);
      }
    }
    at += 6 * size;
  }
  return at - Math.round(x) - size;
}

// Copies a picture ({ data, width, height }, RGBA) in at (x, y).
function blit(c, img, x, y) {
  for (let yy = 0; yy < img.height; yy++) {
    const ty = y + yy;
    if (ty < 0 || ty >= c.height) continue;
    for (let xx = 0; xx < img.width; xx++) {
      const tx = x + xx;
      if (tx < 0 || tx >= c.width) continue;
      img.data.copy(c.data, 4 * (ty * c.width + tx), 4 * (yy * img.width + xx), 4 * (yy * img.width + xx) + 4);
    }
  }
}

module.exports = { canvas, rect, line, text, textWidth, blit, dot, hex, FACE };
