var extApi = typeof browser !== 'undefined' ? browser : chrome;
var sounds_select = document.getElementById('sounds_select');

//UPDATE <OPTION> WITH VALUE IN STORAGE
extApi.storage.sync.get('sounds').then(function (data) {
  if (data.sounds) {
    sounds_select.value = data.sounds;
  }
}).catch(function () {});

//SWAP THE ENABLED RULESET, SAVE, THEN TELL THE BACKGROUND TO FLUSH LICHESS'S SOUND CACHE
sounds_select.onchange = async function () {
  const value = this.value;
  try {
    const enabled = await extApi.declarativeNetRequest.getEnabledRulesets();
    await extApi.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: enabled.filter((id) => id !== value),
      enableRulesetIds: [value],
    });
    await extApi.storage.sync.set({ sounds: value });

    const [tab] = await extApi.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:\/\/([a-z0-9-]+\.)?lichess1?\.org\//.test(tab.url || '')) {
      extApi.runtime.sendMessage({ sounds_init: value, tab: tab.id }).catch(() => {});
    }
  } catch (error) {
    console.error(error);
  }
};
