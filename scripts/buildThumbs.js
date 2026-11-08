#!/usr/bin/env node
//BUILDS THE SMALL PICTURES SHOWN BY THE POPUP AND THE SHORTCUT TOAST FROM ressources/js/catalog.js:
//- ressources/thumbs/pieces/<id>.webp: the white knight, 96 px wide
//- ressources/thumbs/boards/<id>.webp: the two top-left squares (a8, b8), 128 x 64
//- ressources/thumbs/pieces.webp, boards.webp: sprite sheets of those, and ressources/js/thumbs.js (see below)
//The popup would otherwise load every full-size board (1200 x 1200) to show 64 x 32 pixels
//Needs cwebp (libwebp) and ffmpeg. Usage (from the repo root): node scripts/buildThumbs.js [--force]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATALOG = require('../ressources/js/catalog.js');
const force = process.argv.includes('--force');

const ids = (kind) => CATALOG[kind].flatMap((g) => g.items.map(([id]) => id));

//Width and height of a .webp file (lossy VP8, lossless VP8L or extended VP8X header)
function webpSize(file) {
  const b = fs.readFileSync(file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (chunk === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`${file}: not a WebP file`);
}

const upToDate = (src, out) => !force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
const cwebp = (args) => execFileSync('cwebp', ['-quiet', '-mt', ...args], { stdio: 'inherit' });

let built = 0;
const missing = [];

fs.mkdirSync(path.join(ROOT, 'ressources/thumbs/pieces'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'ressources/thumbs/boards'), { recursive: true });

for (const id of ids('pieces')) {
  const dir = path.join(ROOT, 'ressources/pieces', id);
  const src = ['wn.webp', 'wn.gif'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  const out = path.join(ROOT, 'ressources/thumbs/pieces', `${id}.webp`);
  if (!src) {
    missing.push(`pieces/${id}`);
    continue;
  }
  if (upToDate(src, out)) continue;
  if (src.endsWith('.gif')) {
    //cwebp does not read GIF: take the first frame through a temporary PNG
    const png = path.join(os.tmpdir(), `le-thumb-${id}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-frames:v', '1', png]);
    cwebp(['-q', '85', '-alpha_q', '100', '-resize', '96', '0', png, '-o', out]);
    fs.unlinkSync(png);
  } else {
    cwebp(['-q', '85', '-alpha_q', '100', '-resize', '96', '0', src, '-o', out]);
  }
  built += 1;
}

for (const id of ids('board')) {
  const src = path.join(ROOT, 'ressources/boards', `${id}.webp`);
  const out = path.join(ROOT, 'ressources/thumbs/boards', `${id}.webp`);
  if (!fs.existsSync(src)) {
    missing.push(`boards/${id}`);
    continue;
  }
  if (upToDate(src, out)) continue;
  const [w, h] = webpSize(src);
  //a8 and b8: a quarter of the width, an eighth of the height
  cwebp(['-q', '82', '-crop', '0', '0', String(Math.round(w / 4)), String(Math.round(h / 8)), '-resize', '128', '64', src, '-o', out]);
  built += 1;
}

if (missing.length) {
  console.error(`Missing source files for: ${missing.join(', ')}`);
  process.exitCode = 1;
}
console.log(`thumbs: ${built} built, ${ids('pieces').length + ids('board').length - built - missing.length} already up to date`);

//SPRITE SHEETS: every thumbnail of a kind in one image, in catalog order, SPRITE_COLS per row. The popup loads
//one file per tab instead of ~100 (each extension file is a round trip to the browser process, and the popup
//only shows once its page has loaded). ressources/js/thumbs.js records the order; a set missing from it falls
//back to its own thumbnail
const SPRITE_COLS = 12;
const SPRITES = {
  pieces: { dir: 'pieces', out: 'pieces.webp', cell: [96, 96] },
  board: { dir: 'boards', out: 'boards.webp', cell: [128, 64] },
};

const spriteIndex = {};
for (const [kind, sprite] of Object.entries(SPRITES)) {
  const list = ids(kind).filter((id) => fs.existsSync(path.join(ROOT, 'ressources/thumbs', sprite.dir, `${id}.webp`)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `le-sprite-${kind}-`));
  const [w, h] = sprite.cell;
  list.forEach((id, i) => {
    //Same-size frames for ffmpeg's tile filter: fit the thumbnail in its cell, centered, transparent around
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-i', path.join(ROOT, 'ressources/thumbs', sprite.dir, `${id}.webp`),
      '-vf', `format=rgba,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      path.join(tmp, `f_${String(i).padStart(3, '0')}.png`),
    ]);
  });
  const rows = Math.ceil(list.length / SPRITE_COLS);
  const png = path.join(tmp, 'sprite.png');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-framerate', '1',
    '-i', path.join(tmp, 'f_%03d.png'),
    '-vf', `tile=${SPRITE_COLS}x${rows}:color=0x00000000`,
    '-frames:v', '1', png,
  ]);
  cwebp(['-q', '85', '-alpha_q', '100', png, '-o', path.join(ROOT, 'ressources/thumbs', sprite.out)]);
  fs.rmSync(tmp, { recursive: true, force: true });
  spriteIndex[kind] = { file: `ressources/thumbs/${sprite.out}`, cols: SPRITE_COLS, rows, cell: sprite.cell, ids: list };
}

fs.writeFileSync(
  path.join(ROOT, 'ressources/js/thumbs.js'),
  `//GENERATED by scripts/buildThumbs.js: the order of the thumbnails in the sprite sheets (ressources/thumbs/*.webp)\n` +
    `var LE_SPRITES = ${JSON.stringify(spriteIndex)};\n`
);
console.log(`sprites: ${Object.entries(spriteIndex).map(([k, s]) => `${k} ${s.ids.length} (${s.cols}x${s.rows})`).join(', ')}`);
