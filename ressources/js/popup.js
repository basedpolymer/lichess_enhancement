//THE POPUP: one set picker (gallery.js) per tab, and the sound sets
//Hovering a set previews it on the active lichess tab, through a port to its content script: closing the popup
//closes the port, and the tab goes back to the saved sets (main.js)
//Only the open tab is built: the popup shows sooner, the other tabs are built the first time they open

(function () {
  const LICHESS_URL = /^https?:\/\/([a-z0-9-]+\.)?lichess1?\.org\//;
  const TABS = ['pieces', 'board', 'sounds'];
  //localStorage: read synchronously, so the popup opens on the right tab without a second layout
  const TAB_KEY = 'le_popup_tab';
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let port = null;
  let current = null;
  const galleries = {};

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
    if (!port) return;
    try {
      port.postMessage({ kind, id });
    } catch (e) {
      port = null;
    }
  }

  //PIECES AND BOARD PICKERS

  function galleryState(kind) {
    return { saved: state[kind], favorites: state[`fav_${kind}`] };
  }

  function buildGallery(kind) {
    const gallery = Gallery.create(kind, {
      onPreview: (id) => preview(kind, id),
      onChoose: (id) => {
        LE.choose(kind, id).catch((error) => console.error(error));
      },
      onFavorite: (id) => {
        LE.toggleFavorite(kind, id).catch((error) => console.error(error));
      },
    });
    if (state) gallery.update(galleryState(kind));
    $(`.tab-body[data-tab="${kind}"]`).appendChild(gallery.el);
    galleries[kind] = gallery;
    return gallery;
  }

  //SOUNDS: swap the enabled ruleset, save, then tell the background to flush lichess's sound cache

  let player = null;
  let soundsList = null;

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

  //Cards like the pieces and boards (same classes, ressources/css/gallery.css): a click picks the set and plays
  //it, the corner button only plays it
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const soundLabel = (id) => {
    const item = LE_CATALOG.sounds.find((s) => s[0] === id);
    return item && id !== 'none' ? `${item[2]} · ${item[1]}` : "Lichess's sounds";
  };

  //A set has no picture: bars drawn from its name, so that each set keeps its own look
  function soundPicture(id) {
    const bars = node('span', 'sound-bars');
    let seed = 7;
    for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    for (let i = 0; i < 7; i += 1) {
      seed = (seed * 137 + 187) % 9973;
      const bar = node('i');
      bar.style.height = `${20 + (seed % 80)}%`;
      bars.appendChild(bar);
    }
    return bars;
  }

  function buildSounds() {
    soundsList = node('div', 'le-gallery le-sounds');
    const scroll = node('div', 'le-scroll');
    let grid = null;
    let section;
    LE_CATALOG.sounds.forEach(([id, label, group]) => {
      if (id === 'none') return;
      if (group !== section) {
        section = group;
        const sec = node('section', 'le-sec');
        const head = node('h4', 'le-sec-head');
        head.append(node('span', null, group), node('small', 'le-count', LE_CATALOG.sounds.filter((s) => s[2] === group).length));
        grid = node('div', 'le-grid');
        sec.append(head, grid);
        scroll.appendChild(sec);
      }
      const card = node('div', 'le-card');
      card.dataset.id = id;
      const pick = node('button', 'le-pick');
      pick.type = 'button';
      pick.title = label;
      const thumb = node('span', 'le-thumb');
      thumb.appendChild(soundPicture(id));
      pick.append(thumb, node('span', 'le-name', label));
      const listen = node('button', 'sound-play', '▶');
      listen.type = 'button';
      listen.title = `Listen: ${label}`;
      card.append(pick, listen);
      grid.appendChild(card);
    });
    scroll.addEventListener('click', (e) => {
      const card = e.target.closest('.le-card');
      if (!card) return;
      play(card.dataset.id);
      if (!e.target.closest('.sound-play')) chooseSound(card.dataset.id).catch((error) => console.error(error));
    });

    const foot = node('div', 'le-foot');
    const reset = node('button', 'le-reset', "Use lichess's sounds");
    reset.type = 'button';
    reset.addEventListener('click', () => chooseSound('none').catch((error) => console.error(error)));
    foot.append(node('span', 'le-active'), reset);

    soundsList.append(scroll, foot);
    $('.tab-body[data-tab="sounds"]').appendChild(soundsList);
    renderSounds();
  }

  function renderSounds() {
    if (!soundsList || !state) return;
    soundsList.querySelectorAll('.le-card').forEach((card) => card.classList.toggle('le-on', card.dataset.id === state.sounds));
    soundsList.querySelector('.le-active').replaceChildren('Active: ', node('b', null, soundLabel(state.sounds)));
    soundsList.querySelector('.le-reset').hidden = !state.sounds || state.sounds === 'none';
  }

  //TABS

  function setTab(tab) {
    if (!TABS.includes(tab)) tab = 'pieces';
    current = tab;
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    document.querySelectorAll('.tab-body').forEach((body) => (body.hidden = body.dataset.tab !== tab));
    if (tab === 'sounds') {
      if (!soundsList) buildSounds();
      //Like the galleries: the list grows down to the bottom of the popup
      const scroll = soundsList.querySelector('.le-scroll');
      const foot = soundsList.querySelector('.le-foot');
      scroll.style.maxHeight = `${Math.floor(586 - scroll.getBoundingClientRect().top - foot.offsetHeight)}px`;
      scroll.style.minHeight = scroll.style.maxHeight;
      return;
    }
    const gallery = galleries[tab] || buildGallery(tab);
    gallery.fit(586);
    if (state) gallery.scrollToActive();
    gallery.focusSearch();
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setTab(b.dataset.tab);
    try {
      localStorage.setItem(TAB_KEY, b.dataset.tab);
    } catch (err) {}
  });

  document.querySelector('.tabs [data-tab="pieces"] small').textContent = LE.count('pieces');
  document.querySelector('.tabs [data-tab="board"] small').textContent = LE.count('board');
  document.querySelector('.tabs [data-tab="sounds"] small').textContent = LE_CATALOG.sounds.length - 1;

  let savedTab = null;
  try {
    savedTab = localStorage.getItem(TAB_KEY);
  } catch (err) {}
  setTab(savedTab);

  //STATE

  function render() {
    Object.keys(galleries).forEach((kind) => galleries[kind].update(galleryState(kind)));
    renderSounds();
  }

  LE.load()
    .then((data) => {
      state = data;
      render();
      if (galleries[current]) galleries[current].scrollToActive();
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
