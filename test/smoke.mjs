import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const manifest = JSON.parse(read("src/manifest.json"));
assert.equal(manifest.manifest_version, 2);
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
assert.ok(bootstrap.includes("content/scripts/translate.js"));
assert.ok(bootstrap.includes("evalInSandbox"), "jar fallback missing");

const translate = read("src/content/scripts/translate.js");
assert.ok(translate.includes("renderTextSelectionPopup"));
assert.ok(translate.includes("renderToolbar"));
assert.ok(translate.includes("renderSidebarAnnotationHeader"));
assert.ok(translate.includes("saveFromJSON"));
assert.ok(translate.includes("ensureReaderStyles"));
assert.ok(translate.includes("zst-save-btn"));
assert.ok(!translate.includes("runSelfTest"), "self-test hook leaked into release");

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
]) {
  assert.ok(
    prefs.includes(`pref(P + "${key}"`),
    `missing pref ${key}`
  );
}
assert.ok(prefs.includes('const P = "extensions.zotero.zoteroSelectionTranslator."'));
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
assert.ok(translate.includes('["n", "s", "e", "w", "nw", "ne", "sw", "se"]'));
assert.ok(css.includes(".zst-resize-n"));

const prefsXhtml = read("src/content/preferences.xhtml");
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
]) {
  assert.ok(prefsXhtml.includes(key), `preference pane missing ${key}`);
}
assert.ok(prefsXhtml.includes('id="zotero-selection-translator-prefpane"'));

console.log("smoke: all static checks passed");
