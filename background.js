//browser (Firefox, promise-native) or chrome (Chromium)
var extApi = typeof browser !== 'undefined' ? browser : chrome;

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
  const data = await extApi.storage.sync.get('sounds');
  const sounds = data.sounds || 'none';
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

extApi.runtime.onInstalled.addListener(async (details) => {
  try {
    //Only seed defaults on first install: an update must never overwrite the user's settings
    if (details.reason === 'install') {
      await extApi.storage.sync.set(DEFAULT_SETTINGS);
    }
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
function primeLichessSounds(config) {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (config && typeof window.__setLichessEnhancementSoundConfig === 'function') {
      window.__setLichessEnhancementSoundConfig(config);
    }
    const sound = window.site && window.site.sound;
    if (sound && typeof sound.load === 'function') {
      clearInterval(timer);
      if (sound.sounds && typeof sound.sounds.clear === 'function') {
        sound.sounds.clear();
      }
      ['move', 'capture', 'check', 'checkmate'].forEach((name) => {
        //load() is async and can reject (no AudioContext, fetch error)
        try {
          Promise.resolve(sound.load(name)).catch(() => {});
        } catch (e) {}
      });
      if (config && config.theme === 'chessdotcomdefault' && config.urls) {
        if (config.urls.castle) {
          try {
            Promise.resolve(sound.load('castle', config.urls.castle)).catch(() => {});
          } catch (e) {}
        }
        if (config.urls.gameStart) {
          try {
            Promise.resolve(sound.load('gameStart', config.urls.gameStart)).catch(() => {});
          } catch (e) {}
        }
      }
    } else if (tries >= 20) {
      clearInterval(timer);
    }
  }, 500);
}

async function getSoundConfig() {
  const data = await extApi.storage.sync.get('sounds');
  const sounds = data.sounds || 'chessdotcomdefault';
  return {
    theme: sounds,
    urls: {
      castle: extApi.runtime.getURL('ressources/sounds/chessdotcomdefault/castle.mp3'),
      gameStart: extApi.runtime.getURL('ressources/sounds/chessdotcomdefault/game-start.mp3')
    }
  };
}

extApi.runtime.onMessage.addListener(async (request, sender) => {
  //From the popup: the sound set changed for the given lichess tab
  if (request && request.sounds_init && request.tab) {
    const config = await getSoundConfig();
    extApi.scripting
      .executeScript({ target: { tabId: request.tab }, world: 'MAIN', func: primeLichessSounds, args: [config] })
      .catch((error) => console.warn('[lichess-enhancement]', error));
  }
  //From the content script: warm the sound cache on page load
  if (request && request.sound_warmup && sender.tab) {
    const config = await getSoundConfig();
    extApi.scripting
      .executeScript({ target: { tabId: sender.tab.id }, world: 'MAIN', func: primeLichessSounds, args: [config] })
      .catch(() => {});
  }
});
