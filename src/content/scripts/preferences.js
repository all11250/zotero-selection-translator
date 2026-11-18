/* global Zotero, window, document */

/**
 * Preference-pane bootstrap for Selection Translator.
 *
 * Keeps the collapsible legal disclaimer and the keyboard-shortcut editor in
 * sync with their preferences. The shortcut editor is generated from the same
 * action list the reader card uses, so labels and defaults cannot drift.
 */
(function () {
  "use strict";

  const PREF = "extensions.zotero.zoteroSelectionTranslator.disclaimerCollapsed";
  const COLLAPSED_CLASS = "zst-disclaimer-collapsed";
  const XHTML = "http://www.w3.org/1999/xhtml";
  let attempts = 0;
  let shortcutAttempts = 0;

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
    button.textContent = collapsed ? "展开" : "我已知晓";
    button.title = collapsed
      ? "展开完整的免责声明"
      : "我已阅读并知晓，收起免责声明";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function initDisclaimer() {
    const card = document.getElementById("zst-disclaimer");
    const button = document.getElementById("zst-disclaimer-toggle");
    if (!card || !button) {
      if (attempts++ < 40) {
        window.setTimeout(initDisclaimer, 100);
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

  function make(tag, className, text) {
    const node = document.createElementNS(XHTML, tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  function normalizeKeyName(key) {
    const value = String(key == null ? "" : key);
    if (!value) {
      return "";
    }
    if (value === " " || value === "Spacebar") {
      return "Space";
    }
    if (value === "Esc") {
      return "Escape";
    }
    if (value === "Del") {
      return "Delete";
    }
    return value.length === 1 ? value.toUpperCase() : value;
  }

  function eventCombo(event) {
    const key = normalizeKeyName(event.key);
    if (!key || ["Control", "Alt", "Shift", "Meta"].includes(key)) {
      return "";
    }
    const parts = [];
    if (event.ctrlKey) {
      parts.push("Ctrl");
    }
    if (event.altKey) {
      parts.push("Alt");
    }
    if (event.shiftKey) {
      parts.push("Shift");
    }
    if (event.metaKey) {
      parts.push("Meta");
    }
    parts.push(key);
    return parts.join("+");
  }

  function initShortcuts() {
    const container = document.getElementById("zst-shortcuts");
    const reset = document.getElementById("zst-shortcuts-reset");
    const status = document.getElementById("zst-shortcuts-status");
    const enabledBox = document.getElementById("zst-shortcuts-enabled");
    const api = Zotero.ZoteroSelectionTranslator;
    if (!container || !reset || !status || !api || !api.getShortcutActions) {
      if (shortcutAttempts++ < 40) {
        window.setTimeout(initShortcuts, 100);
      }
      return;
    }

    let statusTimer = null;
    const showStatus = (text, kind) => {
      status.textContent = text || "";
      status.classList.toggle("ok", kind === "ok");
      status.classList.toggle("err", kind === "err");
      status.classList.toggle("warn", kind === "warn");
      if (statusTimer) {
        window.clearTimeout(statusTimer);
      }
      if (text) {
        statusTimer = window.setTimeout(() => {
          status.textContent = "";
          status.classList.remove("ok", "err", "warn");
        }, 6000);
      }
    };

    const applyEnabled = () => {
      const enabled = !enabledBox || !!enabledBox.checked;
      container.classList.toggle("zst-shortcuts-disabled", !enabled);
      status.title = enabled ? "" : "快捷键功能已关闭";
    };
    if (enabledBox) {
      enabledBox.addEventListener("change", applyEnabled);
    }

    const render = () => {
      container.replaceChildren();
      const config = api.getShortcutConfig();
      for (const action of api.getShortcutActions()) {
        const row = make("div", "zst-shortcut-row");
        row.appendChild(make("span", "zst-shortcut-label", action.label));
        const input = document.createElementNS(XHTML, "input");
        input.type = "text";
        input.className = "zst-shortcut-input";
        input.readOnly = true;
        input.value = config[action.id] || "";
        input.title = "点击后按下新的组合键";
        input.dataset.action = action.id;
        input.addEventListener("focus", () => input.select());
        input.addEventListener("click", () => input.select());
        input.addEventListener("keydown", (event) => {
          // Capture the key before it moves focus or triggers a browser
          // shortcut. Shift+Tab is a valid shortcut here.
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            input.blur();
            return;
          }
          const combo = eventCombo(event);
          if (!combo) {
            return;
          }
          const result = api.setShortcut(action.id, combo);
          if (!result.ok) {
            input.classList.add("zst-shortcut-conflict");
            showStatus(result.error, "err");
            window.setTimeout(() => {
              if (input.isConnected) {
                input.classList.remove("zst-shortcut-conflict");
              }
            }, 1600);
            return;
          }
          input.classList.remove("zst-shortcut-conflict");
          render();
          if (result.warning) {
            showStatus(`已保存：${action.label} → ${combo}。${result.warning}`, "warn");
          }
          else {
            showStatus(`已保存：${action.label} → ${combo}`, "ok");
          }
        });
        row.appendChild(input);
        const defaultText = make(
          "span",
          "zst-shortcut-default",
          `默认 ${action.defaultKey}`
        );
        row.appendChild(defaultText);
        container.appendChild(row);
      }
    };

    reset.addEventListener("click", () => {
      api.resetShortcuts();
      render();
      showStatus("已恢复全部默认快捷键", "ok");
    });
    render();
    applyEnabled();
  }

  initDisclaimer();
  initShortcuts();
})();
