//THE POPUP: one set picker (gallery.js) per tab, the sound sets, and a small board showing the choice
//Hovering a set previews it on the small board and on the active lichess tab, through a port to its content
//script: closing the popup closes the port, and the tab goes back to the saved sets (main.js)

(function () {
  const LICHESS_URL = /^https?:\/\/([a-z0-9-]+\.)?lichess1?\.org\//;
  const TAB_KEY = 'popup_tab';
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let port = null;
  const galleries = {};
  //What the small board shows while hovering (null: the saved set)
  const hovered = { pieces: null, board: null };

  if (/Mac/i.test(navigator.platform)) {
    document.querySelectorAll('kbd.mod').forEach((k) => (k.textContent = '⌥ ⇧'));
  }

  //PREVIEW ON THE ACTIVE LICHESS TAB

  async function activeLichessTab() {
    const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
    return tab && LICHESS_URL.test(tab.url || '') ? tab : null;
  }

  activeLichessTab()
    .then((tab) => {
      if (!tab) return;
      port = extApi.tabs.connect(tab.id, { name: 'le-preview', frameId: 0 });
      port.onDisconnect.addListener(() => {
        //No content script there (page loaded before the extension): nothing to preview
        void (extApi.runtime && extApi.runtime.lastError);
        port = null;
      });
    })
    .catch(() => {});

  function preview(kind, id) {
    hovered[kind] = id;
    renderBoard();
    if (port) {
      try {
        port.postMessage({ kind, id });
      } catch (e) {
        port = null;
      }
    }
  }

  //SMALL BOARD: the starting position with the hovered or saved sets

  const START = ['rnbqkbnr', 'pppppppp', '', '', '', '', 'PPPPPPPP', 'RNBQKBNR'];
  //Lichess's own pieces are not bundled: drawn with chess glyphs (U+FE0E: no emoji pawn)
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
  const miniBoard = $('#mini_board');
  const squares = [];
  START.forEach((row, rank) => {
    [...row].forEach((letter, file) => {
      const piece = document.createElement('span');
      const white = letter === letter.toUpperCase();
      piece.className = `mp ${white ? 'white' : 'black'}`;
      piece.style.gridArea = `${rank + 1} / ${file + 1}`;
      piece.dataset.code = (white ? 'w' : 'b') + letter.toLowerCase();
      miniBoard.appendChild(piece);
      squares.push(piece);
    });
  });

  function renderBoard() {
    if (!state) return;
    const pieces = hovered.pieces !== null ? hovered.pieces : state.pieces;
    const board = hovered.board !== null ? hovered.board : state.board;
    const lichessBoard = LE.isNone('board', board) || !LE.has('board', board);
    miniBoard.classList.toggle('lichess-board', lichessBoard);
    miniBoard.style.backgroundImage = lichessBoard ? '' : `url("${LE.boardUrl(board)}")`;
    const lichessPieces = LE.isNone('pieces', pieces) || !LE.has('pieces', pieces);
    squares.forEach((sq) => {
      sq.classList.toggle('glyph', lichessPieces);
      sq.textContent = lichessPieces ? GLYPHS[sq.dataset.code[1]] : '';
      sq.style.backgroundImage = lichessPieces ? '' : `url("${LE.pieceUrl(pieces, sq.dataset.code)}")`;
    });
  }

  //CURRENT CHOICES

  function soundLabel(id) {
    const item = LE_CATALOG.sounds.find(([value]) => value === id);
    return item ? item[1] : id;
  }

  function renderCurrent() {
    LE.KINDS.forEach((kind) => {
      const dd = $(`#current_${kind}`);
      dd.textContent = LE.label(kind, LE.has(kind, state[kind]) ? state[kind] : null);
      dd.classList.toggle('fav', state[`fav_${kind}`].includes(state[kind]));
    });
    $('#current_sounds').textContent = soundLabel(state.sounds);
  }

  //TABS

  function setTab(tab) {
    if (!['pieces', 'board', 'sounds'].includes(tab)) tab = 'pieces';
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    document.querySelectorAll('.tab-body').forEach((body) => (body.hidden = body.dataset.tab !== tab));
    const gallery = galleries[tab];
    if (gallery) {
      gallery.fit(586);
      gallery.scrollToActive();
      gallery.focusSearch();
    }
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setTab(b.dataset.tab);
    extApi.storage.local.set({ [TAB_KEY]: b.dataset.tab }).catch(() => {});
  });

  document.querySelector('.tabs [data-tab="pieces"] small').textContent = LE.count('pieces');
  document.querySelector('.tabs [data-tab="board"] small').textContent = LE.count('board');
  document.querySelector('.tabs [data-tab="sounds"] small').textContent = LE_CATALOG.sounds.length - 1;

  //PIECES AND BOARD PICKERS

  LE.KINDS.forEach((kind) => {
    galleries[kind] = Gallery.create(kind, {
      onPreview: (id) => preview(kind, id),
      onChoose: (id) => {
        LE.choose(kind, id).catch((error) => console.error(error));
      },
      onFavorite: (id) => {
        LE.toggleFavorite(kind, id).catch((error) => console.error(error));
      },
    });
    $(`.tab-body[data-tab="${kind}"]`).appendChild(galleries[kind].el);
  });

  //SOUNDS: swap the enabled ruleset, save, then tell the background to flush lichess's sound cache

  let player = null;

  function play(id) {
    if (player) player.forEach((audio) => audio.pause());
    const url = (name) => extApi.runtime.getURL(`ressources/sounds/${id}/${name}.mp3`);
    const move = new Audio(url('move'));
    const capture = new Audio(url('capture'));
    player = [move, capture];
    move.play().catch(() => {});
    setTimeout(() => capture.play().catch(() => {}), 450);
  }

  async function chooseSound(value) {
    const enabled = await extApi.declarativeNetRequest.getEnabledRulesets();
    await extApi.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: enabled.filter((id) => id !== value),
      enableRulesetIds: [value],
    });
    await extApi.storage.sync.set({ sounds: value });
    const tab = await activeLichessTab();
    if (tab) extApi.runtime.sendMessage({ sounds_init: value, tab: tab.id }).catch(() => {});
  }

  const soundsList = $('#sounds_list');
  LE_CATALOG.sounds.forEach(([id, label]) => {
    const li = document.createElement('li');
    li.dataset.id = id;
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'sound-pick';
    pick.textContent = label;
    li.appendChild(pick);
    if (id !== 'none') {
      const listen = document.createElement('button');
      listen.type = 'button';
      listen.className = 'sound-play';
      listen.title = `Listen: ${label}`;
      listen.textContent = '▶';
      li.appendChild(listen);
    }
    soundsList.appendChild(li);
  });

  soundsList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (e.target.closest('.sound-play')) play(li.dataset.id);
    else chooseSound(li.dataset.id).catch((error) => console.error(error));
  });

  function renderSounds() {
    soundsList.querySelectorAll('li').forEach((li) => li.classList.toggle('on', li.dataset.id === state.sounds));
  }

  //STATE

  function render() {
    LE.KINDS.forEach((kind) => {
      galleries[kind].update({
        saved: state[kind],
        favorites: state[`fav_${kind}`],
        recent: state[`recent_${kind}`],
      });
    });
    renderBoard();
    renderCurrent();
    renderSounds();
  }

  Promise.all([LE.load(), extApi.storage.local.get({ [TAB_KEY]: 'pieces' })])
    .then(([data, local]) => {
      state = data;
      render();
      setTab(local[TAB_KEY]);
    })
    .catch((error) => console.error(error));

  LE.onChange(() => {
    LE.load()
      .then((data) => {
        state = data;
        render();
      })
      .catch(() => {});
  });
})();
