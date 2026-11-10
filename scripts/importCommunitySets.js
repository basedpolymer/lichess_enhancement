#!/usr/bin/env node
//IMPORTS SETS MADE BY THE COMMUNITY (SVG or PNG pieces, any board picture, any sound files) in the formats
//this extension uses. It reads a folder laid out like this:
//- pieces/<id>/<wk, wq, wr, wb, wn, wp, bk...>.<svg|png|webp>  -> ressources/pieces/<id>/<wk...>.webp, 256 px
//- boards/<id>.<svg|png|jpg|webp>                              -> ressources/boards/<id>.webp, 1200 x 1200
//- sounds/<id>/<move, capture, check[, checkmate]>.<wav|ogg|mp3> -> ressources/sounds/<id>/*.mp3 and its ruleset
//  (without a checkmate file, checkmate plays check, as the chess.com sets do)
//Pictures are drawn by a headless Chrome, so SVG files look as they do in a browser. The sets are then listed
//by hand in ressources/js/catalog.js, the rulesets in manifest.json and the authors in the credits.md files.
//Then run node scripts/buildThumbs.js and node scripts/buildPreview.js
//Needs Chrome (CHROME=<path> when it is not in its default place), ffmpeg and cwebp (libwebp).
//Usage (from the repo root): node scripts/importCommunitySets.js <folder> [--force]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const force = process.argv.includes('--force');
if (!SRC || !fs.existsSync(SRC)) {
  console.error('Usage: node scripts/importCommunitySets.js <folder> [--force]');
  process.exit(1);
}

const CHROME =
  process.env.CHROME ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) =>
    fs.existsSync(p)
  );
if (!CHROME) {
  console.error('Chrome not found: set CHROME=<path to the Chrome or Chromium binary>');
  process.exit(1);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'le-import-'));
const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const list = (dir) => (fs.existsSync(path.join(SRC, dir)) ? fs.readdirSync(path.join(SRC, dir)).filter((f) => !f.startsWith('.')).sort() : []);

//A screenshot of a page showing the pictures side by side, on a transparent background
function shoot(files, size, fit, out) {
  const page = path.join(TMP, 'page.html');
  const imgs = files.map((f) => `<img src="file://${encodeURI(f)}">`).join('');
  fs.writeFileSync(
    page,
    `<body style="margin:0;background:transparent"><style>img{width:${size}px;height:${size}px;object-fit:${fit};display:block;float:left}</style>${imgs}</body>`
  );
  execFileSync(
    CHROME,
    [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--user-data-dir=${path.join(TMP, 'profile')}`, '--default-background-color=00000000',
      `--window-size=${size * files.length},${size}`, `--screenshot=${out}`, `file://${page}`,
    ],
    { stdio: 'ignore' }
  );
}

//PIECES

const PIECES = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp'];
const SIZE = 256;

for (const id of list('pieces')) {
  const dir = path.join(ROOT, 'ressources/pieces', id);
  if (!force && fs.existsSync(path.join(dir, 'bp.webp'))) continue;
  const files = PIECES.map((p) => {
    const f = list(`pieces/${id}`).find((name) => name.replace(/\.\w+$/, '') === p);
    if (!f) throw new Error(`pieces/${id}: no ${p} file`);
    return path.join(SRC, 'pieces', id, f);
  });
  const strip = path.join(TMP, 'strip.png');
  shoot(files, SIZE, 'contain', strip);
  fs.mkdirSync(dir, { recursive: true });
  PIECES.forEach((p, i) => {
    const png = path.join(TMP, `${p}.png`);
    ffmpeg(['-i', strip, '-vf', `crop=${SIZE}:${SIZE}:${i * SIZE}:0`, png]);
    execFileSync('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', png, '-o', path.join(dir, `${p}.webp`)]);
  });
  console.log(`pieces: ${id}`);
}

//BOARDS: stretched to a square, as lichess does with its own board pictures

for (const file of list('boards')) {
  const id = file.replace(/\.\w+$/, '');
  const out = path.join(ROOT, 'ressources/boards', `${id}.webp`);
  if (!force && fs.existsSync(out)) continue;
  const png = path.join(TMP, 'board.png');
  shoot([path.join(SRC, 'boards', file)], 1200, 'fill', png);
  execFileSync('cwebp', ['-quiet', '-q', '88', png, '-o', out]);
  console.log(`board: ${id}`);
}

//SOUNDS: same rules as the other sets (see ressources/sound_rulesets/marble.json)

const manifestLines = [];
for (const id of list('sounds')) {
  const files = list(`sounds/${id}`);
  const source = (name) => files.find((f) => f.replace(/\.\w+$/, '') === name);
  const dir = path.join(ROOT, 'ressources/sounds', id);
  fs.mkdirSync(dir, { recursive: true });
  const rules = ['Move', 'Capture', 'Check', 'Checkmate'].map((name, i) => {
    //Checkmate without a file of its own: the check sound
    const played = source(name.toLowerCase()) ? name.toLowerCase() : 'check';
    if (!source(played)) throw new Error(`sounds/${id}: no ${played} file`);
    const out = path.join(dir, `${played}.mp3`);
    if (force || !fs.existsSync(out)) {
      ffmpeg(['-i', path.join(SRC, 'sounds', id, source(played)), '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '2', out]);
    }
    return {
      id: i + 1,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: `/ressources/sounds/${id}/${played}.mp3` } },
      condition: {
        regexFilter: `^https://lichess1?\\.org/assets/(hashed/${name}\\.[0-9a-z]+|([^/]+/)?sound/[^/]+/${name})\\.mp3$`,
        resourceTypes: ['xmlhttprequest', 'media'],
      },
    };
  });
  fs.writeFileSync(path.join(ROOT, 'ressources/sound_rulesets', `${id}.json`), JSON.stringify(rules, null, 2) + '\n');
  manifestLines.push(`      {\n        "id": "${id}",\n        "enabled": false,\n        "path": "ressources/sound_rulesets/${id}.json"\n      }`);
  console.log(`sounds: ${id}`);
}

fs.rmSync(TMP, { recursive: true, force: true });
if (manifestLines.length) console.log(`\nmanifest.json, rule_resources:\n${manifestLines.join(',\n')}`);
