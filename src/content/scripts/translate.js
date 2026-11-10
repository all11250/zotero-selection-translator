/* global Zotero, Services, SelectionTranslatorEngines */

/**
 * Selection Translator for Zotero 7+.
 *
 * The plugin has three reader integrations:
 *  - a translation panel appended to the text-selection popup,
 *  - a toolbar toggle for automatic translation,
 *  - a small button on highlight/underline headers that translates an
 *    existing annotation into its comment.
 */
var ZoteroSelectionTranslator = (function () {
  "use strict";

  const E = SelectionTranslatorEngines;
  const PREF_PREFIX = "extensions.zotero.zoteroSelectionTranslator.";
  const PLUGIN_NAME = "划词翻译";
  const CACHE_LIMIT = 200;
  // Wait for the selection gesture to settle before sending the joined text.
  // A user often selects several fragments quickly; only the final merge is
  // sent, so the engine sees one coherent paragraph.
  const CONTINUOUS_DEBOUNCE_MS = 650;
  const DEEPL_WEB_ENDPOINT = "https://oneshot-free.www.deepl.com/v1/translate";

  function prefKey(key) {
    return PREF_PREFIX + key;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, n));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function makeUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return crypto.randomUUID();
      }
      catch (e) {
        // Fall through.
      }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function stripHtml(text) {
    return String(text || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Join two text fragments with exactly one ASCII space so that selections
   * made on two different pages do not glue words together.
   */
  function joinText(a, b) {
    const left = String(a == null ? "" : a).trimEnd();
    const right = String(b == null ? "" : b).trimStart();
    if (!left) {
      return right;
    }
    if (!right) {
      return left;
    }
    return `${left} ${right}`;
  }

  /**
   * True for a selection that is a single Latin-script word. Dictionary
   * lookup is only attempted for these; everything else uses translation.
   * Hyphenated words and apostrophes are allowed ("state-of-the-art",
   * "don't"), as are accents ("café").
   */
  function normalizeLookupWord(text) {
    let value = String(text || "").trim();
    if (!value) {
      return "";
    }
    // Drop selection punctuation such as quotes and a trailing comma/period.
    value = value
      .replace(/^[\s"'“”‘’()[\]{}<>«».,;:!?、。，；：！？]+/u, "")
      .replace(/[\s"'“”‘’()[\]{}<>«».,;:!?、。，；：！？]+$/u, "");
    if (!value || /\s/.test(value) || value.length > 64) {
      return "";
    }
    if (!/\p{Script=Latin}/u.test(value)) {
      return "";
    }
    // Letters (any script) plus combining marks, apostrophes and hyphens.
    return /^[\p{L}\p{M}'’\-]+$/u.test(value) ? value : "";
  }

  function isLookupWord(text) {
    return !!normalizeLookupWord(text);
  }

  function h(doc, tag, options) {
    options = options || {};
    const node = doc.createElement(tag);
    if (options.className) {
      node.className = options.className;
    }
    if (options.text != null) {
      node.textContent = String(options.text);
    }
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (value === false || value == null) {
          continue;
        }
        node.setAttribute(name, value === true ? "true" : String(value));
      }
    }
    if (options.style) {
      for (const [name, value] of Object.entries(options.style)) {
        node.style[name] = value;
      }
    }
    if (options.children) {
      for (const child of options.children) {
        if (child) {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  class Translator {
    constructor() {
      this.id = "selection-translator@zotero.local";
      this.version = "1.0.0";
      this.rootURI = "";
      this.paneID = "";
      this.cssText = "";
      this.cache = new Map();
      this.inflight = new Map();
      this.dictCache = new Map();
      this.annotationKeys = new Map();
      this.activePins = new Map();
      this.dictionary =
        typeof SelectionTranslatorDictionary !== "undefined"
          ? SelectionTranslatorDictionary
          : null;
      this.mainWindows = new Set();
      this.startupDone = false;
      this.host = {
        instanceId: makeUuid(),
        sessionId: makeUuid(),
        getPref: (key) => this.getPref(key),
      };
      this.engines = E.createEngines(this.host);
    }

    getPref(key) {
      try {
        const value = Zotero.Prefs.get(prefKey(key), true);
        if (value === undefined || value === null) {
          return "";
        }
        return value;
      }
      catch (e) {
        return "";
      }
    }

    setPref(key, value) {
      try {
        Zotero.Prefs.set(prefKey(key), value, true);
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    log(...args) {
      if (this.getPref("debug")) {
        Zotero.debug(`[${PLUGIN_NAME}] ${args.map((x) => String(x)).join(" ")}`);
      }
    }

    async startup(options) {
      this.id = options.id || this.id;
      this.version = options.version || this.version;
      this.rootURI = options.rootURI;

      await Zotero.initializationPromise;
      if (Zotero.uiReadyPromise) {
        await Zotero.uiReadyPromise;
      }

      try {
        this.cssText = Zotero.File.getContentsFromURL(
          `${this.rootURI}content/styles/translate.css`
        );
      }
      catch (e) {
        Zotero.logError(e);
      }

      // New defaults for upgrades from versions that predate these fields.
      if (this.getPref("lineHeight") === "") {
        this.setPref("lineHeight", "1.65");
      }
      if (this.getPref("serifResultFont") === "") {
        this.setPref("serifResultFont", true);
      }
      // 1.8.0 defaults for upgrades from older releases that predate these
      // preferences. Zotero does not reapply defaults for existing profiles.
      if (this.getPref("dictionaryEnabled") === "") {
        this.setPref("dictionaryEnabled", true);
      }
      if (this.getPref("dictionarySource") === "") {
        this.setPref("dictionarySource", "auto");
      }
      if (this.getPref("dictionaryShowDefinitions") === "") {
        this.setPref("dictionaryShowDefinitions", true);
      }
      if (this.getPref("dictionaryAiEngine") === "") {
        this.setPref("dictionaryAiEngine", "auto");
      }
      if (this.getPref("pinByDefault") === "") {
        this.setPref("pinByDefault", false);
      }

      this.registerPreferencePane();
      this.registerReaderEvents();

      for (const win of Zotero.getMainWindows()) {
        this.onMainWindowLoad(win);
      }

      Zotero.ZoteroSelectionTranslator = this;
      this.startupDone = true;
      this.log("started", this.version);
    }

    shutdown() {
      try {
        if (this.paneID) {
          Zotero.PreferencePanes.unregister(this.paneID);
        }
      }
      catch (e) {
        // Pane is unregistered automatically by Zotero on plugin shutdown.
      }
      for (const win of Array.from(this.mainWindows)) {
        this.onMainWindowUnload(win);
      }
      this.mainWindows.clear();
      this.clearTranslationCache();
      this.annotationKeys.clear();
      this.activePins.clear();
      this.startupDone = false;
    }

    /**
     * Drop the in-memory translation cache and any in-flight dedupe entries.
     * There is no disk cache; this is also called on Zotero shutdown so the
     * session data is released explicitly.
     */
    clearTranslationCache() {
      const count = this.cache.size + this.dictCache.size;
      this.cache.clear();
      this.inflight.clear();
      this.dictCache.clear();
      return count;
    }

    registerPreferencePane() {
      try {
        const promise = Zotero.PreferencePanes.register({
          pluginID: this.id,
          id: "zotero-selection-translator-pane",
          src: `${this.rootURI}content/preferences.xhtml`,
          label: "划词翻译",
          image: `${this.rootURI}content/icons/icon-48.png`,
          stylesheets: [`${this.rootURI}content/styles/preferences.css`],
          helpURL: "https://www.zotero.org/support/preferences",
        });
        if (promise && typeof promise.then === "function") {
          promise.then((id) => {
            this.paneID = id;
          }).catch((e) => {
            Zotero.logError(e);
          });
        }
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    registerReaderEvents() {
      try {
        Zotero.Reader.registerEventListener(
          "renderTextSelectionPopup",
          (event) => this.onRenderTextSelectionPopup(event),
          this.id
        );
        Zotero.Reader.registerEventListener(
          "renderToolbar",
          (event) => this.onRenderToolbar(event),
          this.id
        );
        Zotero.Reader.registerEventListener(
          "renderSidebarAnnotationHeader",
          (event) => this.onRenderSidebarAnnotationHeader(event),
          this.id
        );
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    onMainWindowLoad(win) {
      if (!win || !win.document || this.mainWindows.has(win)) {
        return;
      }
      this.mainWindows.add(win);
      try {
        const doc = win.document;
        const toolsPopup = doc.getElementById("menu_ToolsPopup");
        if (!toolsPopup) {
          return;
        }
        if (doc.getElementById("zst-open-settings")) {
          return;
        }
        const item = doc.createXULElement
          ? doc.createXULElement("menuitem")
          : doc.createElement("menuitem");
        item.id = "zst-open-settings";
        item.setAttribute("label", "划词翻译设置…");
        item.addEventListener("command", () => this.openPreferences());
        toolsPopup.appendChild(item);
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    onMainWindowUnload(win) {
      if (!win) {
        return;
      }
      this.mainWindows.delete(win);
      try {
        win.document.getElementById("zst-open-settings")?.remove();
      }
      catch (e) {
        // Window may already be gone.
      }
    }

    openPreferences() {
      try {
        Zotero.Utilities.Internal.openPreferences(this.paneID || undefined, {});
      }
      catch (e) {
        try {
          Zotero.Utilities.Internal.openPreferences();
        }
        catch (e2) {
          Zotero.logError(e2);
        }
      }
    }

    // ---------------------------------------------------------------- reader

    isChineseSource(text) {
      const value = String(text || "");
      // Do not mistake Japanese kana / Korean hangul for Chinese, even when
      // the selection also contains CJK ideographs.
      if (/[\u3040-\u30ff\uac00-\ud7af]/.test(value)) {
        return false;
      }
      return /[\u3400-\u9fff]/.test(value);
    }

    onRenderTextSelectionPopup(event) {
      if (!this.getPref("enabled")) {
        return;
      }
      const annotation = event && event.params && event.params.annotation;
      if (!annotation || !annotation.text || !String(annotation.text).trim()) {
        return;
      }
      const sourcePref = this.getPref("sourceLanguage");
      const isChinese =
        sourcePref === "zh-CN" ||
        sourcePref === "zh-TW" ||
        this.isChineseSource(annotation.text);
      if (isChinese) {
        // Chinese source text needs no translation. Leave Zotero's native
        // selection popup in charge of highlight/underline so this plugin
        // makes no translation request and shows no custom translation card.
        return;
      }
      try {
        this.ensureReaderStyles(event.doc);
        const activePin = this.getActivePin(event.reader);
        if (activePin) {
          this.updatePinnedTranslation(activePin, event);
          return;
        }
        const state = this.buildSelectionPanel(event);
        if (!state) {
          return;
        }
        event.append(state.panel);
        state.homeParent = state.panel.parentNode;
        state.homeNext = state.panel.nextSibling;
        // The popup is sized before our panel is appended; allow the new
        // width to take effect without clipping the translation.
        const popup = state.popup;
        popup.style.maxWidth = "none";
        // "默认置顶" pins the very first card. Defer one tick so the popup
        // has been laid out and the pinned geometry is meaningful.
        if (this.getPref("pinByDefault")) {
          setTimeout(() => {
            if (!state.destroyed && !state.pinned) {
              this.pinPanel(state);
            }
          }, 0);
        }
        if (state.mode === "dict") {
          // A dictionary lookup is cheap and is the whole point of selecting
          // a single word, so it does not wait for "autoTranslate".
          setTimeout(() => {
            if (!state.destroyed) {
              this.lookupDictionary(state);
            }
          }, 10);
        }
        else if (this.getPref("autoTranslate")) {
          setTimeout(() => {
            if (!state.destroyed) {
              this.runTranslation(state);
            }
          }, 20);
        }
        else {
          this.showTranslatePrompt(state);
        }
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    ensureReaderStyles(doc) {
      if (!doc || !this.cssText || doc.getElementById("zst-reader-styles")) {
        return;
      }
      const style = doc.createElement("style");
      style.id = "zst-reader-styles";
      style.textContent = this.cssText;
      (doc.head || doc.documentElement).appendChild(style);
    }

    buildSelectionPanel(event) {
      const { doc, reader, params } = event;
      const popup = doc.querySelector(".selection-popup");
      if (!popup) {
        return null;
      }
      popup.querySelectorAll(".zst-panel").forEach((node) => node.remove());

      const rawText = String(params.annotation.text || "").trim();
      const cleanText = E.normalizeText(rawText);
      if (!cleanText) {
        return null;
      }

      const width = clampNumber(this.getPref("popupWidth"), 300, 620, 380);
      const fontSize = clampNumber(this.getPref("fontSize"), 8, 48, 14);
      const lineHeight = clampNumber(this.getPref("lineHeight"), 1, 3, 1.65);
      const engineId = E.ENGINE_IDS.includes(this.getPref("engine"))
        ? this.getPref("engine")
        : "deepl-free";

      const panel = h(doc, "div", {
        className: "zst-panel",
        attrs: { "data-zst-panel": "1" },
      });
      panel.classList.toggle("zst-serif-font", !!this.getPref("serifResultFont"));
      panel.style.setProperty("--zst-width", `${width}px`);
      panel.style.setProperty("--zst-font-size", `${fontSize}px`);
      panel.style.setProperty("--zst-line-height", String(lineHeight));
      panel.style.width = `${width}px`;

      panel.addEventListener("pointerdown", (e) => e.stopPropagation());
      panel.addEventListener("mousedown", (e) => e.stopPropagation());

      const hasDictionary = typeof SelectionTranslatorDictionary !== "undefined";
      const dictSource = hasDictionary ? this.getPref("dictionarySource") : "auto";
      const word = normalizeLookupWord(cleanText);
      const dictionaryEnabled =
        !!this.getPref("dictionaryEnabled") && hasDictionary && !!word;
      const state = {
        event,
        doc,
        reader,
        params,
        popup,
        panel,
        sourceText: rawText,
        cleanText,
        engineId,
        mode: dictionaryEnabled ? "dict" : "translate",
        word,
        dictSource:
          hasDictionary && SelectionTranslatorDictionary.sources()[dictSource]
            ? dictSource
            : "auto",
        dictData: null,
        hasDictionary,
        translation: "",
        speakText: "",
        speakLang: "",
        requestId: 0,
        destroyed: false,
        savedKey: "",
        selectedColor: this.validColor(this.getPref("annotationColor")),
        fontSize,
        lineHeight,
        pinned: false,
        continuous: false,
        continuousTimer: null,
        manualSize: false,
        segments: [],
        lastStatus: null,
        audioPlayer: null,
        handles: [],
        homeParent: null,
        homeNext: null,
        refs: {},
      };

      const header = h(doc, "div", { className: "zst-head" });
      const logo = h(doc, "span", { className: "zst-logo", text: "译" });
      logo.title =
        "仅供个人学习研究：第三方非官方插件，译文/词典/AI 结果仅供参考；严禁用于损害他人或单位合法权益、侵犯知识产权或违反法律法规的用途。";
      const engineSelect = doc.createElement("select");
      engineSelect.className = "zst-engine-select";
      engineSelect.title = "翻译引擎 / 词典来源（也可以在这里临时切换）";
      this.fillModeSelect(state, engineSelect);
      engineSelect.addEventListener("change", () => {
        const next = engineSelect.value;
        if (next === "mode:translate") {
          this.switchMode(state, "translate");
          return;
        }
        if (next === "mode:dict") {
          this.switchMode(state, "dict");
          return;
        }
        if (next.startsWith("dict:")) {
          state.dictSource = next.slice(5);
          this.setPref("dictionarySource", state.dictSource);
          this.lookupDictionary(state, true);
          return;
        }
        if (!E.ENGINE_IDS.includes(next)) {
          return;
        }
        state.engineId = next;
        this.setPref("engine", next);
        if (state.mode === "dict") {
          this.lookupDictionary(state, true);
        }
        else {
          this.runTranslation(state, true);
        }
      });
      engineSelect.addEventListener("pointerdown", (e) => e.stopPropagation());

      const refresh = h(doc, "button", {
        className: "zst-icon-btn",
        text: "↻",
        attrs: { type: "button", title: "重新翻译 / 重新查词", "aria-label": "重新翻译" },
      });
      refresh.addEventListener("click", () => {
        if (state.mode === "dict") {
          this.lookupDictionary(state, true);
        }
        else {
          this.runTranslation(state, true);
        }
      });

      const settings = h(doc, "button", {
        className: "zst-icon-btn",
        text: "⚙",
        attrs: { type: "button", title: "打开划词翻译设置", "aria-label": "设置" },
      });
      settings.addEventListener("click", () => this.openPreferences());

      const styleButton = h(doc, "button", {
        className: "zst-icon-btn zst-aa-btn",
        text: "Aa",
        attrs: { type: "button", title: "调整译文字号和行间距", "aria-label": "字号与行间距" },
      });

      const styleRow = h(doc, "div", {
        className: "zst-style-row",
        attrs: { hidden: "hidden" },
      });
      const fontItem = h(doc, "label", { className: "zst-style-item" });
      fontItem.append(h(doc, "span", { text: "字号" }));
      const fontInput = doc.createElement("input");
      fontInput.type = "number";
      fontInput.className = "zst-style-input";
      fontInput.min = "8";
      fontInput.max = "48";
      fontInput.step = "1";
      fontInput.value = String(state.fontSize);
      fontInput.title = "译文字号（8–48 px）";
      fontItem.append(fontInput);

      const lineItem = h(doc, "label", { className: "zst-style-item" });
      lineItem.append(h(doc, "span", { text: "行距" }));
      const lineInput = doc.createElement("input");
      lineInput.type = "number";
      lineInput.className = "zst-style-input";
      lineInput.min = "1";
      lineInput.max = "3";
      lineInput.step = "0.05";
      lineInput.value = String(state.lineHeight);
      lineInput.title = "译文行间距倍数（1.0–3.0）";
      lineItem.append(lineInput);
      styleRow.append(fontItem, lineItem);

      const applyTextStyle = () => {
        const nextFont = clampNumber(fontInput.value, 8, 48, state.fontSize);
        const nextLine = clampNumber(lineInput.value, 1, 3, state.lineHeight);
        state.fontSize = nextFont;
        state.lineHeight = nextLine;
        panel.style.setProperty("--zst-font-size", `${nextFont}px`);
        panel.style.setProperty("--zst-line-height", String(nextLine));
      };
      fontInput.addEventListener("input", applyTextStyle);
      lineInput.addEventListener("input", applyTextStyle);
      fontInput.addEventListener("change", () => {
        applyTextStyle();
        fontInput.value = String(state.fontSize);
        this.setPref("fontSize", state.fontSize);
      });
      lineInput.addEventListener("change", () => {
        applyTextStyle();
        lineInput.value = String(state.lineHeight);
        this.setPref("lineHeight", state.lineHeight);
      });
      styleButton.addEventListener("click", () => {
        styleRow.hidden = !styleRow.hidden;
        styleButton.classList.toggle("active", !styleRow.hidden);
      });

      header.append(
        logo,
        engineSelect,
        h(doc, "span", { className: "zst-head-spacer" }),
        styleButton,
        refresh,
        settings
      );
      header.title = "置顶后，可按住顶部空白处拖动翻译框";
      header.addEventListener("pointerdown", (event) => this.beginDrag(state, event));

      const source = h(doc, "div", { className: "zst-source", text: rawText });
      source.title = `${rawText}\n\n可滚动查看全文；拖动右下角可调整高度。`;
      source.hidden = !this.getPref("showSource");

      const resultWrap = h(doc, "div", { className: "zst-result-wrap" });
      const resultHead = h(doc, "div", { className: "zst-result-head" });
      const resultTitle = h(doc, "span", {
        className: "zst-result-title",
        text: state.mode === "dict" ? "词典" : "译文",
      });
      // "连续翻译" sits immediately left of the pin button. Turning it on
      // pins the card and makes later selections append to the same card.
      const continuous = h(doc, "button", {
        className: "zst-cont-btn",
        text: "连续翻译",
        attrs: {
          type: "button",
          title: "连续翻译：置顶当前卡片，之后在不同位置划词会追加到同一段译文",
          "aria-label": "连续翻译",
          "aria-pressed": "false",
        },
      });
      continuous.addEventListener("click", () => this.toggleContinuous(state));
      const pin = h(doc, "button", {
        className: "zst-pin-btn",
        text: "置顶",
        attrs: {
          type: "button",
          title: "把翻译框固定在页面上，不随选区消失",
          "aria-label": "置顶翻译框",
          "aria-pressed": "false",
        },
      });
      pin.addEventListener("click", () => this.togglePin(state));
      resultHead.append(resultTitle, h(doc, "span", { className: "zst-head-spacer" }), continuous, pin);
      const result = h(doc, "div", { className: "zst-result" });
      resultWrap.append(resultHead, result);
      const status = h(doc, "span", { className: "zst-status" });

      const colors = h(doc, "div", { className: "zst-colors" });
      for (const [name, color] of E.ANNOTATION_COLORS) {
        const swatch = h(doc, "button", {
          className: "zst-swatch",
          attrs: {
            type: "button",
            title: `标注颜色：${name}`,
            "aria-label": `标注颜色：${name}`,
            "data-color": color,
          },
        });
        swatch.style.backgroundColor = color;
        if (color.toLowerCase() === state.selectedColor.toLowerCase()) {
          swatch.classList.add("active");
        }
        swatch.addEventListener("click", () => {
          state.selectedColor = color;
          this.setPref("annotationColor", color);
          colors.querySelectorAll(".zst-swatch").forEach((node) => {
            node.classList.toggle(
              "active",
              String(node.getAttribute("data-color")).toLowerCase() === color.toLowerCase()
            );
          });
        });
        colors.appendChild(swatch);
      }

      const highlight = h(doc, "button", {
        className: "zst-btn zst-save-btn",
        text: "高亮",
        attrs: { type: "button", title: "保存为高亮标注" },
      });
      highlight.addEventListener("click", () => this.saveAnnotation(state, "highlight"));

      const underline = h(doc, "button", {
        className: "zst-btn zst-save-btn",
        text: "划线",
        attrs: { type: "button", title: "保存为下划线标注" },
      });
      underline.addEventListener("click", () => this.saveAnnotation(state, "underline"));

      const actionRow = h(doc, "div", {
        className: "zst-actions",
        children: [colors, h(doc, "div", { className: "zst-save-group", children: [highlight, underline] })],
      });

      const commentLabel = h(doc, "label", { className: "zst-check" });
      const comment = doc.createElement("input");
      comment.type = "checkbox";
      comment.checked = !!this.getPref("annotationComment");
      comment.addEventListener("change", () => {
        this.setPref("annotationComment", comment.checked);
      });
      const commentText = h(doc, "span", {
        text: "将译文写入标注评论",
        attrs: { title: "勾选后，点击高亮/划线会把当前译文保存到标注评论中" },
      });
      commentLabel.append(comment, commentText);

      const dictToggle = h(doc, "button", {
        className: "zst-link-btn",
        text: state.mode === "dict" ? "整句翻译" : "查词典",
        attrs: {
          type: "button",
          title:
            state.mode === "dict"
              ? "把当前单词当作普通文本翻译"
              : "按单词查词典（词性 + 释义）",
        },
      });
      dictToggle.hidden =
        !state.hasDictionary ||
        !this.getPref("dictionaryEnabled") ||
        (!state.word && state.mode !== "dict");
      dictToggle.addEventListener("click", () => {
        this.switchMode(state, state.mode === "dict" ? "translate" : "dict");
      });

      const clearContinuous = h(doc, "button", {
        className: "zst-link-btn",
        text: "清空",
        attrs: { type: "button", title: "清空连续翻译已拼接的原文和译文" },
      });
      clearContinuous.hidden = true;
      clearContinuous.addEventListener("click", () => this.clearContent(state));

      const copy = h(doc, "button", {
        className: "zst-link-btn",
        text: "复制译文",
        attrs: { type: "button" },
      });
      copy.addEventListener("click", () => {
        if (!state.translation) {
          return;
        }
        try {
          Zotero.Utilities.Internal.copyTextToClipboard(state.translation);
          this.setStatus(state, "已复制译文", "ok");
        }
        catch (e) {
          this.setStatus(state, "复制失败", "err");
        }
      });

      const speak = h(doc, "button", {
        className: "zst-link-btn",
        text: "朗读",
        attrs: { type: "button" },
      });
      speak.addEventListener("click", () =>
        this.speak(state, state.mode === "dict" ? "us" : "")
      );

      const footer = h(doc, "div", {
        className: "zst-foot",
        children: [
          dictToggle,
          copy,
          speak,
          clearContinuous,
          h(doc, "span", { className: "zst-foot-spacer" }),
          status,
        ],
      });

      if (state.mode === "dict") {
        // The word itself is already the dictionary heading; the source block
        // would only duplicate it.
        source.hidden = true;
        panel.classList.add("zst-dict-mode");
      }
      panel.append(header, styleRow, source, resultWrap, actionRow, commentLabel, footer);

      state.refs = {
        header,
        engineSelect,
        styleButton,
        styleRow,
        fontInput,
        lineInput,
        refresh,
        source,
        resultWrap,
        resultHead,
        resultTitle,
        continuous,
        pin,
        result,
        status,
        actions: actionRow,
        commentLabel,
        footer,
        colors,
        highlight,
        underline,
        dictToggle,
        clearContinuous,
        copy,
        speak,
        comment,
      };

      this.setActionState(state, false);
      this.updateClearButton(state);
      if (state.mode === "dict") {
        this.setStatus(
          state,
          `${SelectionTranslatorDictionary.sourceLabel(state.dictSource)} · ${state.word}`
        );
      }
      else {
        this.setStatus(state, `${E.engineLabel(engineId)} · ${cleanText.length} 字符`);
      }
      return state;
    }

    validColor(color) {
      const match = E.ANNOTATION_COLORS.find(
        ([, value]) => String(value).toLowerCase() === String(color || "").toLowerCase()
      );
      return match ? match[1] : E.ANNOTATION_COLORS[0][1];
    }

    // ------------------------------------------------------------ dictionary

    fillModeSelect(state, select) {
      if (!select) {
        return;
      }
      select.replaceChildren();
      const add = (value, text, selected) => {
        const option = state.doc.createElement("option");
        option.value = value;
        option.textContent = text;
        option.selected = !!selected;
        select.appendChild(option);
      };
      if (state.mode === "dict" && state.hasDictionary) {
        for (const source of SelectionTranslatorDictionary.sourceList()) {
          add(`dict:${source.id}`, `词典 · ${source.label}`, source.id === state.dictSource);
        }
        add("mode:translate", "整句翻译（使用翻译引擎）", false);
        select.title = "词典来源（也可以在这里临时切换）";
      }
      else {
        for (const id of E.ENGINE_IDS) {
          add(id, E.engineLabel(id), id === state.engineId);
        }
        select.title = "翻译引擎（也可以在这里临时切换）";
      }
    }

    switchMode(state, mode) {
      if (!state || state.destroyed || state.mode === mode) {
        return;
      }
      if (mode === "dict" && (!state.hasDictionary || !this.getPref("dictionaryEnabled"))) {
        return;
      }
      if (mode === "dict") {
        state.word = normalizeLookupWord(state.cleanText) || state.word;
        if (!state.word) {
          this.setStatus(state, "这不是一个单词，无法查词典", "err");
          return;
        }
      }
      state.mode = mode;
      state.requestId += 1;
      if (state.continuousTimer) {
        clearTimeout(state.continuousTimer);
        state.continuousTimer = null;
      }
      state.translation = "";
      state.dictData = null;
      state.savedKey = "";
      const refs = state.refs;
      if (mode === "dict") {
        state.continuous = false;
        refs.continuous.hidden = true;
        refs.continuous.classList.remove("active");
        refs.source.hidden = true;
        refs.resultTitle.textContent = "词典";
        refs.dictToggle.textContent = "整句翻译";
        state.panel.classList.add("zst-dict-mode");
        this.fillModeSelect(state, refs.engineSelect);
        this.lookupDictionary(state, true);
      }
      else {
        refs.continuous.hidden = false;
        refs.source.hidden = !this.getPref("showSource");
        refs.resultTitle.textContent = "译文";
        refs.dictToggle.textContent = "查词典";
        state.panel.classList.remove("zst-dict-mode");
        this.fillModeSelect(state, refs.engineSelect);
        this.runTranslation(state, true);
      }
      this.updateClearButton(state);
    }

    dictionaryCacheKey(source, word) {
      return `${source}\u0001${String(word || "").toLowerCase()}`;
    }

    async lookupDictionary(state, force) {
      if (!state || state.destroyed || !state.hasDictionary) {
        return;
      }
      const word = normalizeLookupWord(state.word || state.cleanText);
      if (!word) {
        this.setStatus(state, "这不是一个单词，无法查词典", "err");
        return;
      }
      state.word = word;
      state.requestId += 1;
      const requestId = state.requestId;
      const source = state.dictSource;
      const cacheKey = this.dictionaryCacheKey(source, word);
      this.setDictLoading(state);
      try {
        let data = force ? null : this.dictCache.get(cacheKey);
        let cached = !!data;
        if (!data) {
          data = await this.dictionary.lookup({
            word,
            source,
            doc: state.doc,
            host: this.host,
            engineId: state.engineId,
            reader: state.reader,
            paperContext: this.getPaperContext(state.reader),
            sourceLang: this.getPref("sourceLanguage"),
            targetLang: this.getPref("targetLanguage"),
            // Oxford and Wiktionary only define words in English; use the
            // user's selected translation engine to add a short Chinese
            // gloss. Failures are ignored by the dictionary module.
            translateWord: (text) =>
              this.translateText({
                text,
                engineId: state.engineId,
                sourceLang: this.getPref("sourceLanguage"),
                targetLang: this.getPref("targetLanguage"),
                reader: state.reader,
              }).then((result) => result.translation),
          });
          if (data && data.word) {
            this.dictCache.set(cacheKey, data);
            while (this.dictCache.size > 300) {
              this.dictCache.delete(this.dictCache.keys().next().value);
            }
          }
        }
        if (state.destroyed || requestId !== state.requestId || state.mode !== "dict") {
          return;
        }
        if (!data || !data.entries || !data.entries.length) {
          throw new Error("这个词典没有返回释义。");
        }
        state.dictData = data;
        state.translation = this.dictionary.plainText(data);
        state.speakText = data.word || word;
        state.speakLang = "en-US";
        this.renderDictionary(state, data);
        this.setActionState(state, true);
        const sourceLabel = data.sourceLabel || this.dictionary.sourceLabel(source);
        const entryCount = data.entries.length;
        this.setStatus(
          state,
          `${sourceLabel}${cached || data.cached ? " · 缓存" : ""} · ${entryCount} 组释义`,
          "ok"
        );
      }
      catch (error) {
        if (state.destroyed || requestId !== state.requestId || state.mode !== "dict") {
          return;
        }
        this.log("dictionary lookup failed", error);
        this.setDictError(state, error);
      }
    }

    setDictLoading(state) {
      const doc = state.doc;
      const result = state.refs.result;
      const loading = h(doc, "div", { className: "zst-loading" });
      loading.append(
        h(doc, "span", { className: "zst-spinner" }),
        h(doc, "span", { text: `正在查询“${state.word}”…` })
      );
      result.replaceChildren(loading);
      state.refs.refresh?.classList.add("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = true;
      }
      this.setActionState(state, false);
      this.setStatus(state, `${this.dictionary.sourceLabel(state.dictSource)} · 请求中…`);
    }

    setDictError(state, error) {
      const doc = state.doc;
      const result = state.refs.result;
      const message = this.formatError(error);
      const box = h(doc, "div", { className: "zst-error" });
      box.append(
        h(doc, "div", { className: "zst-error-title", text: "词典查询失败" }),
        h(doc, "div", { className: "zst-error-msg", text: message })
      );
      const retry = h(doc, "button", {
        className: "zst-btn",
        text: "重试",
        attrs: { type: "button" },
      });
      retry.addEventListener("click", () => this.lookupDictionary(state, true));
      const translate = h(doc, "button", {
        className: "zst-btn",
        text: "改用整句翻译",
        attrs: { type: "button" },
      });
      translate.addEventListener("click", () => this.switchMode(state, "translate"));
      const actions = h(doc, "div", { className: "zst-error-actions" });
      actions.append(retry, translate);
      box.append(actions);
      result.replaceChildren(box);
      state.refs.refresh?.classList.remove("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = false;
      }
      this.setActionState(state, false);
      this.setStatus(state, "词典查询失败", "err");
    }

    renderDictionary(state, data) {
      const doc = state.doc;
      const wrapper = h(doc, "div", { className: "zst-dict" });
      const head = h(doc, "div", { className: "zst-dict-head" });
      head.append(
        h(doc, "span", { className: "zst-dict-word", text: data.word || state.word })
      );
      const phoneticButtons = [];
      for (const accent of ["us", "uk"]) {
        const ipa = data.phonetics && data.phonetics[accent];
        const audio = data.audio && data.audio[accent];
        if (!ipa && !audio) {
          continue;
        }
        const label = accent === "us" ? "美" : "英";
        const text = ipa ? `${label} /${ipa}/` : `${label} 发音`;
        const button = h(doc, "button", {
          className: "zst-phonetic-btn",
          text,
          attrs: {
            type: "button",
            title: `点击朗读${label}式发音`,
            "aria-label": `朗读${label}式发音`,
            "data-accent": accent,
          },
        });
        button.addEventListener("click", () => this.speakWord(state, accent));
        phoneticButtons.push(button);
      }
      if (phoneticButtons.length) {
        const row = h(doc, "span", { className: "zst-phonetics" });
        row.append(...phoneticButtons);
        head.append(row);
      }
      wrapper.append(head);
      if (data.translation) {
        wrapper.append(
          h(doc, "div", {
            className: "zst-dict-translation",
            text: data.translation,
          })
        );
      }

      const entries = h(doc, "div", { className: "zst-dict-entries" });
      const showDefinitions = !!this.getPref("dictionaryShowDefinitions");
      for (const entry of data.entries || []) {
        const node = h(doc, "div", { className: "zst-dict-entry" });
        const line = h(doc, "div", { className: "zst-dict-line" });
        line.append(
          h(doc, "span", {
            className: "zst-dict-pos",
            text: entry.pos || "释义",
          })
        );
        const meanings = h(doc, "span", { className: "zst-dict-meanings" });
        const terms = (entry.terms || []).filter(Boolean);
        if (terms.length) {
          meanings.textContent = terms.join("；");
        }
        else if ((entry.definitions || []).length) {
          meanings.textContent = entry.definitions[0];
        }
        line.append(meanings);
        node.append(line);
        if (showDefinitions && (entry.definitions || []).length) {
          const defs = h(doc, "div", { className: "zst-dict-defs" });
          for (const def of entry.definitions.slice(0, 3)) {
            defs.append(h(doc, "div", { className: "zst-dict-def", text: def }));
          }
          node.append(defs);
        }
        if ((entry.examples || []).length) {
          const examples = h(doc, "div", { className: "zst-dict-examples" });
          for (const example of entry.examples.slice(0, 2)) {
            examples.append(
              h(doc, "div", { className: "zst-dict-example", text: example })
            );
          }
          node.append(examples);
        }
        entries.append(node);
      }
      wrapper.append(entries);

      const sourceLabel = data.sourceLabel || this.dictionary.sourceLabel(state.dictSource);
      const source = h(doc, "div", { className: "zst-dict-source" });
      source.append(h(doc, "span", { text: `释义来源：${sourceLabel}` }));
      if (data.sourceUrl) {
        const link = h(doc, "button", {
          className: "zst-link-btn zst-dict-link",
          text: "在浏览器中打开",
          attrs: { type: "button" },
        });
        link.addEventListener("click", () => {
          try {
            Zotero.launchURL(data.sourceUrl);
          }
          catch (e) {
            this.setStatus(state, "无法打开链接", "err");
          }
        });
        source.append(link);
      }
      if (data.note) {
        source.append(h(doc, "span", { className: "zst-dict-note", text: data.note }));
      }
      wrapper.append(source);
      state.refs.result.replaceChildren(wrapper);
      this.updateClearButton(state);
      this.autoSizePanel(state);
      state.refs.refresh?.classList.remove("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = false;
      }
    }

    speechWindows(state) {
      const windows = [];
      try {
        const main = Zotero.getMainWindow();
        if (main) {
          windows.push(main);
        }
      }
      catch (e) {
        // Ignore.
      }
      try {
        const docWin = state.doc && state.doc.defaultView;
        if (docWin && !windows.includes(docWin)) {
          windows.push(docWin);
        }
      }
      catch (e) {
        // Ignore.
      }
      return windows;
    }

    stopAudio(state) {
      try {
        state.audioPlayer?.pause?.();
      }
      catch (e) {
        // Ignore.
      }
      state.audioPlayer = null;
      for (const win of this.speechWindows(state)) {
        try {
          win.speechSynthesis?.cancel?.();
        }
        catch (e) {
          // Ignore.
        }
      }
    }

    /**
     * Set a temporary "reading" status and return a callback that restores the
     * previous status when playback ends. This is what keeps the footer from
     * being stuck on “正在朗读…” forever.
     */
    beginSpeechStatus(state, text) {
      const previous = state.lastStatus || null;
      this.setStatus(state, text || "正在朗读…");
      let finished = false;
      return (finalText, kind) => {
        if (finished || state.destroyed) {
          return;
        }
        finished = true;
        if (finalText) {
          this.setStatus(state, finalText, kind);
          setTimeout(() => {
            if (!state.destroyed && previous) {
              this.setStatus(state, previous.text, previous.kind);
            }
          }, 1800);
        }
        else if (previous) {
          this.setStatus(state, previous.text, previous.kind);
        }
      };
    }

    speakWord(state, accent) {
      const data = state.dictData;
      const word = (data && data.word) || state.word;
      const audioUrl = data && data.audio && data.audio[accent];
      const lang = accent === "uk" ? "en-GB" : "en-US";
      const label = accent === "uk" ? "英" : "美";
      this.stopAudio(state);
      const restore = this.beginSpeechStatus(state, `正在朗读${label}式发音…`);
      const fallback = () => this.speakText(state, word, lang, restore);
      if (audioUrl) {
        // First try the media element directly (it starts synchronously in the
        // click handler, which keeps browser autoplay permission). If that
        // fails, download the bytes and play them from a Blob URL.
        this.playAudioUrl(state, audioUrl, () => restore(), () => {
          this.playAudioBlob(state, audioUrl, () => restore(), fallback);
        });
        return;
      }
      this.speakText(state, word, lang, restore);
    }

    playAudioUrl(state, url, onDone, onFail) {
      let finished = false;
      const win = this.speechWindows(state)[0];
      if (!win || !win.Audio) {
        onFail();
        return;
      }
      let player;
      let timer = null;
      try {
        player = new win.Audio(url);
        player.volume = 1;
        player.preload = "auto";
        state.audioPlayer = player;
        const finish = (ok) => {
          if (finished) {
            return;
          }
          finished = true;
          if (timer) {
            win.clearTimeout(timer);
          }
          try {
            player.pause();
          }
          catch (e) {
            // Ignore.
          }
          if (ok) {
            onDone();
          }
          else {
            onFail();
          }
        };
        player.addEventListener("ended", () => finish(true), { once: true });
        player.addEventListener("error", () => finish(false), { once: true });
        timer = win.setTimeout(() => finish(false), 5000);
        const playing = player.play?.();
        if (playing && typeof playing.catch === "function") {
          playing.catch(() => finish(false));
        }
      }
      catch (e) {
        onFail();
      }
    }

    async playAudioBlob(state, url, onDone, onFail) {
      let win = null;
      let objectUrl = "";
      try {
        const res = await Zotero.HTTP.request("GET", url, {
          responseType: "arraybuffer",
          timeout: 15000,
          successCodes: [200],
          errorDelayMax: 0,
          noRetryOnThrottle: true,
        });
        const buffer = res && res.response;
        win = this.speechWindows(state)[0];
        if (!buffer || !win || !win.Blob || !win.URL) {
          throw new Error("音频数据为空");
        }
        const blob = new win.Blob([buffer], { type: "audio/mpeg" });
        objectUrl = win.URL.createObjectURL(blob);
        this.playAudioUrl(
          state,
          objectUrl,
          () => {
            try {
              win.URL.revokeObjectURL(objectUrl);
            }
            catch (e) {
              // Ignore.
            }
            onDone();
          },
          () => {
            try {
              win.URL.revokeObjectURL(objectUrl);
            }
            catch (e) {
              // Ignore.
            }
            onFail();
          }
        );
      }
      catch (e) {
        if (objectUrl && win) {
          try {
            win.URL.revokeObjectURL(objectUrl);
          }
          catch (e2) {
            // Ignore.
          }
        }
        onFail();
      }
    }

    speakText(state, text, lang, onDone) {
      const value = String(text || "").trim();
      const restore = onDone || (() => {});
      if (!value) {
        this.setStatus(state, "没有可朗读的内容", "err");
        restore();
        return;
      }
      for (const win of this.speechWindows(state)) {
        try {
          const synth = win.speechSynthesis;
          const Utterance = win.SpeechSynthesisUtterance;
          if (!synth || !Utterance) {
            continue;
          }
          const utterance = new Utterance(value);
          utterance.lang = lang || this.speechLang(this.getPref("targetLanguage"));
          utterance.rate = 0.95;
          // Ultimate safety net: never leave the footer stuck on "正在朗读…"
          // even if the engine never fires end/error.
          const safety = setTimeout(() => restore(), 30000);
          utterance.onend = () => {
            clearTimeout(safety);
            restore();
          };
          utterance.onerror = () => {
            clearTimeout(safety);
            this.setStatus(state, "系统朗读失败", "err");
            setTimeout(() => restore(), 1800);
          };
          synth.cancel();
          synth.speak(utterance);
          return;
        }
        catch (e) {
          // Try the next window.
        }
      }
      this.setStatus(state, "当前环境不支持朗读", "err");
      setTimeout(() => restore(), 1800);
    }

    showTranslatePrompt(state) {
      if (state.destroyed) {
        return;
      }
      const result = state.refs.result;
      const prompt = h(state.doc, "div", { className: "zst-prompt" });
      const button = h(state.doc, "button", {
        className: "zst-btn primary",
        text: "翻译这段文字",
        attrs: { type: "button" },
      });
      button.addEventListener("click", () => this.runTranslation(state, true));
      prompt.append(button);
      result.replaceChildren(prompt);
      this.setActionState(state, false);
      this.updateClearButton(state);
    }

    setStatus(state, text, kind) {
      if (!state.refs.status) {
        return;
      }
      state.refs.status.textContent = text || "";
      state.refs.status.classList.toggle("ok", kind === "ok");
      state.refs.status.classList.toggle("err", kind === "err");
      state.lastStatus = { text: text || "", kind: kind || "" };
    }

    setActionState(state, enabled) {
      const refs = state.refs;
      for (const node of [refs.highlight, refs.underline, refs.copy, refs.speak]) {
        if (node) {
          node.disabled = !enabled;
        }
      }
    }

    setLoading(state) {
      const result = state.refs.result;
      const loading = h(state.doc, "div", { className: "zst-loading" });
      loading.append(
        h(state.doc, "span", { className: "zst-spinner" }),
        h(state.doc, "span", { text: "正在翻译…" })
      );
      result.replaceChildren(loading);
      state.refs.refresh?.classList.add("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = true;
      }
      this.setActionState(state, false);
      this.setStatus(state, `${E.engineLabel(state.engineId)} · 请求中…`);
    }

    setResult(state, translation, info) {
      const result = state.refs.result;
      const text = h(state.doc, "div", {
        className: "zst-translation",
        text: translation,
      });
      text.dir = this.isRtl(this.getPref("targetLanguage")) ? "rtl" : "ltr";
      result.replaceChildren(text);
      state.speakText = "";
      state.speakLang = this.speechLang(this.getPref("targetLanguage"));
      state.refs.refresh?.classList.remove("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = false;
      }
      this.setActionState(state, true);
      this.updateClearButton(state);
      this.autoSizePanel(state);
      const suffix = info && info.cached ? "缓存" : info && info.fallback ? "备用" : "";
      this.setStatus(
        state,
        `${E.engineLabel((info && info.engine) || state.engineId)}${suffix ? ` · ${suffix}` : ""} · ${
          translation.length
        } 字符`
      );
    }

    setError(state, error) {
      const result = state.refs.result;
      const message = this.formatError(error);
      const box = h(state.doc, "div", { className: "zst-error" });
      const title = h(state.doc, "div", { className: "zst-error-title", text: "翻译失败" });
      const body = h(state.doc, "div", { className: "zst-error-msg", text: message });
      const retry = h(state.doc, "button", {
        className: "zst-btn",
        text: "重试",
        attrs: { type: "button" },
      });
      retry.addEventListener("click", () => this.runTranslation(state, true));
      box.append(title, body, retry);
      const raw = error && (error.body || error.message);
      if (raw && String(raw) !== message) {
        const details = h(state.doc, "details", { className: "zst-error-details" });
        details.append(
          h(state.doc, "summary", { text: "技术详情" }),
          h(state.doc, "pre", { text: String(raw).slice(0, 2000) })
        );
        box.append(details);
      }
      result.replaceChildren(box);
      state.refs.refresh?.classList.remove("zst-spinning");
      if (state.refs.refresh) {
        state.refs.refresh.disabled = false;
      }
      this.setActionState(state, false);
      this.updateClearButton(state);
      this.setStatus(state, "翻译失败", "err");
    }

    formatError(error) {
      if (!error) {
        return "未知错误";
      }
      const status = error.status;
      const raw = String(error.message || error);
      if (status === 429) {
        return raw.includes("限流")
          ? raw
          : "请求过于频繁（429）。请稍后再试，或切换翻译引擎 / 配置官方 API Key。";
      }
      if (status === 401) {
        return "认证失败（401）。请检查 API Key 是否正确、是否有余额。";
      }
      if (status === 403) {
        return raw.includes("DeepL")
          ? raw
          : "请求被拒绝（403）。请检查 API Key、区域设置、网络或服务条款限制。";
      }
      if (status === 0) {
        return raw && !/Network request failed/i.test(raw)
          ? raw
          : "网络请求失败。请检查网络连接或 Zotero 代理设置。";
      }
      return raw;
    }

    isRtl(code) {
      return ["ar", "he", "fa", "ur"].includes(String(code || "").split("-")[0]);
    }

    speak(state, accent) {
      if (state.mode === "dict") {
        this.speakWord(state, accent === "uk" ? "uk" : "us");
        return;
      }
      const text = state.speakText || state.translation;
      if (!text) {
        return;
      }
      this.stopAudio(state);
      const restore = this.beginSpeechStatus(state, "正在朗读…");
      this.speakText(
        state,
        text,
        this.speechLang(this.getPref("targetLanguage")),
        restore
      );
    }

    speechLang(code) {
      const map = {
        "zh-CN": "zh-CN",
        "zh-TW": "zh-TW",
        en: "en-US",
        ja: "ja-JP",
        ko: "ko-KR",
        fr: "fr-FR",
        de: "de-DE",
        es: "es-ES",
        ru: "ru-RU",
        pt: "pt-BR",
        it: "it-IT",
        ar: "ar-SA",
      };
      return map[code] || code || "en-US";
    }

    getPaperContext(reader) {
      try {
        let attachment = reader && reader._item;
        if (!attachment && reader && reader.itemID) {
          attachment = Zotero.Items.get(reader.itemID);
        }
        if (!attachment) {
          return {};
        }
        const parent = attachment.parentItem || attachment;
        const title = parent.getField ? parent.getField("title") || "" : "";
        let abstract = parent.getField ? parent.getField("abstractNote") || "" : "";
        abstract = stripHtml(abstract).slice(0, 3000);
        return { title: String(title).slice(0, 500), abstract };
      }
      catch (e) {
        return {};
      }
    }

    cacheKey(engineId, sourceLang, targetLang, text) {
      return `${engineId}\u0001${sourceLang}\u0001${targetLang}\u0001${text}`;
    }

    readCache(key) {
      const entry = this.cache.get(key);
      if (!entry) {
        return null;
      }
      if (Date.now() - entry.time > 1000 * 60 * 60 * 12) {
        this.cache.delete(key);
        return null;
      }
      return entry.value;
    }

    writeCache(key, value) {
      this.cache.set(key, { time: Date.now(), value });
      while (this.cache.size > CACHE_LIMIT) {
        const first = this.cache.keys().next().value;
        this.cache.delete(first);
      }
    }

    async translateText({ text, engineId, sourceLang, targetLang, reader }) {
      const clean = E.normalizeText(text);
      if (!clean) {
        throw new Error("没有可翻译的文本。");
      }
      const source = E.resolveSourceFor(engineId, sourceLang, clean);
      const key = this.cacheKey(engineId, source, targetLang, clean);
      const cached = this.readCache(key);
      if (cached) {
        return { ...cached, cached: true };
      }
      if (this.inflight.has(key)) {
        return await this.inflight.get(key);
      }

      const task = (async () => {
        let result;
        let actualEngine = engineId;
        const engine = this.engines[engineId];
        if (!engine) {
          throw new Error(`未知翻译引擎：${engineId}`);
        }
        try {
          result = await engine.translate({
            text: clean,
            sourceLang: source,
            targetLang,
            paperContext: this.getPaperContext(reader),
            host: this.host,
          });
        }
        catch (error) {
          const fallback = this.fallbackFor(engineId, error);
          if (!fallback) {
            throw error;
          }
          this.log("fallback", engineId, "->", fallback, error && error.message);
          const fbEngine = this.engines[fallback];
          const fbSource = E.resolveSourceFor(fallback, sourceLang, clean);
          try {
            result = await fbEngine.translate({
              text: clean,
              sourceLang: fbSource,
              targetLang,
              paperContext: this.getPaperContext(reader),
              host: this.host,
            });
            actualEngine = fallback;
          }
          catch (fallbackError) {
            error.message = `${error.message}；备用引擎 ${E.engineLabel(fallback)} 也失败：${
              fallbackError.message
            }`;
            throw error;
          }
        }
        const value = {
          translation: String(result || "").trim(),
          engine: actualEngine,
          sourceLang: source,
          targetLang,
          fallback: actualEngine !== engineId,
        };
        if (!value.translation) {
          throw new Error("翻译结果为空。");
        }
        this.writeCache(key, value);
        return value;
      })();

      this.inflight.set(key, task);
      try {
        return await task;
      }
      finally {
        this.inflight.delete(key);
      }
    }

    fallbackFor(engineId, error) {
      if (!this.getPref("fallbackEnabled")) {
        return "";
      }
      if (!["deepl-free", "google-free"].includes(engineId)) {
        return "";
      }
      const fallback = this.getPref("fallbackEngine");
      if (!fallback || fallback === engineId || !E.ENGINE_IDS.includes(fallback)) {
        return "";
      }
      // Do not mask a configuration error by silently using another engine.
      if (error && error.status === 401) {
        return "";
      }
      return fallback;
    }

    async runTranslation(state, force) {
      if (state.destroyed || state.mode === "dict") {
        return;
      }
      if (!force && state.translation) {
        return;
      }
      state.requestId += 1;
      const requestId = state.requestId;
      this.setLoading(state);
      try {
        const result = await this.translateText({
          text: state.cleanText,
          engineId: state.engineId,
          sourceLang: this.getPref("sourceLanguage"),
          targetLang: this.getPref("targetLanguage"),
          reader: state.reader,
        });
        if (state.destroyed || requestId !== state.requestId) {
          return;
        }
        state.translation = result.translation;
        state.resultInfo = result;
        this.setResult(state, result.translation, result);
        if (result.fallback) {
          this.setStatus(
            state,
            `${E.engineLabel(result.engine)} · 备用引擎 · ${result.translation.length} 字符`,
            "ok"
          );
        }
        else if (result.cached) {
          this.setStatus(
            state,
            `${E.engineLabel(result.engine)} · 缓存 · ${result.translation.length} 字符`
          );
        }
      }
      catch (error) {
        if (state.destroyed || requestId !== state.requestId) {
          return;
        }
        this.log("translation failed", error);
        this.setError(state, error);
      }
    }

    // ------------------------------------------------------------- annotation

    generateAnnotationKey() {
      try {
        if (Zotero.DataObjectUtilities && Zotero.DataObjectUtilities.generateKey) {
          return Zotero.DataObjectUtilities.generateKey();
        }
      }
      catch (e) {
        // Fall through.
      }
      try {
        if (Zotero.Utilities && Zotero.Utilities.generateObjectKey) {
          return Zotero.Utilities.generateObjectKey();
        }
      }
      catch (e) {
        // Fall through.
      }
      // Last-resort fallback. Zotero annotation keys use an uppercase
      // alphabet without visually ambiguous characters.
      const alphabet = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
      let key = "";
      for (let i = 0; i < 8; i++) {
        key += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      return key;
    }

    async saveAnnotation(state, type) {
      if (!state.translation) {
        this.setStatus(state, "请等待翻译完成后再保存标注", "err");
        return;
      }
      if (!["highlight", "underline"].includes(type)) {
        return;
      }
      const refs = state.refs;
      refs.highlight.disabled = true;
      refs.underline.disabled = true;
      this.setStatus(state, "正在保存标注…");
      try {
        const annotation = JSON.parse(JSON.stringify(state.params.annotation));
        const attachment = state.reader._item || Zotero.Items.get(state.reader.itemID);
        if (!attachment) {
          throw new Error("找不到当前 PDF 附件。");
        }
        // A selection popup is re-rendered on colour changes and scrolling,
        // which creates a fresh panel state. Keep a stable signature so a
        // second click updates the same annotation instead of creating a
        // duplicate.
        let signature = "";
        try {
          signature = [
            attachment.id,
            annotation.text || "",
            JSON.stringify(annotation.position || {}),
          ].join("\u0001");
        }
        catch (e) {
          signature = "";
        }
        let key = state.savedKey || (signature && this.annotationKeys.get(signature));
        if (!key) {
          key = this.generateAnnotationKey();
        }
        if (signature) {
          this.annotationKeys.set(signature, key);
          while (this.annotationKeys.size > 500) {
            this.annotationKeys.delete(this.annotationKeys.keys().next().value);
          }
        }
        annotation.key = key;
        annotation.type = type;
        annotation.color = state.selectedColor;
        annotation.comment = refs.comment.checked ? state.translation : "";
        annotation.pageLabel = annotation.pageLabel == null ? "" : String(annotation.pageLabel);
        // Let Zotero fill in the author; an empty value avoids carrying a
        // stale authorName from another reader context.
        annotation.authorName = "";
        await Zotero.Annotations.saveFromJSON(attachment, annotation);
        state.savedKey = annotation.key;
        const typeLabel = type === "highlight" ? "高亮" : "划线";
        const commentLabel = refs.comment.checked ? "，译文已写入评论" : "";
        this.setStatus(state, `已保存为${typeLabel}${commentLabel}`, "ok");
      }
      catch (error) {
        this.log("save annotation failed", error);
        this.setStatus(state, `保存标注失败：${this.formatError(error)}`, "err");
      }
      finally {
        if (!state.destroyed) {
          refs.highlight.disabled = false;
          refs.underline.disabled = false;
        }
      }
    }

    // ------------------------------------------------------------ pinned panel

    readerKey(reader) {
      return reader && (reader._instanceID || reader.itemID);
    }

    getActivePin(reader) {
      const key = this.readerKey(reader);
      if (!key) {
        return null;
      }
      const state = this.activePins.get(key);
      if (!state || !state.panel || !state.panel.isConnected) {
        this.activePins.delete(key);
        return null;
      }
      return state;
    }

    updatePinnedTranslation(state, event) {
      const params = event && event.params;
      const annotation = params && params.annotation;
      const rawText = String(annotation && annotation.text || "").trim();
      const cleanText = E.normalizeText(rawText);
      if (!cleanText || state.destroyed) {
        return;
      }

      // A pinned dictionary card follows the same rule as the popup: single
      // words stay in dictionary mode, longer selections become translation.
      if (state.mode === "dict") {
        const nextWord = normalizeLookupWord(cleanText);
        state.doc = event.doc;
        state.reader = event.reader;
        state.params = params;
        state.savedKey = "";
        if (nextWord && this.getPref("dictionaryEnabled")) {
          state.sourceText = rawText;
          state.cleanText = cleanText;
          state.word = nextWord;
          this.flashPanel(state);
          this.lookupDictionary(state, true);
          return;
        }
        state.mode = "translate";
        state.panel.classList.remove("zst-dict-mode");
        state.refs.continuous.hidden = false;
        state.refs.resultTitle.textContent = "译文";
        state.refs.dictToggle.textContent = "查词典";
        this.fillModeSelect(state, state.refs.engineSelect);
        this.updateClearButton(state);
      }

      if (state.continuous) {
        this.appendContinuousSelection(state, event, rawText, cleanText, params);
        return;
      }

      const nextWord = normalizeLookupWord(cleanText);
      if (this.getPref("dictionaryEnabled") && state.hasDictionary && nextWord) {
        state.doc = event.doc;
        state.reader = event.reader;
        state.params = params;
        state.sourceText = rawText;
        state.cleanText = cleanText;
        state.word = nextWord;
        state.savedKey = "";
        this.switchMode(state, "dict");
        this.flashPanel(state);
        return;
      }

      state.doc = event.doc;
      state.reader = event.reader;
      state.params = params;
      state.sourceText = rawText;
      state.cleanText = cleanText;
      state.translation = "";
      state.speakText = "";
      state.savedKey = "";
      state.requestId += 1;

      const source = state.refs.source;
      if (source) {
        source.textContent = rawText;
        source.title = `${rawText}\n\n可滚动查看全文；拖动右下角可调整高度。`;
        source.hidden = !this.getPref("showSource");
      }
      this.setStatus(state, `${E.engineLabel(state.engineId)} · ${cleanText.length} 字符`);
      this.updateClearButton(state);
      this.flashPanel(state);

      if (this.getPref("autoTranslate")) {
        this.runTranslation(state, true);
      }
      else {
        this.showTranslatePrompt(state);
      }
    }

    flashPanel(state) {
      if (!state.panel) {
        return;
      }
      state.panel.classList.remove("zst-updated");
      // Force a reflow so the same animation can replay on consecutive
      // selections.
      void state.panel.offsetWidth;
      state.panel.classList.add("zst-updated");
    }

    // ------------------------------------------------------- continuous mode

    updateContinuousButton(state) {
      const button = state.refs && state.refs.continuous;
      if (!button) {
        return;
      }
      const on = !!state.continuous;
      button.textContent = on ? "连续中" : "连续翻译";
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.title = on
        ? "连续翻译已开启：之后的划词会追加到本卡片，点击关闭"
        : "连续翻译：置顶当前卡片，之后在不同位置划词会追加到同一段译文";
    }

    updateClearButton(state) {
      const button = state.refs && state.refs.clearContinuous;
      if (!button) {
        return;
      }
      const hasContent =
        state.mode !== "dict" &&
        (!!String(state.sourceText || "").trim() ||
          !!String(state.translation || "").trim() ||
          (state.segments && state.segments.length > 0));
      button.hidden = !hasContent;
    }

    toggleContinuous(state) {
      if (!state || !state.panel || state.mode === "dict") {
        return;
      }
      state.continuous = !state.continuous;
      if (state.continuous) {
        if (!state.segments.length) {
          state.segments.push({
            sourceText: state.sourceText,
            cleanText: state.cleanText,
          });
        }
        if (!state.pinned) {
          this.pinPanel(state);
        }
        this.updateClearButton(state);
        this.setStatus(state, "连续翻译已开启：在别处继续划词会合并后重新翻译", "ok");
        // If the first fragment was never translated, start the merged
        // translation now instead of waiting for another selection.
        if (!String(state.translation || "").trim() && state.cleanText) {
          state.requestId += 1;
          this.scheduleContinuousTranslation(state, state.requestId);
        }
      }
      else {
        this.updateClearButton(state);
        this.setStatus(state, "连续翻译已关闭", "");
      }
      this.updateContinuousButton(state);
    }

    /**
     * Append the new selection, then debounce and translate the whole merged
     * text again. This avoids translating two halves of one sentence
     * independently: the engine always sees the complete paragraph.
     */
    appendContinuousSelection(state, event, rawText, cleanText, params) {
      const last = state.segments[state.segments.length - 1];
      if (last && last.cleanText === cleanText) {
        this.flashPanel(state);
        this.setStatus(state, "这段内容已经在卡片中", "ok");
        return;
      }

      state.continuousRollback = {
        sourceText: state.sourceText,
        cleanText: state.cleanText,
      };
      state.doc = event.doc;
      state.reader = event.reader;
      state.params = params;
      state.savedKey = "";
      state.sourceText = joinText(state.sourceText, rawText);
      state.cleanText = joinText(state.cleanText, cleanText);
      state.segments.push({ sourceText: rawText, cleanText });

      const source = state.refs.source;
      if (source) {
        source.textContent = state.sourceText;
        source.title = `${state.sourceText}\n\n可滚动查看全文；拖动右下角可调整高度。`;
        source.hidden = !this.getPref("showSource");
      }
      this.flashPanel(state);
      this.updateClearButton(state);
      state.requestId += 1;
      const requestId = state.requestId;
      this.setStatus(
        state,
        `连续翻译 · ${state.segments.length} 段 · 等待合并翻译…`
      );
      this.scheduleContinuousTranslation(state, requestId);
    }

    scheduleContinuousTranslation(state, requestId) {
      if (state.continuousTimer) {
        clearTimeout(state.continuousTimer);
      }
      state.continuousTimer = setTimeout(() => {
        state.continuousTimer = null;
        this.runContinuousTranslation(state, requestId);
      }, CONTINUOUS_DEBOUNCE_MS);
    }

    async runContinuousTranslation(state, requestId) {
      if (state.destroyed || requestId !== state.requestId) {
        return;
      }
      const text = state.cleanText;
      if (!text) {
        return;
      }
      this.setStatus(
        state,
        `连续翻译 · ${state.segments.length} 段 · 正在合并翻译…`
      );
      try {
        const result = await this.translateText({
          text,
          engineId: state.engineId,
          sourceLang: this.getPref("sourceLanguage"),
          targetLang: this.getPref("targetLanguage"),
          reader: state.reader,
        });
        if (state.destroyed || requestId !== state.requestId) {
          return;
        }
        state.translation = result.translation;
        state.speakText = "";
        state.continuousRollback = null;
        this.setResult(state, state.translation, result);
        this.updateClearButton(state);
        this.autoSizePanel(state);
        this.setStatus(
          state,
          `连续 ${state.segments.length} 段 · ${E.engineLabel(result.engine)} · ${state.translation.length} 字符`,
          "ok"
        );
        const resultNode = state.refs.result;
        if (resultNode) {
          resultNode.scrollTop = resultNode.scrollHeight;
        }
      }
      catch (error) {
        if (state.destroyed || requestId !== state.requestId) {
          return;
        }
        this.log("continuous merged translation failed", error);
        const rollback = state.continuousRollback;
        if (rollback) {
          state.sourceText = rollback.sourceText;
          state.cleanText = rollback.cleanText;
          state.segments.pop();
          state.continuousRollback = null;
          if (state.refs.source) {
            state.refs.source.textContent = state.sourceText;
            state.refs.source.title = state.sourceText;
          }
        }
        this.updateClearButton(state);
        this.setStatus(state, `合并翻译失败：${this.formatError(error)}`, "err");
      }
    }

    clearContent(state) {
      if (!state || state.destroyed || state.mode === "dict") {
        return;
      }
      if (state.continuousTimer) {
        clearTimeout(state.continuousTimer);
        state.continuousTimer = null;
      }
      state.requestId += 1;
      state.segments = [];
      state.continuousRollback = null;
      state.translation = "";
      state.speakText = "";
      state.sourceText = "";
      state.cleanText = "";
      state.savedKey = "";
      if (state.refs.source) {
        state.refs.source.textContent = "";
        state.refs.source.title = "";
      }
      const prompt = h(state.doc, "div", { className: "zst-prompt" });
      prompt.append(
        h(state.doc, "span", {
          className: "zst-prompt-text",
          text: state.continuous
            ? "已清空，继续划词即可开始新的连续翻译"
            : "已清空，重新划词即可开始新的翻译",
        })
      );
      state.refs.result.replaceChildren(prompt);
      this.setActionState(state, false);
      this.updateClearButton(state);
      this.setStatus(state, "已清空卡片内容", "");
    }

    togglePin(state) {
      if (!state || !state.panel) {
        return;
      }
      if (state.pinned) {
        this.closePinnedPanel(state);
      }
      else {
        this.pinPanel(state);
      }
    }

    pinPanel(state) {
      const panel = state.panel;
      const doc = state.doc;
      const win = doc.defaultView;
      if (!panel.isConnected || !win) {
        return;
      }
      const readerKey = this.readerKey(state.reader);
      const existing = readerKey && this.activePins.get(readerKey);
      if (existing && existing !== state) {
        this.closePinnedPanel(existing);
      }
      const rect = panel.getBoundingClientRect();
      state.homeParent = panel.parentNode;
      state.homeNext = panel.nextSibling;

      const width = Math.max(280, Math.round(rect.width || panel.offsetWidth || 380));
      const height = Math.max(
        220,
        Math.min(Math.round(rect.height || panel.offsetHeight || 360), win.innerHeight - 16)
      );
      const left = Math.max(8, Math.min(Math.round(rect.left || 40), win.innerWidth - width - 8));
      const top = Math.max(8, Math.min(Math.round(rect.top || 80), win.innerHeight - height - 8));

      doc.body.appendChild(panel);
      panel.classList.add("zst-pinned");
      panel.style.position = "fixed";
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.maxWidth = "calc(100vw - 16px)";
      panel.style.maxHeight = "calc(100vh - 16px)";
      panel.style.zIndex = "2147483000";
      state.pinned = true;
      if (readerKey) {
        this.activePins.set(readerKey, state);
      }
      this.addResizeHandles(state);
      this.updatePinButton(state);
    }

    /**
     * Grow the card just enough to show the translation, capped at half of
     * the reader width and half of its height (i.e. at most a quarter of the
     * window area). A manual resize disables automatic sizing for this card.
     */
    autoSizePanel(state) {
      if (
        !state ||
        state.destroyed ||
        !state.panel ||
        !state.panel.isConnected ||
        state.manualSize
      ) {
        return;
      }
      const win = state.doc && state.doc.defaultView;
      if (!win || !win.innerWidth || !win.innerHeight) {
        return;
      }
      const refs = state.refs || {};
      const panel = state.panel;
      const maxWidth = Math.max(300, Math.floor(win.innerWidth / 2));
      const maxHeight = Math.max(220, Math.floor(win.innerHeight / 2));
      const textLength = String(state.translation || "").length;
      const desiredWidth = Math.round(
        state.mode === "dict"
          ? Math.min(maxWidth, Math.max(340, 360 + Math.min(140, textLength * 0.12)))
          : Math.min(maxWidth, Math.max(360, 360 + Math.min(280, textLength * 0.42)))
      );

      const contentHeight = (excludeResult) => {
        let total = 0;
        for (const key of [
          "header",
          "styleRow",
          "source",
          "resultHead",
          "actions",
          "commentLabel",
          "footer",
        ]) {
          const node = refs[key];
          if (!node || node.hidden) {
            continue;
          }
          const style = win.getComputedStyle(node);
          if (style.display === "none") {
            continue;
          }
          total +=
            node.offsetHeight +
            (parseFloat(style.marginTop) || 0) +
            (parseFloat(style.marginBottom) || 0);
        }
        return total;
      };

      if (state.pinned) {
        panel.style.width = `${desiredWidth}px`;
        const result = refs.result;
        const desiredHeight = Math.max(
          200,
          Math.min(
            maxHeight,
            contentHeight() + (result ? result.scrollHeight : 0) + 24
          )
        );
        panel.style.height = `${Math.round(desiredHeight)}px`;
        const left = parseFloat(panel.style.left) || 8;
        const top = parseFloat(panel.style.top) || 8;
        panel.style.left = `${Math.round(
          Math.max(8, Math.min(left, win.innerWidth - desiredWidth - 8))
        )}px`;
        panel.style.top = `${Math.round(
          Math.max(8, Math.min(top, win.innerHeight - Math.round(desiredHeight) - 8))
        )}px`;
      }
      else {
        panel.style.width = `${desiredWidth}px`;
        panel.style.maxWidth = "calc(100vw - 16px)";
        const result = refs.result;
        if (result) {
          const available = Math.max(80, maxHeight - contentHeight() - 16);
          result.style.maxHeight = `${Math.min(
            available,
            Math.max(80, result.scrollHeight)
          )}px`;
        }
      }
    }

    closePinnedPanel(state) {
      const panel = state.panel;
      const readerKey = this.readerKey(state.reader);
      state.pinned = false;
      state.handles.forEach((handle) => handle.remove());
      state.handles = [];
      panel.classList.remove("zst-pinned", "zst-dragging", "zst-resizing", "zst-updated");
      panel.remove();
      state.destroyed = true;
      if (readerKey && this.activePins.get(readerKey) === state) {
        this.activePins.delete(readerKey);
      }
    }

    updatePinButton(state) {
      const pin = state.refs && state.refs.pin;
      if (!pin) {
        return;
      }
      pin.textContent = state.pinned ? "关闭置顶" : "置顶";
      pin.classList.toggle("active", !!state.pinned);
      pin.setAttribute("aria-pressed", state.pinned ? "true" : "false");
      pin.title = state.pinned
        ? "关闭置顶卡片，恢复划词弹出翻译"
        : "把翻译框固定在页面上，后续划词会更新此卡片";
    }

    beginDrag(state, event) {
      if (
        !state.pinned ||
        state.resizing ||
        state.dragging ||
        event.button !== 0 ||
        Date.now() < (state.suppressDragUntil || 0)
      ) {
        return;
      }
      const target = event.target;
      if (
        target &&
        target.closest &&
        target.closest(
          "button, select, input, textarea, a, label, .zst-resize-handle"
        )
      ) {
        return;
      }
      // A pointerdown close to the left corners belongs to the (larger)
      // resize hit zones. Without this guard a slightly missed corner drag
      // would move the whole card instead of resizing it.
      const dragRect = state.panel.getBoundingClientRect();
      const dx0 = event.clientX - dragRect.left;
      const dy0 = event.clientY - dragRect.top;
      const corner = 26;
      if (dx0 <= corner && (dy0 <= corner || dy0 >= dragRect.height - corner)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const win = state.doc.defaultView;
      const panel = state.panel;
      const rect = panel.getBoundingClientRect();
      const start = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      state.dragging = true;
      panel.classList.add("zst-dragging");
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      catch (e) {
        // Pointer capture is an optimization; window listeners still work.
      }
      let frame = null;
      let latestX = event.clientX;
      let latestY = event.clientY;
      let dx = 0;
      let dy = 0;
      const apply = () => {
        frame = null;
        const minLeft = 8;
        const minTop = 8;
        const maxLeft = Math.max(minLeft, win.innerWidth - start.width - 8);
        const maxTop = Math.max(minTop, win.innerHeight - 36);
        dx = Math.max(minLeft - start.left, Math.min(latestX - start.x, maxLeft - start.left));
        dy = Math.max(minTop - start.top, Math.min(latestY - start.y, maxTop - start.top));
        // Transform is compositor-friendly; commit to left/top on release.
        panel.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
      };
      const onMove = (moveEvent) => {
        latestX = moveEvent.clientX;
        latestY = moveEvent.clientY;
        if (!frame) {
          frame = win.requestAnimationFrame(apply);
        }
      };
      const onUp = () => {
        if (frame) {
          win.cancelAnimationFrame(frame);
          frame = null;
        }
        apply();
        panel.style.left = `${Math.round(start.left + dx)}px`;
        panel.style.top = `${Math.round(start.top + dy)}px`;
        panel.style.transform = "";
        panel.classList.remove("zst-dragging");
        state.dragging = false;
        win.removeEventListener("pointermove", onMove);
        win.removeEventListener("pointerup", onUp);
        win.removeEventListener("pointercancel", onUp);
      };
      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp);
      win.addEventListener("pointercancel", onUp);
    }

    addResizeHandles(state) {
      if (state.handles.length) {
        return;
      }
      const panel = state.panel;
      const doc = state.doc;
      for (const dir of ["n", "s", "e", "w", "nw", "ne", "sw", "se"]) {
        const handle = h(doc, "div", {
          className: `zst-resize-handle zst-resize-${dir}`,
          attrs: {
            "data-dir": dir,
            title: "拖动调整翻译框大小",
            "aria-hidden": "true",
          },
        });
        // Capture phase: resize must win over any drag handler on an
        // ancestor, otherwise pressing a corner can move the whole card.
        handle.addEventListener(
          "pointerdown",
          (event) => this.beginResize(state, dir, event),
          true
        );
        panel.appendChild(handle);
        state.handles.push(handle);
      }
    }

    beginResize(state, dir, event) {
      if (state.resizing || state.dragging) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // Once the user resizes manually, never override their size.
      state.manualSize = true;
      // Also keep the header drag handler from starting on this gesture.
      state.suppressDragUntil = Date.now() + 600;
      const win = state.doc.defaultView;
      const panel = state.panel;
      const rect = panel.getBoundingClientRect();
      const start = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      const minWidth = 260;
      const minHeight = 180;
      state.resizing = true;
      panel.classList.add("zst-resizing");
      panel.style.willChange = "width, height";
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      catch (e) {
        // Pointer capture is an optimization; window listeners still work.
      }
      let frame = null;
      let latestX = event.clientX;
      let latestY = event.clientY;
      let next = {
        left: start.left,
        top: start.top,
        width: start.width,
        height: start.height,
      };
      const apply = () => {
        frame = null;
        let left = start.left;
        let top = start.top;
        let width = start.width;
        let height = start.height;
        const dx = latestX - start.x;
        const dy = latestY - start.y;
        if (dir.includes("e")) {
          width = start.width + dx;
        }
        if (dir.includes("s")) {
          height = start.height + dy;
        }
        if (dir.includes("w")) {
          width = start.width - dx;
          left = start.left + dx;
        }
        if (dir.includes("n")) {
          height = start.height - dy;
          top = start.top + dy;
        }
        if (left < 8) {
          width -= 8 - left;
          left = 8;
        }
        if (top < 8) {
          height -= 8 - top;
          top = 8;
        }
        width = Math.min(
          Math.max(width, minWidth),
          Math.max(minWidth, win.innerWidth - left - 8)
        );
        height = Math.min(
          Math.max(height, minHeight),
          Math.max(minHeight, win.innerHeight - top - 8)
        );
        const rounded = {
          left: Math.round(left),
          top: Math.round(top),
          width: Math.round(width),
          height: Math.round(height),
        };
        if (rounded.left !== next.left) {
          next.left = rounded.left;
          panel.style.left = `${rounded.left}px`;
        }
        if (rounded.top !== next.top) {
          next.top = rounded.top;
          panel.style.top = `${rounded.top}px`;
        }
        if (rounded.width !== next.width) {
          next.width = rounded.width;
          panel.style.width = `${rounded.width}px`;
        }
        if (rounded.height !== next.height) {
          next.height = rounded.height;
          panel.style.height = `${rounded.height}px`;
        }
      };
      const onMove = (moveEvent) => {
        latestX = moveEvent.clientX;
        latestY = moveEvent.clientY;
        if (!frame) {
          frame = win.requestAnimationFrame(apply);
        }
      };
      const onUp = () => {
        if (frame) {
          win.cancelAnimationFrame(frame);
          frame = null;
        }
        apply();
        panel.style.willChange = "";
        panel.classList.remove("zst-resizing");
        state.resizing = false;
        win.removeEventListener("pointermove", onMove);
        win.removeEventListener("pointerup", onUp);
        win.removeEventListener("pointercancel", onUp);
      };
      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp);
      win.addEventListener("pointercancel", onUp);
    }

    // ----------------------------------------------------------- sidebar tool

    onRenderSidebarAnnotationHeader(event) {
      if (!this.getPref("enabled") || !this.getPref("showSidebarButton")) {
        return;
      }
      try {
        const { reader, doc, params, append } = event;
        this.ensureReaderStyles(doc);
        const annotation = params && params.annotation;
        if (!annotation || !["highlight", "underline"].includes(annotation.type)) {
          return;
        }
        if (!annotation.text || !String(annotation.text).trim()) {
          return;
        }
        // The reader re-runs this event on header re-renders. Remove a
        // previous button for *this* annotation only, leaving other
        // annotation buttons alone.
        if (annotation.id) {
          const page = doc.getElementById(`page_${annotation.id}`);
          const header = page && page.closest(".header");
          if (header) {
            header.querySelectorAll(".zst-sidebar-btn").forEach((node) => node.remove());
          }
        }
        const button = h(doc, "button", {
          className: "zst-sidebar-btn",
          text: "译",
          attrs: {
            type: "button",
            title: "翻译这条标注，并把译文写入评论",
            "aria-label": "翻译标注并写入评论",
          },
        });
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.translateAnnotationIntoComment(reader, annotation, button);
        });
        append(button);
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    async translateAnnotationIntoComment(reader, annotation, button) {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "…";
      try {
        let attachment = reader._item;
        if (!attachment && reader.itemID) {
          attachment = Zotero.Items.get(reader.itemID);
        }
        if (!attachment) {
          throw new Error("找不到当前 PDF 附件。");
        }
        let item = Zotero.Items.getByLibraryAndKey(attachment.libraryID, annotation.id);
        if (!item || !item.isAnnotation()) {
          throw new Error("找不到这条标注。");
        }
        const source = item.annotationText || annotation.text || "";
        if (!source.trim()) {
          throw new Error("这条标注没有可翻译的文字。");
        }
        const result = await this.translateText({
          text: source,
          engineId: E.ENGINE_IDS.includes(this.getPref("engine")) ? this.getPref("engine") : "deepl-free",
          sourceLang: this.getPref("sourceLanguage"),
          targetLang: this.getPref("targetLanguage"),
          reader,
        });
        const oldComment = String(item.annotationComment || "").trim();
        if (oldComment.includes(result.translation)) {
          button.textContent = "✓";
          button.title = "评论中已经有这条译文";
          return;
        }
        const block = `【译文】\n${result.translation}`;
        item.annotationComment = oldComment ? `${oldComment}\n\n${block}` : block;
        await item.saveTx();
        button.textContent = "✓";
        button.title = `已写入评论（${E.engineLabel(result.engine)}）`;
      }
      catch (error) {
        this.log("sidebar translate failed", error);
        button.textContent = "!";
        button.title = `翻译失败：${this.formatError(error)}`;
        this.notify("标注翻译失败", this.formatError(error));
      }
      finally {
        button.disabled = false;
        setTimeout(() => {
          if (button.isConnected) {
            button.textContent = originalText;
            button.title = "翻译这条标注，并把译文写入评论";
          }
        }, 2200);
      }
    }

    // --------------------------------------------------------------- toolbar

    onRenderToolbar(event) {
      if (!this.getPref("enabled") || !this.getPref("showToolbarButton")) {
        return;
      }
      try {
        const { doc, append } = event;
        this.ensureReaderStyles(doc);
        // renderToolbar can fire repeatedly without the custom section being
        // cleared, which previously produced multiple "译" buttons.
        doc.querySelectorAll(".zst-toolbar-btn").forEach((node) => node.remove());
        const button = h(doc, "button", {
          className: "toolbar-button zst-toolbar-btn",
          text: "译",
          attrs: { type: "button", "data-zst-toolbar": "1" },
        });
        const update = () => {
          const on = !!this.getPref("autoTranslate");
          button.classList.toggle("active", on);
          button.setAttribute("aria-pressed", on ? "true" : "false");
          button.title = on
            ? "划词翻译：自动翻译已开启（点击关闭）"
            : "划词翻译：自动翻译已关闭（点击开启）";
        };
        update();
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setPref("autoTranslate", !this.getPref("autoTranslate"));
          update();
        });
        append(button);
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    // -------------------------------------------------------------- utilities

    notify(title, message) {
      try {
        const progress = new Zotero.ProgressWindow({ closeOnClick: true });
        progress.changeHeadline(title);
        progress.addDescription(String(message || "").slice(0, 500));
        progress.show();
        progress.startCloseTimer(6000);
      }
      catch (e) {
        this.log("notify failed", e);
      }
    }
  }

  return new Translator();
})();
