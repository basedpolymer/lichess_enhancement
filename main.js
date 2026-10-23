//APPLY THE SAVED PIECES AND BOARD STYLES
//extApi is defined in Boards.js (content scripts share one isolated-world scope)

function applyFromStorage() {
  //Defaults: DEFAULT_SETTINGS in background.js
  extApi.storage.sync.get({ pieces: 'neo', board: 'green' }).then(function (data) {
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
});

//PUBLISH THE SOUND SET TO THE PAGE: soundHook.js (lichess's MAIN world) reads <html data-le-sounds>

function publishSoundSet(sounds) {
  document.documentElement.dataset.leSounds = sounds || 'none';
}

extApi.storage.onChanged.addListener(function (changes, area) {
  if (area === 'sync' && changes.sounds) {
    publishSoundSet(changes.sounds.newValue);
  }
});

//ASK THE BACKGROUND TO PRE-DECODE THE REPLACED SOUNDS IN LICHESS'S SOUND CACHE,
//OTHERWISE THE FIRST CHECK/CHECKMATE OF A GAME PLAYS LATE (issue #15)

extApi.storage.sync.get({ sounds: 'chessdotcomdefault' }).then(function (data) {
  publishSoundSet(data.sounds);
  if (window.top === window && data.sounds && data.sounds !== 'none') {
    extApi.runtime.sendMessage({ sound_warmup: data.sounds }).catch(function () {});
  }
}).catch(function () {});
