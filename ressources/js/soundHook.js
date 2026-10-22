(function () {
  if (window.__leSoundHookInstalled) return;
  window.__leSoundHookInstalled = true;

  let currentConfig = {
    theme: 'chessdotcomdefault',
    urls: {}
  };

  let lastCheckPlayedAt = 0;
  let pendingMoveTimer = null;
  let startedGameIds = new Set();
  let hooksApplied = false;

  function updateConfig(newConfig) {
    if (!newConfig) return;
    currentConfig = Object.assign(currentConfig, newConfig);
    if (window.site && window.site.sound) {
      applyHooks();
      ensureCustomPaths();
      loadCustomSounds();
      checkGameStart();
    }
  }

  // Listen for config events from content script (main.js)
  document.addEventListener('leSoundConfig', function (e) {
    if (e && e.detail) updateConfig(e.detail);
  });

  // Check dataset if already populated on <html>
  try {
    if (document.documentElement.dataset.leSounds) {
      updateConfig(JSON.parse(document.documentElement.dataset.leSounds));
    }
  } catch (e) {}

  window.__setLichessEnhancementSoundConfig = updateConfig;

  function isEnabled() {
    return currentConfig.theme && currentConfig.theme !== 'none';
  }

  function isChessComDefault() {
    return currentConfig.theme === 'chessdotcomdefault';
  }

  function getChessground() {
    try {
      if (typeof window.lichess?.chessground === 'function') {
        return window.lichess.chessground();
      }
      return window.lichess?.chessground || null;
    } catch (e) {
      return null;
    }
  }

  function getPieceAt(cg, sq) {
    if (!cg || !cg.state || !cg.state.pieces) return null;
    if (typeof cg.state.pieces.get === 'function') {
      return cg.state.pieces.get(sq) || null;
    }
    return cg.state.pieces[sq] || null;
  }

  function isLastMoveCastling(o, cg) {
    if (o?.castle) return true;
    if (o?.san && o.san.startsWith('O-O')) return true;
    if (!cg || !cg.state) return false;
    const lastMove = cg.state.lastMove;
    if (!lastMove || !Array.isArray(lastMove) || lastMove.length < 2) return false;
    const [orig, dest] = lastMove;
    const piece = getPieceAt(cg, dest);
    if (!piece || piece.role !== 'king') return false;

    // Standard chess castling squares
    if (piece.color === 'white' && orig === 'e1' && (dest === 'g1' || dest === 'c1')) return true;
    if (piece.color === 'black' && orig === 'e8' && (dest === 'g8' || dest === 'c8')) return true;

    // File distance > 1 for king move (covers Chess960 castling as well)
    const origFile = orig.charCodeAt(0) - 97;
    const destFile = dest.charCodeAt(0) - 97;
    if (Math.abs(origFile - destFile) > 1) return true;

    return false;
  }

  function cancelPendingMove() {
    if (pendingMoveTimer) {
      clearTimeout(pendingMoveTimer);
      pendingMoveTimer = null;
    }
  }

  function silenceSound(name) {
    try {
      const sound = window.site && window.site.sound;
      if (!sound) return;
      const path = sound.paths?.get(name) || (typeof sound.resolvePath === 'function' ? sound.resolvePath(name) : null);
      if (!path) return;
      const instance = sound.sounds?.get(path);
      if (instance && instance.node && sound.ctx) {
        instance.node.gain.setValueAtTime(0, sound.ctx.currentTime);
        setTimeout(() => {
          try {
            if (instance.node && sound.ctx) {
              const vol = typeof sound.getVolume === 'function' ? sound.getVolume() : 1;
              instance.node.gain.setValueAtTime(vol, sound.ctx.currentTime);
            }
          } catch (e) {}
        }, 50);
      }
    } catch (e) {}
  }

  function ensureCustomPaths() {
    const sound = window.site && window.site.sound;
    if (!sound || !isChessComDefault()) return;
    if (currentConfig.urls?.castle && sound.paths) {
      sound.paths.set('castle', currentConfig.urls.castle);
    }
    if (currentConfig.urls?.gameStart && sound.paths) {
      sound.paths.set('gameStart', currentConfig.urls.gameStart);
    }
  }

  function loadCustomSounds() {
    const sound = window.site && window.site.sound;
    if (!sound || typeof sound.load !== 'function') return;

    if (isChessComDefault()) {
      ensureCustomPaths();
      if (currentConfig.urls?.castle) {
        sound.load('castle', currentConfig.urls.castle).catch(() => {});
      }
      if (currentConfig.urls?.gameStart) {
        sound.load('gameStart', currentConfig.urls.gameStart).catch(() => {});
      }
    }
  }

  function checkGameStart() {
    if (!isChessComDefault()) return;
    const sound = window.site && window.site.sound;
    if (!sound) return;

    // Check if on a game URL (e.g. /ab12cd34)
    const match = location.pathname.match(/^\/([a-zA-Z0-9]{8,12})/);
    if (!match) return;
    const gameId = match[1].slice(0, 8);

    if (startedGameIds.has(gameId)) return;

    // Must be in a game round (not pure analysis / study)
    const isRound = document.querySelector('.round__app');
    const isAnalyse = document.querySelector('.analyse__app');
    if (!isRound || isAnalyse) return;

    // Check if at the start of the game (0 or 1 move played)
    const moveCount = document.querySelectorAll('.rmoves move').length;
    if (moveCount <= 1) {
      startedGameIds.add(gameId);
      ensureCustomPaths();
      setTimeout(() => {
        try {
          if (typeof sound.play === 'function') {
            sound.play('gameStart').catch(() => {});
          }
        } catch (e) {}
      }, 250);
    }
  }

  function applyHooks() {
    const sound = window.site && window.site.sound;
    if (!sound || hooksApplied) return;
    hooksApplied = true;

    const origMove = sound.move;
    const origPlay = sound.play;
    const origPreload = sound.preloadBoardSounds;

    ensureCustomPaths();

    // Hook preloadBoardSounds to pre-load custom sounds and detect game start
    if (typeof origPreload === 'function') {
      sound.preloadBoardSounds = function () {
        origPreload.apply(this, arguments);
        ensureCustomPaths();
        loadCustomSounds();
        checkGameStart();
      };
    }

    // Hook sound.play
    sound.play = function (name, volume) {
      if (!isEnabled()) {
        return origPlay.apply(this, arguments);
      }

      // Ensure custom sound URLs are registered before playback
      if (name === 'castle' && currentConfig.urls?.castle && sound.paths) {
        sound.paths.set('castle', currentConfig.urls.castle);
      }
      if (name === 'gameStart' && currentConfig.urls?.gameStart && sound.paths) {
        sound.paths.set('gameStart', currentConfig.urls.gameStart);
      }

      if (name === 'check' || name === 'checkmate') {
        // Cancel any pending live game move/capture sound immediately!
        cancelPendingMove();
        silenceSound('move');
        silenceSound('capture');

        const now = Date.now();
        // Ignore duplicate check calls within 300ms
        if (now - lastCheckPlayedAt < 300) {
          return Promise.resolve();
        }
        lastCheckPlayedAt = now;

        return origPlay.apply(this, arguments);
      }

      if (name === 'move' || name === 'capture') {
        // If check was just played within 300ms, do not play move or capture!
        if (Date.now() - lastCheckPlayedAt < 300) {
          return Promise.resolve();
        }
      }

      return origPlay.apply(this, arguments);
    };

    // Hook sound.move
    sound.move = function (o) {
      if (!isEnabled()) {
        return origMove.apply(this, arguments);
      }

      // If this call is for background music, pass through
      if (o?.filter === 'music' && currentConfig.theme !== 'music') {
        return origMove.apply(this, arguments);
      }

      const volume = o?.volume ?? 1;
      const cg = getChessground();

      // Case 1: SAN is provided (Analysis, Study, TV, Replays, Puzzles, etc.)
      if (o && o.san) {
        cancelPendingMove();
        if (o.san.includes('#')) {
          return sound.play('checkmate', volume);
        }
        if (o.san.includes('+')) {
          return sound.play('check', volume);
        }
        if (isChessComDefault() && isLastMoveCastling(o, cg)) {
          return sound.play('castle', volume);
        }
        if (o.san.includes('x')) {
          return sound.play('capture', volume);
        }
        return sound.play('move', volume);
      }

      // Case 2: Live gameplay move (Piece drop)
      if (o && o.name) {
        // Castling detection
        if (isChessComDefault() && isLastMoveCastling(o, cg)) {
          cancelPendingMove();
          return sound.play('castle', volume);
        }

        // Live piece drop: debounce move/capture sound by 60ms.
        // If the server confirms check, sound.play('check') cancels this timer before it fires!
        cancelPendingMove();
        pendingMoveTimer = setTimeout(() => {
          pendingMoveTimer = null;
          sound.play(o.name, volume);
        }, 60);

        return Promise.resolve();
      }

      return origMove.apply(this, arguments);
    };
  }

  // Poll for site.sound to be initialized
  let checkTries = 0;
  const initInterval = setInterval(() => {
    checkTries++;
    if (window.site && window.site.sound) {
      applyHooks();
      ensureCustomPaths();
      loadCustomSounds();
      checkGameStart();
      if (checkTries >= 30) clearInterval(initInterval);
    } else if (checkTries >= 60) {
      clearInterval(initInterval);
    }
  }, 200);

  // Monitor DOM / URL changes for SPA game transitions
  const observer = new MutationObserver(() => {
    checkGameStart();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', checkGameStart);
})();
