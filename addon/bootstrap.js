/* global Zotero, Services, Components */
var AIReaderBundle;
var aiReaderLoaded = false;

async function startup(data) {
  try {
    if (typeof AbortController === 'undefined') {
      Components.utils.importGlobalProperties(['AbortController']);
    }
    for (const name of ['Blob', 'FormData']) {
      if (typeof globalThis[name] === 'undefined') Components.utils.importGlobalProperties([name]);
    }
    Services.scriptloader.loadSubScript(data.rootURI + 'content/main.js', globalThis);
    aiReaderLoaded = true;
    await AIReaderBundle.startup(data);
  } catch {
    try { await shutdown(); } catch {}
    throw new Error('AI Reader 启动失败，请重新启用插件。');
  }
}

async function shutdown() {
  try {
    if (aiReaderLoaded) await AIReaderBundle.shutdown();
  } finally {
    AIReaderBundle = undefined;
    aiReaderLoaded = false;
  }
}

function install() {}
function uninstall() {}

function onMainWindowLoad({ window }) {
  if (aiReaderLoaded) AIReaderBundle.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  if (aiReaderLoaded) AIReaderBundle.onMainWindowUnload(window);
}
