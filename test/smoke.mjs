import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const manifest = JSON.parse(read("src/manifest.json"));
assert.equal(manifest.manifest_version, 2);
assert.equal(manifest.version, "1.8.2-beta");
const zotero = manifest.applications?.zotero;
assert.ok(zotero, "applications.zotero missing");
assert.equal(zotero.id, "selection-translator@zotero.local");
assert.ok(zotero.update_url, "update_url missing");
assert.ok(zotero.strict_min_version && !zotero.strict_min_version.includes("*"));
assert.ok(zotero.strict_max_version, "strict_max_version missing");
assert.ok(fs.existsSync(path.join(root, "src/bootstrap.js")));
assert.ok(fs.existsSync(path.join(root, "src/prefs.js")));

const bootstrap = read("src/bootstrap.js");
assert.ok(bootstrap.includes("content/scripts/engines.js"));
assert.ok(bootstrap.includes("content/scripts/dictionary.js"));
assert.ok(bootstrap.includes("content/scripts/translate.js"));
assert.ok(bootstrap.includes("evalInSandbox"), "jar fallback missing");

const preferencesJs = read("src/content/scripts/preferences.js");
assert.ok(fs.existsSync(path.join(root, "src/content/scripts/preferences.js")));

const translate = read("src/content/scripts/translate.js");
assert.ok(translate.includes("renderTextSelectionPopup"));
assert.ok(translate.includes("renderToolbar"));
assert.ok(translate.includes("renderSidebarAnnotationHeader"));
assert.ok(translate.includes("saveFromJSON"));
assert.ok(translate.includes("ensureReaderStyles"));
assert.ok(translate.includes("zst-save-btn"));
for (const feature of [
  "autoSizePanel",
  "scheduleContinuousTranslation",
  "runContinuousTranslation",
  "clearContent",
  "playAudioBlob",
  "beginSpeechStatus",
  "manualSize",
  "CONTINUOUS_DEBOUNCE_MS",
  "THEME_PALETTES",
  "themeIcon",
  "cycleTheme",
  "applyEngineSelectWidth",
  "beginEngineWidthResize",
  "ENGINE_SELECT_MIN_WIDTH",
  "DICT_CACHE_LIMIT",
]) {
  assert.ok(translate.includes(feature), `missing 1.8.2 feature ${feature}`);
}
assert.ok(!translate.includes("🐋"), "theme icons must not be emoji");
assert.ok(!translate.includes("🪵"), "theme icons must not be emoji");
assert.ok(preferencesJs.includes("我已知晓"));
assert.ok(preferencesJs.includes('collapsed ? "展开" : "我已知晓"'));
assert.ok(
  !translate.includes("state.translation = joinText(state.translation, piece)"),
  "continuous mode must not append independent translations"
);
assert.ok(!translate.includes("runSelfTest"), "self-test hook leaked into release");
assert.ok(!bootstrap.includes("selftest"), "self-test loader leaked into release");
assert.ok(
  !fs.existsSync(path.join(root, "src/content/scripts/selftest.js")),
  "self-test file leaked into release"
);

const engines = read("src/content/scripts/engines.js");
assert.ok(engines.includes("oneshot-free.www.deepl.com"));
assert.ok(engines.includes("zh-Hans"));
assert.ok(engines.includes("1200"));
assert.ok(engines.includes("api-free.deepl.com"));
assert.ok(engines.includes("api.mymemory.translated.net"));
assert.ok(engines.includes("fanyi-api.baidu.com"));
assert.ok(engines.includes("api.cognitive.microsofttranslator.com"));
assert.ok(engines.includes("chat/completions"));
assert.ok(engines.includes("ai-deepseek"));
assert.ok(engines.includes("translateDeepSeek"));
assert.ok(engines.includes("deepseekEndpoint"));
assert.ok(engines.includes("api.anthropic.com"));
assert.ok(engines.includes("generativelanguage.googleapis.com"));

