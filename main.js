//APPLY THE SAVED PIECES AND BOARD STYLES, AND THE TEMPORARY PREVIEWS
//(hovering a set in the lichess menu or the popup, cycling with the keyboard shortcuts)
//extApi and LE come from settings.js (content scripts share one isolated-world scope)

var Styles = (function () {
  const saved = { pieces: null, board: null };
  const modules = { pieces: Pieces, board: Boards };

  //A set missing from the catalog (removed in an update) would show blank pieces: fall back to lichess's
  function render(kind, id) {
    if (LE.isNone(kind, id) || !LE.has(kind, id)) {
      modules[kind].greatReset();
    } else {
      modules[kind].chooseStyleAndApply(id);
    }
  }

  return {
    saved: (kind) => saved[kind],

    setSaved(kind, id) {
      saved[kind] = id;
      render(kind, id);
      //Read by the lichess menu styles: lichess's own set is not the one on the board
      const active = !LE.isNone(kind, id) && LE.has(kind, id);
      const attr = kind === 'pieces' ? 'lePieces' : 'leBoard';
      if (active) document.documentElement.dataset[attr] = id;
      else delete document.documentElement.dataset[attr];
    },

    //Show a set without saving it; null goes back to the saved one
    preview(kind, id) {
      render(kind, id === null || id === undefined ? saved[kind] : id);
    },
  };
})();

function applyFromStorage() {
  extApi.storage.sync
    .get({ pieces: LE.DEFAULTS.pieces, board: LE.DEFAULTS.board })
    .then(function (data) {
      Styles.setSaved('pieces', data.pieces);
      Styles.setSaved('board', data.board);
    })
    .catch(function () {});
}

applyFromStorage();

//RE-APPLY ON EVERY CHANGE: the popup, the lichess menu, the shortcuts, another tab or another synced device

LE.onChange(function (changes) {
  LE.KINDS.forEach(function (kind) {
    if (changes[kind]) {
      Styles.setSaved(kind, changes[kind].newValue === undefined ? LE.DEFAULTS[kind] : changes[kind].newValue);
    }
  });
  if (changes.sounds) {
    publishSoundSet(changes.sounds.newValue);
  }
});

//PREVIEWS FROM THE POPUP: it connects to the top frame while open, and closing it goes back to the saved sets

extApi.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'le-preview' || window.top !== window) return;
  port.onMessage.addListener(function (msg) {
    if (msg && LE.KINDS.includes(msg.kind)) Styles.preview(msg.kind, msg.id);
  });
  port.onDisconnect.addListener(function () {
    LE.KINDS.forEach(function (kind) {
      Styles.preview(kind, null);
    });
  });
});

//PUBLISH THE SOUND SET TO THE PAGE: soundHook.js (lichess's MAIN world) reads <html data-le-sounds>

function publishSoundSet(sounds) {
  document.documentElement.dataset.leSounds = sounds || 'none';
}

//ASK THE BACKGROUND TO PRE-DECODE THE REPLACED SOUNDS IN LICHESS'S SOUND CACHE,
//OTHERWISE THE FIRST CHECK/CHECKMATE OF A GAME PLAYS LATE (issue #15)

extApi.storage.sync.get({ sounds: LE.DEFAULTS.sounds }).then(function (data) {
  publishSoundSet(data.sounds);
  if (window.top === window && data.sounds && data.sounds !== 'none') {
    extApi.runtime.sendMessage({ sound_warmup: data.sounds }).catch(function () {});
  }
}).catch(function () {});
