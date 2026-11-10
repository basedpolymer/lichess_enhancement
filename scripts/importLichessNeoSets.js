#!/usr/bin/env node
//IMPORTS THE SETS OF THE LICHESS NEO EXTENSION (https://github.com/theophile-wallez/LichessNeo, MIT) from a
//checkout of its repository, in the formats this extension uses:
//- ressources/pieces/lneo_<set>/<wp, wn...>.webp: its 8 piece sets, 256 px
//- ressources/boards/lneo_<board>.webp: its 21 material boards, 1200 x 1200. Lichess Neo draws them in CSS, a
//  relief picture laid in hard-light over two square colors: the same thing is done here once, into one picture
//- ressources/sounds/lneo_boxwood/ and its ruleset: the first take of its recorded sounds, as mp3
//The sets themselves are listed by hand in ressources/js/catalog.js and the ruleset in manifest.json: this
//script prints the lines to paste there. Then run node scripts/buildThumbs.js and node scripts/buildPreview.js
//Needs ffmpeg. Usage (from the repo root): node scripts/importLichessNeoSets.js <LichessNeo checkout> [--force]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const force = process.argv.includes('--force');
if (!SRC || !fs.existsSync(path.join(SRC, 'public/img/pieces'))) {
  console.error('Usage: node scripts/importLichessNeoSets.js <LichessNeo checkout> [--force]');
  process.exit(1);
}

//src/content/packs/piece-sets.ts
const PIECES = [
  ['mochi', 'Mochi'], ['mellow', 'Mellow'], ['poppy', 'Poppy'], ['bop', 'Bop'],
  ['pebble', 'Pebble'], ['loop', 'Loop'], ['fold', 'Fold'], ['bitty', 'Bitty'],
];

//src/content/packs/textures.ts and materials.ts: [texture, name, light squares, dark squares]
const BOARDS = [
  ['burl-gloss', 'Glossy burl', '#fbd19a', '#6d3b25'],
  ['burl', 'Burl', '#d9aa77', '#603926'],
  ['vavona', 'Vavona', '#d9ad7d', '#803e28'],
  ['cocobolo', 'Cocobolo', '#f9c88f', '#680b02'],
  ['amboyna', 'Amboyna', '#fcce95', '#b9440c'],
  ['olmo', 'Olmo', '#ecdab1', '#92401a'],
  ['padauk', 'Padauk', '#f7cc97', '#b81a03'],
  ['palisander', 'Palisander', '#f2be89', '#4a2b22'],
  ['pomelle', 'Pomelle', '#fcdcac', '#c54810'],
  ['portoro', 'Portoro', '#eef1ea', '#37332b'],
  ['marble', 'Marble', '#f7f5ef', '#636b77'],
  ['terrazzo', 'Terrazzo', '#efebe6', '#3f49a7'],
  ['slate', 'Slate', '#d0ccc1', '#545f6c'],
  ['brushed', 'Brushed metal', '#d4d7dd', '#414b9f'],
  ['spun', 'Spun metal', '#d9dadd', '#977f4f'],
  ['zellige', 'Zellige', '#e9e3d8', '#2d7981'],
  ['felt', 'Felt', '#e6dfcf', '#275c4c'],
  ['leather', 'Leather', '#ccb08c', '#734635'],
  ['blueprint', 'Blueprint', '#5b94e2', '#1f468d'],
  ['halftone', 'Halftone', '#f3eee3', '#b6b8dc'],
  ['cork', 'Cork', '#d0a573', '#60422d'],
];

//Our sound -> Lichess Neo's (public/sounds/boxwood/<name>-1.ogg)
const SOUNDS = { Move: 'move-self', Capture: 'capture', Check: 'move-check', Checkmate: 'checkmate' };

const id = (name) => `lneo_${name.replace(/-/g, '_')}`;
const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

//PIECES

for (const [set] of PIECES) {
  const dir = path.join(ROOT, 'ressources/pieces', id(set));
  fs.mkdirSync(dir, { recursive: true });
  for (const color of 'wb') {
    for (const piece of 'PNBRQK') {
      const out = path.join(dir, `${color}${piece.toLowerCase()}.webp`);
      if (!force && fs.existsSync(out)) continue;
      ffmpeg([
        '-i', path.join(SRC, 'public/img/pieces', set, `${color}${piece}.webp`),
        '-vf', 'format=rgba,scale=256:256:flags=lanczos', '-c:v', 'libwebp', '-quality', '90', out,
      ]);
    }
  }
  console.log(`pieces: ${set}`);
}

//BOARDS: a8 (top left) is a light square. In ffmpeg's hardlight the second input is the layer laid over

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

for (const [texture, , light, dark] of BOARDS) {
  const out = path.join(ROOT, 'ressources/boards', `${id(texture)}.webp`);
  if (!force && fs.existsSync(out)) continue;
  const [l, d] = [rgb(light), rgb(dark)];
  const channel = (i) => `if(mod(floor(X/256)+floor(Y/256),2),${d[i]},${l[i]})`;
  ffmpeg([
    '-f', 'lavfi', '-i', `nullsrc=s=2048x2048,format=gbrp,geq=r='${channel(0)}':g='${channel(1)}':b='${channel(2)}'`,
    '-i', path.join(SRC, 'public/img/boards', `${texture}.webp`),
    '-filter_complex', '[1]scale=2048:2048,format=gbrp[relief];[0][relief]blend=all_mode=hardlight,scale=1200:1200:flags=lanczos',
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', out,
  ]);
  console.log(`board: ${texture}`);
}

//SOUNDS: same rules as the other sets (see ressources/sound_rulesets/marble.json)

const soundDir = path.join(ROOT, 'ressources/sounds', id('boxwood'));
fs.mkdirSync(soundDir, { recursive: true });
const rules = Object.entries(SOUNDS).map(([name, source], i) => {
  const out = path.join(soundDir, `${name.toLowerCase()}.mp3`);
  if (force || !fs.existsSync(out)) {
    ffmpeg(['-i', path.join(SRC, 'public/sounds/boxwood', `${source}-1.ogg`), '-c:a', 'libmp3lame', '-q:a', '2', out]);
  }
  return {
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { extensionPath: `/ressources/sounds/${id('boxwood')}/${name.toLowerCase()}.mp3` } },
    condition: {
      regexFilter: `^https://lichess1?\\.org/assets/(hashed/${name}\\.[0-9a-z]+|([^/]+/)?sound/[^/]+/${name})\\.mp3$`,
      resourceTypes: ['xmlhttprequest', 'media'],
    },
  };
});
fs.writeFileSync(path.join(ROOT, 'ressources/sound_rulesets', `${id('boxwood')}.json`), JSON.stringify(rules, null, 2) + '\n');
console.log('sounds: boxwood');

//WHAT TO PASTE

const items = (list) => list.map(([name, label]) => `      ['${id(name)}', '${label}'],`).join('\n');
console.log(`\ncatalog.js, pieces:\n${items(PIECES)}`);
console.log(`\ncatalog.js, board:\n${items(BOARDS)}`);
console.log(`\ncatalog.js, sounds:\n    ['${id('boxwood')}', 'Boxwood', 'Lichess Neo'],`);
console.log(
  `\nmanifest.json, rule_resources:\n      {\n        "id": "${id('boxwood')}",\n        "enabled": false,\n        "path": "ressources/sound_rulesets/${id('boxwood')}.json"\n      }`
);
