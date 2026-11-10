#!/usr/bin/env node
//IMPORTS LICHESS'S OWN PIECE SETS, BOARDS AND SOUND SETS (the "Lichess" sections of the popup) from the lila
//repository, in the formats the extension uses:
//- ressources/pieces/lichess_<set>/<wp, wn...>.webp: 256 px, lossless
//- ressources/boards/lichess_<board>.webp: 1200 x 1200
//- ressources/sounds/lichess_<set>/<move, capture, genericnotify, countdown0...>.mp3 (every sound of the set) and ressources/sound_rulesets/lichess_<set>.json
//The sets themselves are listed by hand in ressources/js/catalog.js and the rulesets in manifest.json: this
//script prints the lines to paste there. Then run node scripts/buildThumbs.js and node scripts/buildPreview.js
//Needs curl, resvg (SVG -> PNG) and ffmpeg. Usage (from the repo root): node scripts/importLichessSets.js [--force]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RAW = 'https://raw.githubusercontent.com/lichess-org/lila/master/public';
const force = process.argv.includes('--force');

//lichess's order (modules/pref/src/main/PieceSet.scala). Left out: disguised and mono, which are not plain
//"one picture per piece" sets. ext: the set's file type when it isn't svg
const PIECES = [
  'cburnett', 'merida', 'alpha', 'pirouetti', 'chessnut', 'chess7', 'reillycraig', 'companion', 'riohacha',
  'kosal', 'leipzig', 'fantasy', 'spatial', 'celtic', 'california', 'caliente', 'pixel', 'firi', 'rhosgfx',
  'maestro', 'fresca', 'cardinal', 'gioco', 'tatiana', 'staunty', 'cooke', 'monarchy', 'governor', 'dubrovny',
  'shahi-ivory-brown', 'icpieces', 'mpchess', 'kiwen-suwi', 'horsey', 'anarcandy', 'xkcd', 'shapes', 'letter',
  'papercut', 'totoy', 'minimal-warmth',
];
const PIECE_EXT = { monarchy: 'webp' };

//lichess's order (modules/pref/src/main/Theme.scala): [name, file in public/images/board]
const BOARDS = [
  ['brown', 'brown.png'], ['wood', 'wood.jpg'], ['wood2', 'wood2.jpg'], ['wood3', 'wood3.jpg'],
  ['wood4', 'wood4.jpg'], ['maple', 'maple.jpg'], ['maple2', 'maple2.jpg'], ['horsey', 'horsey.jpg'],
  ['leather', 'leather.jpg'], ['blue', 'blue.png'], ['blue2', 'blue2.jpg'], ['blue3', 'blue3.jpg'],
  ['canvas', 'canvas2.jpg'], ['blue-marble', 'blue-marble.jpg'], ['ic', 'ic.png'], ['green', 'green.png'],
  ['marble', 'marble.jpg'], ['green-plastic', 'green-plastic.png'], ['olive', 'olive.jpg'], ['grey', 'grey.jpg'],
  ['metal', 'metal.jpg'], ['newspaper', 'svg/newspaper.svg'], ['purple', 'purple.png'],
  ['purple-diag', 'purple-diag.png'], ['pink', 'pink-pyramid.png'],
];

//Music (instrument) and speech are not sound files
const SOUNDS = ['standard', 'piano', 'nes', 'sfx', 'futuristic', 'robot', 'lisp', 'woodland'];
//Every sound of a lichess set: the board sounds first, then notifications, clock, game end, tournaments...
//A set doesn't have them all (lichess plays its standard one then), the missing ones are skipped
const SOUND_FILES = [
  'Move', 'Capture', 'Check', 'Checkmate', 'Castles',
  'GenericNotify', 'SocialNotify', 'NewPM', 'NewChallenge', 'NewChatMessage', 'Confirmation', 'Error', 'Select',
  'LowTime', 'CountDown0', 'CountDown1', 'CountDown2', 'CountDown3', 'CountDown4', 'CountDown5', 'CountDown6',
  'CountDown7', 'CountDown8', 'CountDown9', 'CountDown10',
  'Victory', 'Defeat', 'Draw', 'Berserk', 'Explosion', 'OutOfBound',
  'Tournament1st', 'Tournament2nd', 'Tournament3rd', 'TournamentOther',
  'PracticeComplete', 'PuzzleStormEnd', 'PuzzleStormGood',
];

