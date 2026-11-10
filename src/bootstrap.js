/* global Zotero, Services, APP_SHUTDOWN */

var chromeHandle;

function install(data, reason) {
  // Nothing to do.
}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  if (!rootURI) {
    throw new Error("Selection Translator: rootURI missing");
  }
  if (!rootURI.endsWith("/")) {
    rootURI += "/";
  }

  const ctx = {
    rootURI,
    id,
    version,
    Zotero,
    Services,
    Components,
    ChromeUtils,
    _globalThis: null,
  };
  ctx._globalThis = ctx;

  Zotero.debug(`[Selection Translator] rootURI=${rootURI}`);

  const loadScript = (relativePath) => {
    const uri = `${rootURI}${relativePath}`;
    try {
      Services.scriptloader.loadSubScript(uri, ctx);
    }
    catch (e) {
      // On some Zotero/Gecko combinations Services.scriptloader cannot open
      // a subscript directly from a jar: URI, even though bootstrap.js itself
      // was loaded from the same XPI. Reading the entry and evaluating it in
      // the same sandbox is a functionally equivalent fallback.
      Zotero.debug(`[Selection Translator] loadSubScript failed for ${uri}: ${e}`);
      const code = Zotero.File.getContentsFromURL(uri);
      Components.utils.evalInSandbox(code, ctx, "1.8", uri, 1);
    }
  };

  loadScript("content/scripts/engines.js");
  loadScript("content/scripts/dictionary.js");
  loadScript("content/scripts/translate.js");

  if (!ctx.ZoteroSelectionTranslator) {
    throw new Error("Selection Translator: main script did not initialize");
  }

  await ctx.ZoteroSelectionTranslator.startup({ id, version, rootURI });


}

async function onMainWindowLoad({ window }, reason) {
  try {
    await Zotero.ZoteroSelectionTranslator?.onMainWindowLoad(window);
  }
  catch (e) {
    Zotero.logError(e);
  }
}

async function onMainWindowUnload({ window }, reason) {
  try {
    Zotero.ZoteroSelectionTranslator?.onMainWindowUnload(window);
  }
  catch (e) {
    Zotero.logError(e);
  }
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    // Zotero is exiting. Drop the in-memory translation cache explicitly;
    // the process would release it anyway, but this also covers reloads and
    // makes the session-only cache contract clear.
    try {
      Zotero.ZoteroSelectionTranslator?.clearTranslationCache?.();
    }
    catch (e) {
      Zotero.logError(e);
    }
    return;
  }

  try {
    Zotero.ZoteroSelectionTranslator?.shutdown();
  }
  catch (e) {
    Zotero.logError(e);
  }

  try {
    delete Zotero.ZoteroSelectionTranslator;
  }
  catch (e) {
    // Ignore.
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {
  // Nothing to do.
}
