//Runs in lichess's MAIN world (document_start) and wraps site.sound while one of our sound sets is
//enabled (main.js publishes the popup choice as <html data-le-sounds>):
//- a move that gives check plays only the check / checkmate sound (lichess also plays the move sound)
//- with the chess.com set, castling plays castle.mp3 and a new game plays game-start.mp3. lichess fetches
//  them as sound/<set>/Castle.mp3 and GameStart.mp3, which the declarativeNetRequest rules redirect

(function () {
  //<html> may not exist yet at document_start
  const soundSet = () => document.documentElement.dataset.leSounds;
  const enabled = () => !!soundSet() && soundSet() !== 'none';
  //lichess's music theme and speech mode replace the board sounds: leave them alone
  const boardSounds = (sound) => sound.theme !== 'music' && sound.theme !== 'speech';
  const chessComSounds = (sound) => soundSet() === 'chessdotcomdefault' && boardSounds(sound);

  function sanSound(san, sound) {
    if (san.includes('#')) return 'checkmate';
    if (san.includes('+')) return 'check';
    if (san.startsWith('O-O') && chessComSounds(sound)) return 'castle';
    return san.includes('x') ? 'capture' : 'move';
  }

  function loadedSound(sound, name) {
    try {
      return sound.sounds.get(sound.paths.get(name) || sound.resolvePath(name));
    } catch (e) {
      return undefined;
    }
  }

  //Cut a sound that is still playing; lichess sets the gain again on its next play
  function fadeOut(sound, name) {
    const instance = loadedSound(sound, name);
    if (!instance) return;
    try {
      const gain = instance.node.gain;
      const now = instance.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + 0.03);
    } catch (e) {}
  }

  function cancelFade(sound, name) {
    const instance = loadedSound(sound, name);
    try {
      if (instance) instance.node.gain.cancelScheduledValues(0);
    } catch (e) {}
  }

  //CASTLING ON THE LIVE BOARD: own moves reach site.sound without their SAN, so read them off the board.
  //chessground keeps the square (cgKey) of its <square> and <piece> elements as DOM properties

  const visible = (el) => el.style.display !== 'none';

  function pieceAt(board, key) {
    return [...board.querySelectorAll('piece')].find(
      (p) => p.cgKey === key && !p.classList.contains('ghost') && !p.classList.contains('fading')
    );
  }

  //chessground draws animated moves (clicks, premoves) at once and dropped pieces on the next frame.
  //Until it draws, the moving piece is still marked: dragged, or on a selected / premove square
  function piecesAwaitingRedraw(board) {
    const squares = [...board.querySelectorAll('square.selected, square.current-premove')].filter(visible);
    return [...board.querySelectorAll('piece.dragging')].concat(squares.map((sq) => pieceAt(board, sq.cgKey)));
  }

  //After the redraw: the king two files away from the square it left, or both squares empty
  //when the king was dropped on its rook (chess960)
  function boardShowsCastle(board) {
    const keys = [...board.querySelectorAll('square.last-move')].filter(visible).map((sq) => sq.cgKey);
    if (keys.length !== 2) return false;
    const [a, b] = keys.map((key) => pieceAt(board, key));
    if (!a && !b) return true;
    const king = a || b;
    if ((a && b) || !king.classList.contains('king')) return false;
    return Math.abs(keys[0].charCodeAt(0) - keys[1].charCodeAt(0)) >= 2;
  }

  function install(sound) {
    const play = sound.play;
    const move = sound.move;

    //lichess plays the board sound of a received move from a chessground callback (setTimeout 1ms) queued
    //before it plays check and reports the SAN: a 1ms timer set at that point fires right after that sound
    let checkPlayed = false;
    let receivedSan;
    const expireSoon = () =>
      setTimeout(() => {
        checkPlayed = false;
        receivedSan = undefined;
      }, 1);

    sound.play = function (name, volume) {
      if (enabled() && boardSounds(sound)) {
        if (name === 'check' || name === 'checkmate') {
          //Drop the move sound of a received move, cut ours if it is still playing (own move, server echo)
          checkPlayed = true;
          expireSoon();
          ['move', 'capture', 'castle'].forEach((n) => fadeOut(sound, n));
        } else if (name === 'move' || name === 'capture' || name === 'castle') {
          cancelFade(sound, name);
          if (name === 'castle') {
            return play.call(this, name, volume).catch(() => play.call(this, 'move', volume));
          }
        }
      }
      return play.apply(this, arguments);
    };

    function ownMove(self, o) {
      const castle = { ...o, name: 'castle' };
      const board = document.querySelector('.main-board cg-board');
      if (!board) return move.call(self, o);
      const pending = piecesAwaitingRedraw(board);
      if (!pending.length) return move.call(self, boardShowsCastle(board) ? castle : o);
      if (document.hidden || !pending.some((p) => p && p.classList.contains('king'))) return move.call(self, o);
      //A king was dropped: wait for chessground to draw the move
      let done = false;
      const finish = (drawn) => {
        if (done) return;
        done = true;
        move.call(self, drawn && boardShowsCastle(board) ? castle : o);
      };
      requestAnimationFrame(() => finish(true));
      setTimeout(() => finish(false), 100);
      return Promise.resolve();
    }

    sound.move = function (o) {
      if (!enabled() || !boardSounds(sound)) return move.apply(this, arguments);
      //Live game: lichess reports every received move with its SAN (meant for the music theme)
      if (o && o.filter === 'music') {
        receivedSan = o.san;
        expireSoon();
        return move.apply(this, arguments);
      }
      //Board sound of a live move: { name: 'move' | 'capture' }, or no argument for a crazyhouse drop
      if (!o || o.name) {
        if (checkPlayed) {
          checkPlayed = false;
          return Promise.resolve();
        }
        if (o && o.name === 'move' && chessComSounds(sound)) {
          if (receivedSan) return move.call(this, receivedSan.startsWith('O-O') ? { ...o, name: 'castle' } : o);
          return ownMove(this, o);
        }
        return move.apply(this, arguments);
      }
      //Analysis, studies, puzzles, replays: a single sound picked from the SAN
      if (o.san) return move.call(this, { ...o, name: sanSound(o.san, sound) });
      return move.apply(this, arguments);
    };
  }

  //GAME START: the round page embeds its data in <script id="page-init-data">, read by lichess on DOMContentLoaded

  function newGameId() {
    let data;
    try {
      data = JSON.parse(document.getElementById('page-init-data').textContent).data;
    } catch (e) {
      return undefined;
    }
    const game = data && data.game;
    if (!document.querySelector('main.round') || !game || !data.player || data.player.spectator) return undefined;
    //Status created (10) or started (20), and no move played yet
    if (!game.status || game.status.id > 20 || game.turns !== (game.startedAtTurn || 0)) return undefined;
    return game.id;
  }

  function whenSoundSetKnown(callback) {
    if (soundSet()) return callback();
    const observer = new MutationObserver(() => {
      if (!soundSet()) return;
      observer.disconnect();
      callback();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-le-sounds'] });
    setTimeout(() => observer.disconnect(), 10000);
  }

  function playGameStart(sound) {
    const id = newGameId();
    if (!id) return;
    //Once per game: not again when the page is reloaded before the first move
    const key = 'lichess-enhancement-game-start-' + id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (e) {}
    whenSoundSetKnown(() => {
      if (chessComSounds(sound)) Promise.resolve(sound.play('gameStart')).catch(() => {});
    });
  }

  //Registered before lichess's own listener; site.sound is set up by then (module scripts run first)
  document.addEventListener('DOMContentLoaded', () => {
    const sound = window.site && window.site.sound;
    if (!sound || typeof sound.play !== 'function' || typeof sound.move !== 'function') return;
    install(sound);
    playGameStart(sound);
  });
})();
