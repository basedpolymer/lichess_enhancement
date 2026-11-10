//SAVED CHOICES AND FAVORITES, SHARED BY THE CONTENT SCRIPTS AND THE POPUP
//Everything lives in storage.sync: { pieces, board, sounds, fav_pieces, fav_board }
//Needs catalog.js loaded first

//browser (Firefox, promise-native) or chrome (Chromium); var: content scripts share one isolated-world scope
var extApi = typeof browser !== 'undefined' ? browser : chrome;

var LE = (function () {
  //Applied when a setting has never been chosen. Keep in sync with DEFAULT_SETTINGS in background.js
  const DEFAULTS = { pieces: 'neo', board: 'green', sounds: 'chessdotcomdefault' };
  //Values meaning "lichess's own pieces / board"
  const NONE = { pieces: 'none_pieces', board: 'none_board' };
  const KINDS = ['pieces', 'board'];

  const STORAGE_DEFAULTS = Object.assign({}, DEFAULTS, {
    fav_pieces: [],
    fav_board: [],
  });

  //kind -> Map(id -> { id, label, group, short })
  const index = {};
  KINDS.forEach((kind) => {
    index[kind] = new Map();
    LE_CATALOG[kind].forEach((g) => {
      g.items.forEach(([id, label]) => index[kind].set(id, { id, label, group: g.group, short: g.short }));
    });
  });

  const isNone = (kind, id) => !id || id === NONE[kind];
  const has = (kind, id) => index[kind].has(id);
  const known = (kind, list) => (Array.isArray(list) ? list.filter((id) => has(kind, id)) : []);

  return {
    DEFAULTS,
    NONE,
    KINDS,
    isNone,
    has,
    groups: (kind) => LE_CATALOG[kind],
    ids: (kind) => [...index[kind].keys()],
    count: (kind) => index[kind].size,

    label(kind, id) {
      //Not "Lichess's pieces": the catalog has a Lichess section too
      if (isNone(kind, id)) return "None · lichess's own setting";
      const item = index[kind].get(id);
      return item ? item.label : id;
    },

    pieceUrl: (id, code) =>
      extApi.runtime.getURL(`ressources/pieces/${id}/${code}${id === 'random' ? '.gif' : '.webp'}`),
    boardUrl: (id) => extApi.runtime.getURL(`ressources/boards/${id}.webp`),
    //Built by scripts/buildThumbs.js
    thumbUrl: (kind, id) =>
      extApi.runtime.getURL(`ressources/thumbs/${kind === 'pieces' ? 'pieces' : 'boards'}/${id}.webp`),

    //{ pieces, board, sounds, fav_pieces, fav_board }, ids unknown to the catalog dropped from the favorites
    async load() {
      const data = await extApi.storage.sync.get(STORAGE_DEFAULTS);
      KINDS.forEach((kind) => {
        data[`fav_${kind}`] = known(kind, data[`fav_${kind}`]);
      });
      return data;
    },

    //Save a choice: a set id, or NONE[kind] for lichess's own
    async choose(kind, id) {
      await extApi.storage.sync.set({ [kind]: id });
    },

    //Add or remove a favorite; resolves to true when the set is now a favorite
    async toggleFavorite(kind, id) {
      const key = `fav_${kind}`;
      const data = await extApi.storage.sync.get({ [key]: [] });
      const favs = known(kind, data[key]);
      const isFav = !favs.includes(id);
      await extApi.storage.sync.set({ [key]: isFav ? favs.concat(id) : favs.filter((x) => x !== id) });
      return isFav;
    },

    //cb(changes) for every change in storage.sync (from this page, another tab, the popup or another device)
    onChange(cb) {
      extApi.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') cb(changes);
      });
    },
  };
})();
