//THE EXTENSION'S SETS INSIDE LICHESS'S OWN MENU (user menu > Piece set / Board)
//A "Lichess | Enhancement" switch sits above lichess's list. The Enhancement side hides lichess's list, widens
//the menu and lets the set picker (gallery.js) fill the window height. Hovering a set previews it on the real
//board, clicking saves it; picking one of lichess's own sets goes back to lichess's pieces / board.
//
//Relies on lichess's markup: #dasher_app .sub.piece / .sub.board > .list. lichess rebuilds the sub-menu each time
//it opens, so a MutationObserver adds the switch again. If lichess changes its markup, nothing is added and the
//popup still works
//Needs catalog.js, settings.js, main.js (Styles) and gallery.js

(function () {
  if (window.top !== window) return;

  const SUB_KINDS = { piece: 'pieces', board: 'board' };
  //Last side picked in the menu, per kind (storage.local: a per-device UI detail)
  const TAB_KEY = 'dasher_tab';

  let state = null;
  let tabs = {};
  const open = new Set(); //{ kind, sub, panel, gallery, buttons }

  const known = (kind, list) => (Array.isArray(list) ? list.filter((id) => LE.has(kind, id)) : []);
  const stateFor = (kind) => ({
    saved: state[kind],
    favorites: known(kind, state[`fav_${kind}`]),
    recent: known(kind, state[`recent_${kind}`]),
  });

  const extActive = (kind) => !LE.isNone(kind, state[kind]) && LE.has(kind, state[kind]);

  function rememberTab(kind, tab) {
    tabs[kind] = tab;
    extApi.storage.local.set({ [TAB_KEY]: tabs }).catch(() => {});
  }

  function fit(entry) {
    if (entry.panel.classList.contains('le-open')) entry.gallery.fit(window.innerHeight - 10);
  }

  function setTab(entry, tab, focus) {
    const ext = tab === 'ext';
    entry.panel.classList.toggle('le-open', ext);
    entry.buttons.forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    if (ext) {
      //Layout first (the menu widens), then size the list to the window
      requestAnimationFrame(() => {
        fit(entry);
        entry.gallery.scrollToActive();
        if (focus) entry.gallery.focusSearch();
      });
    }
  }

  function decorate(sub) {
    const kind = SUB_KINDS[Object.keys(SUB_KINDS).find((c) => sub.classList.contains(c))];
    const list = sub.querySelector(':scope > .list');
    if (!kind || !list || sub.querySelector(':scope > .le-switch')) return;

    const sw = document.createElement('div');
    sw.className = 'le-switch';
    sw.setAttribute('role', 'tablist');
    const buttons = [
      ['lichess', 'Lichess'],
      ['ext', 'Enhancement'],
    ].map(([tab, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.tab = tab;
      b.setAttribute('role', 'tab');
      b.textContent = text;
      if (tab === 'ext') {
        const n = document.createElement('small');
        n.textContent = LE.count(kind);
        b.appendChild(n);
      }
      sw.appendChild(b);
      return b;
    });

    const panel = document.createElement('div');
    panel.className = 'le-panel';
    const gallery = Gallery.create(kind, {
      onPreview: (id) => Styles.preview(kind, id),
      onChoose: (id) => {
        LE.choose(kind, id).catch(() => {});
      },
      onFavorite: (id) => {
        LE.toggleFavorite(kind, id).catch(() => {});
      },
    });
    panel.appendChild(gallery.el);
    gallery.update(stateFor(kind));

    sub.insertBefore(sw, list);
    sub.insertBefore(panel, list);

    const entry = { kind, sub, panel, gallery, buttons };
    open.add(entry);

    sw.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      rememberTab(kind, b.dataset.tab);
      setTab(entry, b.dataset.tab, true);
    });

    //One of lichess's own sets: give the board back to lichess
    sub.addEventListener(
      'click',
      (e) => {
        const b = e.target.closest('button');
        if (b && b.parentElement === sub.querySelector(':scope > .list') && extActive(kind)) {
          LE.choose(kind, LE.NONE[kind]).catch(() => {});
        }
      },
      true
    );

    //Never chosen a side yet: open where the active set is
    setTab(entry, tabs[kind] || (extActive(kind) ? 'ext' : 'lichess'), false);
  }

  function scan() {
    if (!state) return;
    document.querySelectorAll('#dasher_app .sub.piece, #dasher_app .sub.board').forEach(decorate);
    open.forEach((entry) => {
      if (!entry.panel.isConnected) open.delete(entry);
    });
  }

  Promise.all([LE.load(), extApi.storage.local.get({ [TAB_KEY]: {} })])
    .then(([data, local]) => {
      state = data;
      tabs = local[TAB_KEY] || {};
      scan();
    })
    .catch(() => {});

  LE.onChange((changes) => {
    if (!state) return;
    Object.keys(changes).forEach((key) => {
      if (key in state) state[key] = changes[key].newValue === undefined ? LE.DEFAULTS[key] || [] : changes[key].newValue;
    });
    open.forEach((entry) => entry.gallery.update(stateFor(entry.kind)));
  });

  //The user menu is created on first use, under the header
  new MutationObserver(scan).observe(document.getElementById('top') || document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', () => open.forEach(fit), { passive: true });
})();
