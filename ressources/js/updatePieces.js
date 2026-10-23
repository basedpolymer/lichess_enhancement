var extApi = typeof browser !== 'undefined' ? browser : chrome;
var piece_select = document.getElementById('pieces_select');

//UPDATE <OPTION> WITH VALUE IN STORAGE
//Default: DEFAULT_SETTINGS in background.js
extApi.storage.sync.get({ pieces: 'neo' }).then(function (data) {
  if (data.pieces) {
    piece_select.value = data.pieces;
  }
}).catch(function () {});

//UPDATE STORAGE WITH NEW VALUE AND SEND A SIGNAL TO MAIN SCRIPT
piece_select.onchange = async function () {
  const value = this.value;
  try {
    await extApi.storage.sync.set({ pieces: value });

    const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:\/\/([a-z0-9-]+\.)?lichess1?\.org\//.test(tab.url || '')) {
      extApi.tabs.sendMessage(tab.id, { pieces_init: value }).catch(function () {});
    }
  } catch (error) {
    console.error(error);
  }
};
