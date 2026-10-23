//browser (Firefox, promise-native) or chrome (Chromium)
var extApi = typeof browser !== 'undefined' ? browser : chrome;

//Applied when a setting has never been chosen. They are never written to storage: onInstalled can report
//'install' again (reinstall, install on another synced device, --load-extension on every browser start) and
//writing them there wiped the user's synced choices. Keep in sync with main.js and the popup scripts
const DEFAULT_SETTINGS = { pieces: 'neo', board: 'green', sounds: 'chessdotcomdefault' };

//Popup values that shipped with the wrong case (issue #14): map old saved values to the real folder names
const LEGACY_PIECE_VALUES = {
  Celtic: 'celtic',
  Eyes: 'eyes',
  Fantasy: 'fantasy',
  Fantasy_Alt: 'fantasy_alt',
};

//Chrome resets enabled static rulesets to the manifest defaults on every extension update,
//so re-align them with the user's saved sound choice
async function syncRulesets() {
  const { sounds } = await extApi.storage.sync.get({ sounds: DEFAULT_SETTINGS.sounds });
  const enabled = await extApi.declarativeNetRequest.getEnabledRulesets();
  await extApi.declarativeNetRequest.updateEnabledRulesets({
    disableRulesetIds: enabled.filter((id) => id !== sounds),
    enableRulesetIds: [sounds],
  });
}

async function migrateStoredPieces() {
  const data = await extApi.storage.sync.get('pieces');
  const fixed = LEGACY_PIECE_VALUES[data.pieces];
  if (fixed) {
    await extApi.storage.sync.set({ pieces: fixed });
  }
}

extApi.runtime.onInstalled.addListener(async () => {
  try {
    await migrateStoredPieces();
    await syncRulesets();
  } catch (error) {
    console.warn('[lichess-enhancement]', error);
  }
});

extApi.runtime.onStartup.addListener(() => {
  migrateStoredPieces()
    .then(syncRulesets)
    .catch((error) => console.warn('[lichess-enhancement]', error));
});

//Keep the enabled ruleset aligned when the sound choice arrives from another synced device
extApi.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.sounds) {
    syncRulesets().catch(() => {});
  }
});

//Runs in lichess's MAIN world: flush the decoded-sound cache (so a new sound set is
//re-fetched through the new redirect rules) and pre-decode the sounds we replace
function primeLichessSounds(soundSet) {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const sound = window.site && window.site.sound;
    if (sound && typeof sound.load === 'function') {
      clearInterval(timer);
      if (sound.sounds && typeof sound.sounds.clear === 'function') {
        sound.sounds.clear();
      }
      const names = ['move', 'capture', 'check', 'checkmate'];
      //Only the chess.com set has a castle sound (played by soundHook.js)
      if (soundSet === 'chessdotcomdefault') names.push('castle');
      names.forEach((name) => {
        //load() is async and can reject (no AudioContext, fetch error)
        try {
          Promise.resolve(sound.load(name)).catch(() => {});
        } catch (e) {}
      });
    } else if (tries >= 20) {
      clearInterval(timer);
    }
  }, 500);
}

extApi.runtime.onMessage.addListener((request, sender) => {
  //From the popup: the sound set changed for the given lichess tab
  if (request && request.sounds_init && request.tab) {
    extApi.scripting
      .executeScript({ target: { tabId: request.tab }, world: 'MAIN', func: primeLichessSounds, args: [request.sounds_init] })
      .catch((error) => console.warn('[lichess-enhancement]', error));
  }
  //From the content script: warm the sound cache on page load
  if (request && request.sound_warmup && sender.tab) {
    extApi.scripting
      .executeScript({ target: { tabId: sender.tab.id }, world: 'MAIN', func: primeLichessSounds, args: [request.sound_warmup] })
      .catch(() => {});
  }
});
