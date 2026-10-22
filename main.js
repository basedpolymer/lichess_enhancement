//APPLY THE SAVED PIECES AND BOARD STYLES
//extApi is defined in Boards.js (content scripts share one isolated-world scope)

function applyFromStorage() {
  extApi.storage.sync.get(['pieces', 'board']).then(function (data) {
    if (data.pieces && data.pieces !== 'none_pieces') {
      Pieces.chooseStyleAndApply(data.pieces);
    } else {
      Pieces.greatReset();
    }
    if (data.board && data.board !== 'none_board') {
      Boards.chooseStyleAndApply(data.board);
    } else {
      Boards.greatReset();
    }
  }).catch(function () {});
}

applyFromStorage();

//RE-APPLY WHEN THE USER PICKS A NEW STYLE IN THE POPUP

extApi.runtime.onMessage.addListener(function (request) {
  if (request && (request.pieces_init || request.board_init)) {
    applyFromStorage();
  }
  if (request && request.sounds_init) {
    syncSoundConfig();
  }
});

//SYNCHRONIZE SOUND CONFIGURATION AND WARM UP LICHESS'S SOUND CACHE
function syncSoundConfig() {
  if (window.top !== window) return;
  extApi.storage.sync.get('sounds').then(function (data) {
    const sounds = data.sounds || 'chessdotcomdefault';
    const config = {
      theme: sounds,
      urls: {
        castle: extApi.runtime.getURL('ressources/sounds/chessdotcomdefault/castle.mp3'),
        gameStart: extApi.runtime.getURL('ressources/sounds/chessdotcomdefault/game-start.mp3')
      }
    };
    try {
      document.documentElement.dataset.leSounds = JSON.stringify(config);
      document.dispatchEvent(new CustomEvent('leSoundConfig', { detail: config }));
    } catch (e) {}

    if (sounds !== 'none') {
      extApi.runtime.sendMessage({ sound_warmup: true }).catch(function () {});
    }
  }).catch(function () {});
}

syncSoundConfig();
