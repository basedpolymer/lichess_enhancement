var extApi = typeof browser !== 'undefined' ? browser : chrome;
var board_select = document.getElementById('board_select');

//UPDATE <OPTION> WITH VALUE IN STORAGE
//Default: DEFAULT_SETTINGS in background.js
extApi.storage.sync.get({ board: 'green' }).then(function (data) {
  if (data.board) {
    board_select.value = data.board;
  }
}).catch(function () {});

//UPDATE STORAGE WITH NEW VALUE AND SEND A SIGNAL TO MAIN SCRIPT
board_select.onchange = async function () {
  const value = this.value;
  try {
    await extApi.storage.sync.set({ board: value });

    const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:\/\/([a-z0-9-]+\.)?lichess1?\.org\//.test(tab.url || '')) {
      extApi.tabs.sendMessage(tab.id, { board_init: value }).catch(function () {});
    }
  } catch (error) {
    console.error(error);
  }
};
