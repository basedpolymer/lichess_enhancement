//KEEPS LICHESS'S OWN SET CHOOSER (user menu > Piece set / Board) IN STEP WITH THE EXTENSION
//- an extension set is on the board: lichess's highlighted set is not the one shown, so lichess.css removes
//  that highlight (main.js marks <html data-le-pieces / data-le-board> while an extension set is active)
//- one of lichess's sets is clicked there: the extension gives the pieces / board back to lichess
//Relies on lichess's markup: #dasher_app .sub.piece / .sub.board > .list > button. If it changes, this does
//nothing and the popup's "Use lichess's pieces / board" still works
//Needs settings.js and main.js (Styles)

(function () {
  if (window.top !== window) return;

  const SUB_KINDS = { piece: 'pieces', board: 'board' };

  //Capture phase on the document: lichess rebuilds its menu each time it opens, a delegated listener needs no
  //observer and sees the click before lichess re-renders
  document.addEventListener(
    'click',
    (e) => {
      const button = e.target instanceof Element ? e.target.closest('#dasher_app .sub > .list > button') : null;
      if (!button) return;
      const sub = button.parentElement.parentElement;
      const cls = Object.keys(SUB_KINDS).find((c) => sub.classList.contains(c));
      if (!cls) return;
      const kind = SUB_KINDS[cls];
      if (!LE.isNone(kind, Styles.saved(kind))) LE.choose(kind, LE.NONE[kind]).catch(() => {});
    },
    true
  );
})();
