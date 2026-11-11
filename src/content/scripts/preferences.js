/* global Zotero, window, document */

/**
 * Preference-pane bootstrap for Selection Translator.
 *
 * Kept deliberately small: it only wires the collapsible legal disclaimer.
 * The disclaimer state is one boolean preference, so no DOM or data is kept
 * after the preferences window closes.
 */
(function () {
  "use strict";

  const PREF = "extensions.zotero.zoteroSelectionTranslator.disclaimerCollapsed";
  const COLLAPSED_CLASS = "zst-disclaimer-collapsed";
  let attempts = 0;

  function readCollapsed() {
    try {
      return !!Zotero.Prefs.get(PREF, true);
    }
    catch (e) {
      return false;
    }
  }

  function writeCollapsed(value) {
    try {
      Zotero.Prefs.set(PREF, !!value, true);
    }
    catch (e) {
      Zotero.logError(e);
    }
  }

  function apply(card, button, collapsed) {
    card.classList.toggle(COLLAPSED_CLASS, collapsed);
    button.textContent = collapsed ? "收起" : "我已知晓";
    button.title = collapsed
      ? "展开完整的免责声明"
      : "我已阅读并知晓，收起免责声明";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function init() {
    const card = document.getElementById("zst-disclaimer");
    const button = document.getElementById("zst-disclaimer-toggle");
    if (!card || !button) {
      if (attempts++ < 40) {
        window.setTimeout(init, 100);
      }
      return;
    }
    let collapsed = readCollapsed();
    apply(card, button, collapsed);
    button.addEventListener("click", () => {
      collapsed = !collapsed;
      apply(card, button, collapsed);
      writeCollapsed(collapsed);
    });
  }

  init();
})();
