//THE SET PICKER SHARED BY THE LICHESS MENU (dasher.js) AND THE POPUP (popup.js):
//a search field, one chip per section, then favorites, recently used sets and one section per source,
//every set shown with a thumbnail and its name. Styles: ressources/css/gallery.css
//
//Gallery.create(kind, { onPreview(id | null), onChoose(id), onFavorite(id) }) -> {
//  el,                          the element to insert
//  update({ saved, favorites, recent }),
//  fit(bottom),                 let the list grow down to `bottom` (px from the top of the window)
//  focusSearch(),
// }
//onPreview(id) fires on hover / keyboard focus, onPreview(null) when the pointer or the focus leaves the list
//Needs catalog.js and settings.js loaded first

var Gallery = (function () {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function h(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function card(kind, id) {
    const label = LE.label(kind, id);
    const node = h('div', 'le-card');
    node.dataset.id = id;
    node.dataset.q = norm(label);

    const pick = h('button', 'le-pick');
    pick.type = 'button';
    pick.title = label;
    const thumb = h('span', kind === 'pieces' ? 'le-thumb le-thumb-piece' : 'le-thumb le-thumb-board');
    const img = h('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.src = LE.thumbUrl(kind, id);
    thumb.appendChild(img);
    pick.append(thumb, h('span', 'le-name', label));

    const star = h('button', 'le-star', '★');
    star.type = 'button';
    star.title = `Favorite: ${label}`;
    star.setAttribute('aria-pressed', 'false');

    node.append(pick, star);
    return node;
  }

  function section(key, title, chip) {
    const sec = h('section', 'le-sec');
    sec.dataset.sec = key;
    sec.dataset.chip = chip;
    const head = h('h4', 'le-sec-head');
    head.append(h('span', null, title), h('small', 'le-count'));
    sec.append(head, h('div', 'le-grid'));
    return sec;
  }

  function create(kind, handlers) {
    const total = LE.count(kind);
    const root = h('div', 'le-gallery');
    root.dataset.kind = kind;

    //search + chips
    const bar = h('div', 'le-bar');
    const search = h('input', 'le-search');
    search.type = 'search';
    search.placeholder = `Search ${total} ${kind === 'pieces' ? 'piece sets' : 'boards'}`;
    search.setAttribute('aria-label', search.placeholder);
    search.spellcheck = false;
    const chips = h('div', 'le-chips');
    bar.append(search, chips);

    //sections
    const scroll = h('div', 'le-scroll');
    const favSec = section('fav', '★ Favorites', '★ Favorites');
    const recentSec = section('recent', 'Recently used', 'Recent');
    scroll.append(favSec, recentSec);
    const groupSecs = LE.groups(kind).map((g, i) => {
      const sec = section(`g${i}`, g.group.replace(' - ', ' · '), g.short);
      sec.classList.add('le-sec-group');
      const grid = sec.querySelector('.le-grid');
      g.items.forEach(([id]) => grid.appendChild(card(kind, id)));
      sec.querySelector('.le-count').textContent = g.items.length;
      scroll.appendChild(sec);
      return sec;
    });
    const empty = h('p', 'le-empty', 'No set matches this search');
    empty.hidden = true;
    scroll.appendChild(empty);

    //active set + way back to lichess's own
    const foot = h('div', 'le-foot');
    const active = h('span', 'le-active');
    const reset = h('button', 'le-reset', kind === 'pieces' ? "Use lichess's pieces" : "Use lichess's board");
    reset.type = 'button';
    foot.append(active, reset);

    root.append(bar, scroll, foot);

    const sections = [favSec, recentSec, ...groupSecs];
    sections.forEach((sec) => {
      const chip = h('button', 'le-chip', sec.dataset.chip);
      chip.type = 'button';
      chip.dataset.sec = sec.dataset.sec;
      chips.appendChild(chip);
    });

    let state = { saved: null, favorites: [], recent: [] };
    let previewed = null;

    function preview(id) {
      if (id === previewed) return;
      previewed = id;
      handlers.onPreview(id);
    }

    //FAVORITES / RECENT: rebuilt from the lists, hidden while empty
    function fillList(sec, ids) {
      const grid = sec.querySelector('.le-grid');
      const key = ids.join(',');
      if (grid.dataset.ids !== key) {
        grid.dataset.ids = key;
        grid.replaceChildren(...ids.map((id) => card(kind, id)));
      }
      sec.querySelector('.le-count').textContent = ids.length;
    }

    function markCards() {
      root.querySelectorAll('.le-card').forEach((c) => {
        const id = c.dataset.id;
        c.classList.toggle('le-on', id === state.saved);
        const fav = state.favorites.includes(id);
        c.classList.toggle('le-fav', fav);
        c.querySelector('.le-star').setAttribute('aria-pressed', String(fav));
      });
    }

    function update(next) {
      state = Object.assign({}, state, next);
      fillList(favSec, state.favorites);
      fillList(recentSec, state.recent.filter((id) => id !== state.saved).slice(0, 6));
      markCards();
      const isExt = !LE.isNone(kind, state.saved) && LE.has(kind, state.saved);
      active.replaceChildren('Active: ', h('b', null, LE.label(kind, isExt ? state.saved : null)));
      reset.hidden = !isExt;
      applyFilter();
    }

    //SEARCH: lists matching sets by section; favorites and recent are hidden meanwhile (they'd repeat them)
    function applyFilter() {
      const q = norm(search.value.trim());
      let shown = 0;
      groupSecs.forEach((sec) => {
        let n = 0;
        sec.querySelectorAll('.le-card').forEach((c) => {
          const ok = !q || c.dataset.q.includes(q) || c.dataset.id.includes(q);
          c.hidden = !ok;
          n += ok ? 1 : 0;
        });
        sec.hidden = n === 0;
        shown += n;
      });
      [favSec, recentSec].forEach((sec) => {
        sec.hidden = !!q || !sec.querySelector('.le-card');
      });
      empty.hidden = shown > 0;
      chips.querySelectorAll('.le-chip').forEach((chip) => {
        chip.hidden = scroll.querySelector(`[data-sec="${chip.dataset.sec}"]`).hidden;
      });
      spy();
    }

    //CHIPS: jump to a section, and follow the scroll
    function spy() {
      let current = null;
      sections.forEach((sec) => {
        if (!sec.hidden && sec.offsetTop <= scroll.scrollTop + 8) current = sec.dataset.sec;
      });
      if (!current) current = (sections.find((sec) => !sec.hidden) || {}).dataset?.sec;
      chips.querySelectorAll('.le-chip').forEach((chip) => chip.classList.toggle('le-on', chip.dataset.sec === current));
    }

    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.le-chip');
      if (!chip) return;
      const sec = scroll.querySelector(`[data-sec="${chip.dataset.sec}"]`);
      scroll.scrollTo({ top: sec.offsetTop, behavior: 'smooth' });
    });
    scroll.addEventListener('scroll', spy, { passive: true });

    search.addEventListener('input', () => {
      applyFilter();
      scroll.scrollTop = 0;
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        //Enter picks the first match
        const first = groupSecs.flatMap((sec) => [...sec.querySelectorAll('.le-card:not([hidden])')])[0];
        if (first) handlers.onChoose(first.dataset.id);
      } else if (e.key === 'Escape' && search.value) {
        e.stopPropagation();
        search.value = '';
        applyFilter();
      } else if (e.key === 'ArrowDown') {
        const first = scroll.querySelector('.le-sec:not([hidden]) .le-card:not([hidden]) .le-pick');
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    //HOVER / FOCUS PREVIEWS, CLICKS
    scroll.addEventListener('mouseover', (e) => {
      const c = e.target.closest('.le-card');
      if (c) preview(c.dataset.id);
    });
    scroll.addEventListener('mouseleave', () => preview(null));
    scroll.addEventListener('focusin', (e) => {
      const c = e.target.closest('.le-card');
      if (c) preview(c.dataset.id);
    });
    root.addEventListener('focusout', (e) => {
      if (!root.contains(e.relatedTarget)) preview(null);
    });
    scroll.addEventListener('click', (e) => {
      const c = e.target.closest('.le-card');
      if (!c) return;
      if (e.target.closest('.le-star')) handlers.onFavorite(c.dataset.id);
      else handlers.onChoose(c.dataset.id);
    });
    reset.addEventListener('click', () => handlers.onChoose(LE.NONE[kind]));

    //Arrow keys move between the cards of the grid
    scroll.addEventListener('keydown', (e) => {
      const pick = e.target.closest('.le-pick');
      if (!pick || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const picks = [...scroll.querySelectorAll('.le-sec:not([hidden]) .le-card:not([hidden]) .le-pick')];
      const i = picks.indexOf(pick);
      const cols = Math.max(1, Math.round(pick.closest('.le-grid').clientWidth / pick.parentElement.offsetWidth));
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
      if (i + step < 0 && e.key === 'ArrowUp') return search.focus();
      const next = picks[Math.min(picks.length - 1, Math.max(0, i + step))];
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    });

    let fitBottom = null;
    function fit(bottom) {
      fitBottom = bottom;
      if (!scroll.offsetParent) return;
      const top = scroll.getBoundingClientRect().top;
      scroll.style.maxHeight = `${Math.max(180, Math.floor(bottom - top - foot.offsetHeight))}px`;
      spy();
    }
    //The chips wrap to another line when favorites / recent appear, or unwrap while searching
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        if (fitBottom !== null) fit(fitBottom);
      }).observe(bar);
    }

    return {
      el: root,
      update,
      fit,
      focusSearch: () => search.focus({ preventScroll: true }),
      scrollToActive() {
        const on = scroll.querySelector('.le-sec-group .le-card.le-on');
        //.le-scroll is the offsetParent of the cards (position: relative)
        if (on) scroll.scrollTop = on.offsetTop - scroll.clientHeight / 3;
      },
    };
  }

  return { create };
})();