const dictionary = read("src/content/scripts/dictionary.js");
for (const source of [
  "cn.bing.com/dict",
  "dict.youdao.com/jsonapi",
  "oxfordlearnersdictionaries.com",
  "api.dictionaryapi.dev",
]) {
  assert.ok(dictionary.includes(source), `dictionary source missing ${source}`);
}
assert.ok(dictionary.includes("phonetics"));
assert.ok(dictionary.includes("sourceLabel"));
assert.ok(dictionary.includes("AUTO_ORDER"));
assert.ok(dictionary.includes("choose"));
assert.ok(dictionary.includes("aiDictionary"));
assert.ok(translate.includes("showDictSourcePrompt"));
assert.ok(engines.includes("aiDictionary"));
assert.ok(engines.includes("dictionaryAiPrompt"));
assert.ok(translate.includes("lookupDictionary"));
assert.ok(translate.includes("renderDictionary"));
assert.ok(translate.includes("speakWord"));
assert.ok(translate.includes("zst-dict"));

const prefs = read("src/prefs.js");
for (const key of [
  "engine",
  "targetLanguage",
  "annotationComment",
  "annotationColor",
  "fontSize",
  "lineHeight",
  "serifResultFont",
  "deeplApiKey",
  "openaiEndpoint",
  "deepseekEndpoint",
  "deepseekKey",
  "deepseekModel",
  "anthropicEndpoint",
  "geminiEndpoint",
  "dictionaryEnabled",
  "dictionarySource",
  "dictionaryShowDefinitions",
  "dictionaryAiEngine",
  "dictionaryAiPrompt",
  "pinByDefault",
  "theme",
  "disclaimerCollapsed",
  "engineSelectWidth",
]) {
  assert.ok(prefs.includes(`"${key}"`), `missing pref ${key}`);
}
assert.ok(prefs.includes('const P = "extensions.zotero.zoteroSelectionTranslator."'));
assert.ok(prefs.includes('pref(P + "engine", "choose")'), "default channel must be unset");
assert.ok(
  prefs.includes('pref(P + "dictionarySource", "choose")'),
  "default dictionary source must be unset"
);
assert.ok(!/pref\(\s*"[^"]*"\s*,\s*undefined/.test(prefs));

const css = read("src/content/styles/translate.css");
assert.ok(css.includes("--zst-font-size"));
assert.ok(css.includes("--zst-line-height"));
assert.ok(css.includes("zst-serif-font"));
assert.ok(translate.includes("zst-style-row"));
assert.ok(translate.includes("lineHeight"));
assert.ok(translate.includes("beginDrag"));
assert.ok(translate.includes("requestAnimationFrame"));
assert.ok(translate.includes("getActivePin"));
assert.ok(translate.includes("updatePinnedTranslation"));
assert.ok(translate.includes("clearTranslationCache"));
assert.ok(bootstrap.includes("clearTranslationCache"));
assert.ok(translate.includes("isChineseSource"));
assert.ok(translate.includes("sourcePref === \"zh-CN\""));
assert.ok(translate.includes('["n", "s", "e", "w", "nw", "ne", "sw", "se"]'));
assert.ok(css.includes(".zst-resize-n"));
assert.ok(css.includes(".zst-cont-btn"));
assert.ok(css.includes(".zst-dict-word"));
assert.ok(css.includes(".zst-phonetic-btn"));
assert.ok(!/\.zst-resize-handle::after/.test(css), "resize handle dot visuals removed");
assert.ok(translate.includes("appendContinuousSelection"));
assert.ok(translate.includes("toggleContinuous"));
assert.ok(translate.includes("pinByDefault"));
assert.ok(translate.includes("joinText"));
assert.ok(translate.includes("dictionaryEnabled"));
assert.ok(translate.includes("showEnginePrompt"));
assert.ok(translate.includes("isEngineId"));
assert.ok(engines.includes("UNSET_ENGINE"));
assert.ok(css.includes("align-items: center"));
assert.ok(translate.includes("第三方非官方插件"));
assert.ok(css.includes(".zst-theme-btn"));
assert.ok(css.includes(".zst-engine-resizer"));
assert.ok(css.includes(".zst-panel.zst-serif-font .zst-dict-meanings"));
const chromeFontRule = css.match(
  /\.zst-panel button,[\s\S]*?font-family:\s*([^;]+);/
);
assert.ok(chromeFontRule, "card buttons and engine select must have a font rule");
assert.ok(
  !chromeFontRule[0].includes("zst-serif-font"),
  "card button font must be independent of the result-font toggle"
);
assert.ok(
  chromeFontRule[0].includes(".zst-panel .zst-check"),
  "comment checkbox label must use the fixed card font"
);
assert.ok(
  chromeFontRule[0].includes(".zst-panel .zst-status"),
  "footer status must use the fixed card font"
);
assert.match(chromeFontRule[1], /"Times New Roman"/);
assert.match(chromeFontRule[1], /"SimSun"/);
assert.match(css, /\.zst-result-title\s*\{[^}]*font-size:\s*12px/);
assert.match(css, /\.zst-pin-btn,[\s\S]*?font-size:\s*12px/);
assert.match(css, /\.zst-link-btn\s*\{[^}]*font-size:\s*10px/);
assert.ok(css.includes("--zst-panel-bg"));
assert.ok(css.includes(".zst-status"));
assert.ok(translate.includes("content/scripts/preferences.js"));
assert.ok(translate.includes("registerThemeObservers"));
assert.ok(translate.includes("resolveThemeId"));
assert.ok(translate.includes('Zotero.Prefs.registerObserver("browser.theme.toolbar-theme"'));
assert.ok(translate.includes('Zotero.Prefs.registerObserver("reader.lightTheme", handler)'));
assert.ok(translate.includes('Zotero.Prefs.get(dark ? "reader.darkTheme" : "reader.lightTheme")'));
assert.ok(
  !translate.includes('Zotero.Prefs.get("reader.darkTheme", true)'),
  "reader theme prefs must not be read from the global branch"
);

const prefsCss = read("src/content/styles/preferences.css");
assert.ok(prefsCss.includes(".zst-disclaimer"));
assert.ok(prefsCss.includes(".zst-disclaimer-title"));
assert.ok(prefsCss.includes(".zst-disclaimer-toggle"));
assert.ok(prefsCss.includes(".zst-disclaimer-collapsed"));
assert.ok(
  /\.zst-disclaimer\.zst-disclaimer-collapsed\s*\{[^}]*display:\s*flex/.test(prefsCss),
  "collapsed disclaimer must put the expand button on the summary row"
);
assert.match(
  prefsCss,
  /\.zst-disclaimer\.zst-disclaimer-collapsed \.zst-disclaimer-summary\s*\{[^}]*text-overflow:\s*ellipsis/
);

const prefsXhtml = read("src/content/preferences.xhtml");
assert.ok(prefsXhtml.includes("zst-clear-cache"));
assert.ok(prefsXhtml.includes('id="zst-disclaimer"'));
assert.ok(prefsXhtml.includes('id="zst-disclaimer-toggle"'));
assert.ok(prefsXhtml.includes('id="zst-theme"'));
assert.ok(prefsXhtml.includes("重要声明与免责声明"));
assert.ok(prefsXhtml.includes("仅供个人学习"));
assert.ok(prefsXhtml.includes('value="choose"'));
assert.ok(prefsXhtml.includes("不会默认调用任何翻译服务"));
assert.ok(prefsXhtml.includes("默认不查询"));
assert.ok(prefsXhtml.includes("承担责任"));
for (const key of [
  "extensions.zotero.zoteroSelectionTranslator.engine",
  "extensions.zotero.zoteroSelectionTranslator.annotationComment",
  "extensions.zotero.zoteroSelectionTranslator.fontSize",
  "extensions.zotero.zoteroSelectionTranslator.lineHeight",
  "extensions.zotero.zoteroSelectionTranslator.serifResultFont",
  "extensions.zotero.zoteroSelectionTranslator.openaiEndpoint",
  "extensions.zotero.zoteroSelectionTranslator.deepseekEndpoint",
  "extensions.zotero.zoteroSelectionTranslator.deepseekKey",
  "extensions.zotero.zoteroSelectionTranslator.aiSystemPrompt",
  "extensions.zotero.zoteroSelectionTranslator.dictionaryEnabled",
  "extensions.zotero.zoteroSelectionTranslator.dictionarySource",
  "extensions.zotero.zoteroSelectionTranslator.dictionaryAiEngine",
  "extensions.zotero.zoteroSelectionTranslator.dictionaryAiPrompt",
  "extensions.zotero.zoteroSelectionTranslator.pinByDefault",
]) {
  assert.ok(prefsXhtml.includes(key), `preference pane missing ${key}`);
}
assert.ok(prefsXhtml.includes('id="zotero-selection-translator-prefpane"'));

console.log("smoke: all static checks passed");