const LABELS = { chess7: 'Chess7', 'kiwen-suwi': 'Kiwen-suwi', ic: 'IC', nes: 'NES', sfx: 'SFX', xkcd: 'xkcd', 'purple-diag': 'Purple Diagonal' };
const id = (name) => `lichess_${name.replace(/-/g, '_')}`;
const label = (name) =>
  LABELS[name] || name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace(/(\D)(\d)$/, '$1 $2');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'le-lichess-'));
let n = 0;

function download(url) {
  const file = path.join(tmp, `dl_${n++}${path.extname(url)}`);
  execFileSync('curl', ['-sfL', '--retry', '3', '-o', file, url]);
  return file;
}

const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

//PIECES

for (const set of PIECES) {
  const dir = path.join(ROOT, 'ressources/pieces', id(set));
  fs.mkdirSync(dir, { recursive: true });
  for (const color of 'wb') {
    for (const piece of 'PNBRQK') {
      const out = path.join(dir, `${color}${piece.toLowerCase()}.webp`);
      if (!force && fs.existsSync(out)) continue;
      const ext = PIECE_EXT[set] || 'svg';
      let src = download(`${RAW}/piece/${set}/${color}${piece}.${ext}`);
      if (ext === 'svg') {
        const png = `${src}.png`;
        execFileSync('resvg', ['-w', '256', '-h', '256', src, png]);
        src = png;
      }
      ffmpeg(['-i', src, '-vf', 'scale=256:256:flags=lanczos', '-c:v', 'libwebp', '-lossless', '1', '-compression_level', '6', out]);
    }
  }
  console.log(`pieces: ${set}`);
}

//BOARDS

for (const [name, file] of BOARDS) {
  const out = path.join(ROOT, 'ressources/boards', `${id(name)}.webp`);
  if (!force && fs.existsSync(out)) continue;
  let src = download(`${RAW}/images/board/${file}`);
  if (file.endsWith('.svg')) {
    const png = `${src}.png`;
    execFileSync('resvg', ['-w', '1200', '-h', '1200', src, png]);
    src = png;
  }
  //The flat boards are tiny pictures of 8 x 8 squares: enlarge them without blurring the square edges
  const flags = file.endsWith('.png') ? 'neighbor' : 'lanczos';
  ffmpeg(['-i', src, '-vf', `scale=1200:1200:flags=${flags}`, '-c:v', 'libwebp', '-quality', '88', out]);
  console.log(`board: ${name}`);
}

//SOUNDS: same rules as the other sets (see ressources/sound_rulesets/marble.json)

for (const set of SOUNDS) {
  const dir = path.join(ROOT, 'ressources/sounds', id(set));
  fs.mkdirSync(dir, { recursive: true });
  const rules = [];
  for (const name of SOUND_FILES) {
    const out = path.join(dir, `${name.toLowerCase()}.mp3`);
    if (force || !fs.existsSync(out)) {
      try {
        fs.copyFileSync(download(`${RAW}/sound/${set}/${name}.mp3`), out);
      } catch (e) {
        continue;
      }
    }
    rules.push({
      id: rules.length + 1,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: `/ressources/sounds/${id(set)}/${name.toLowerCase()}.mp3` } },
      condition: {
        regexFilter: `^https://lichess1?\\.org/assets/(hashed/${name}\\.[0-9a-z]+|([^/]+/)?sound/[^/]+/${name})\\.mp3$`,
        resourceTypes: ['xmlhttprequest', 'media'],
      },
    });
  }
  fs.writeFileSync(path.join(ROOT, 'ressources/sound_rulesets', `${id(set)}.json`), JSON.stringify(rules, null, 2) + '\n');
  console.log(`sounds: ${set} (${rules.length})`);
}

fs.rmSync(tmp, { recursive: true, force: true });

//WHAT TO PASTE

const items = (names, group) =>
  names.map((name) => `      ['${id(name)}', '${label(name)}'${group ? `, '${group}'` : ''}],`).join('\n');
console.log(`\ncatalog.js, pieces:\n${items(PIECES)}`);
console.log(`\ncatalog.js, board:\n${items(BOARDS.map(([name]) => name))}`);
console.log(`\ncatalog.js, sounds:\n${items(SOUNDS, 'Lichess')}`);
console.log(
  `\nmanifest.json, rule_resources:\n${SOUNDS.map(
    (set) => `      {\n        "id": "${id(set)}",\n        "enabled": false,\n        "path": "ressources/sound_rulesets/${id(set)}.json"\n      }`
  ).join(',\n')}`
);
