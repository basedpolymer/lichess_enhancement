//KEYBOARD SHORTCUTS ON LICHESS PAGES
//Alt+Shift+← / →: previous / next piece set     Alt+Shift+↑ / ↓: previous / next board
//(Option+Shift on macOS). They cycle through the favorites when there are at least two, otherwise through
//every set, lichess's own first. The new set shows at once and is saved once the keys rest: storage.sync only
//allows a few writes per minute. Ignored while typing (chat, search fields...)
//Needs catalog.js, settings.js and main.js (Styles)

(function () {
  if (window.top !== window) return;

  const KEYS = {
    ArrowLeft: ['pieces', -1],
    ArrowRight: ['pieces', 1],
    ArrowUp: ['board', -1],
    ArrowDown: ['board', 1],
  };
  const SAVE_DELAY = 900;

  const favorites = { pieces: [], board: [] };
  const pending = { pieces: null, board: null };
  let saveTimer = null;

  LE.load()
    .then((data) => {
      LE.KINDS.forEach((kind) => (favorites[kind] = data[`fav_${kind}`]));
    })
    .catch(() => {});

  LE.onChange((changes) => {
    LE.KINDS.forEach((kind) => {
      const change = changes[`fav_${kind}`];
      if (change) favorites[kind] = (change.newValue || []).filter((id) => LE.has(kind, id));
    });
  });

  function typing(target) {
    if (!target || !(target instanceof Element)) return false;
    return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  function save() {
    saveTimer = null;
    LE.KINDS.forEach((kind) => {
      const id = pending[kind];
      pending[kind] = null;
      if (id === null || id === Styles.saved(kind)) return;
      //Saved here right away, so a key pressed before storage.onChanged comes back continues from this set
      Styles.setSaved(kind, id);
      LE.choose(kind, id).catch(() => {});
    });
  }

  //TOAST: what is shown now, its position in the cycle

  let toast = null;
  let toastTimer = null;

  function showToast(kind, id, position, total, fromFavorites) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'le-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    const parts = [];
    if (!LE.isNone(kind, id)) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = LE.thumbUrl(kind, id);
      if (kind === 'board') img.className = 'le-toast-board';
      parts.push(img);
    }
    const text = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = LE.label(kind, id);
    const detail = document.createElement('small');
    const mod = /Mac/i.test(navigator.platform) ? '⌥⇧' : 'Alt+Shift+';
    const keys = mod + (kind === 'pieces' ? '←/→' : '↑/↓');
    detail.textContent = `${kind === 'pieces' ? 'Pieces' : 'Board'} ${position}/${total}${fromFavorites ? ' · favorites' : ''} · ${keys}`;
    text.append(title, detail);
    parts.push(text);
    toast.replaceChildren(...parts);
    //Next frame, so the transition runs on a new toast too
    requestAnimationFrame(() => toast.classList.add('le-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('le-show'), 1600);
  }

  //Capture phase on window: runs before lichess's own key bindings
  window.addEventListener(
    'keydown',
    (e) => {
      const key = KEYS[e.key];
      if (!key || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const [kind, step] = key;
      const favs = favorites[kind].filter((id) => LE.has(kind, id));
      const fromFavorites = favs.length >= 2;
      const cycle = fromFavorites ? favs : [LE.NONE[kind], ...LE.ids(kind)];
      const current = pending[kind] !== null ? pending[kind] : Styles.saved(kind);
      const at = cycle.indexOf(LE.isNone(kind, current) ? LE.NONE[kind] : current);
      const next = at < 0 ? (step > 0 ? 0 : cycle.length - 1) : (at + step + cycle.length) % cycle.length;
      const id = cycle[next];

      pending[kind] = id;
      Styles.preview(kind, id);
      showToast(kind, id, next + 1, cycle.length, fromFavorites);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DELAY);
    },
    true
  );
})();
