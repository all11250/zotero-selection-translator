/* Default preferences for Selection Translator.
 * Zotero's bootstrapped-extension loader reads this file automatically. */

const P = "extensions.zotero.zoteroSelectionTranslator.";

pref(P + "enabled", true);
pref(P + "autoTranslate", true);
pref(P + "sourceLanguage", "auto");
pref(P + "targetLanguage", "zh-CN");
// Intentionally not a real engine: the plugin must not default to any
// third-party service. Users choose a channel explicitly.
pref(P + "engine", "choose");

pref(P + "annotationComment", true);
pref(P + "annotationType", "highlight");
pref(P + "annotationColor", "#ffd400");
pref(P + "showSource", true);
pref(P + "fontSize", "14");
pref(P + "lineHeight", "1.65");
pref(P + "serifResultFont", true);
pref(P + "popupWidth", "380");
pref(P + "fallbackEnabled", false);
pref(P + "fallbackEngine", "mymemory");
pref(P + "showToolbarButton", true);
pref(P + "showSidebarButton", true);
pref(P + "pinByDefault", false);

pref(P + "dictionaryEnabled", true);
// No default dictionary lookup either: the user must pick a source.
pref(P + "dictionarySource", "choose");
pref(P + "dictionaryShowDefinitions", true);
pref(P + "dictionaryAiEngine", "auto");
pref(
  P + "dictionaryAiPrompt",
  "You are a concise bilingual dictionary. For the English word \"${word}\", return ONLY a JSON object " +
    "with this exact schema: " +
    "{\"word\":\"${word}\",\"phonetic_us\":\"IPA or empty\",\"phonetic_uk\":\"IPA or empty\"," +
    "\"entries\":[{\"pos\":\"part of speech in abbreviated form\",\"meanings\":[\"Chinese meaning 1\",\"Chinese meaning 2\"]}]}. " +
    "Use 1-3 entries ordered by frequency, at most 4 Chinese meanings per entry, no examples, no markdown, no commentary. " +
    "If the word is unknown, return {\"word\":\"${word}\",\"entries\":[]}."
);

pref(P + "deeplApiKey", "");
pref(P + "deeplWebVersion", "26.52");
pref(P + "deeplWebBuild", "5443737");
pref(P + "deeplWebOsVersion", "26.0");

pref(P + "googleEndpoint", "https://translate.googleapis.com");
pref(P + "mymemoryEmail", "");

pref(P + "baiduAppId", "");
pref(P + "baiduKey", "");

pref(P + "azureKey", "");
pref(P + "azureRegion", "");

pref(P + "libretranslateEndpoint", "https://libretranslate.com");
pref(P + "libretranslateKey", "");

pref(P + "openaiEndpoint", "https://api.openai.com/v1");
pref(P + "openaiKey", "");
pref(P + "openaiModel", "gpt-4o-mini");
pref(P + "openaiTemperature", "0.2");

pref(P + "deepseekEndpoint", "https://api.deepseek.com/v1");
pref(P + "deepseekKey", "");
pref(P + "deepseekModel", "deepseek-chat");
pref(P + "deepseekTemperature", "0.2");

pref(P + "anthropicEndpoint", "https://api.anthropic.com/v1/messages");
pref(P + "anthropicKey", "");
pref(P + "anthropicModel", "claude-sonnet-4-5");
pref(P + "anthropicTemperature", "0.2");

pref(P + "geminiEndpoint", "https://generativelanguage.googleapis.com/v1beta");
pref(P + "geminiKey", "");
pref(P + "geminiModel", "gemini-2.0-flash");
pref(P + "geminiTemperature", "0.2");

pref(P + "aiMaxTokens", "2048");
pref(P + "aiUsePaperContext", false);
pref(P + "openaiExtraHeaders", "{}");
pref(
  P + "aiSystemPrompt",
  "You are a meticulous academic translator. Translate the user's text into ${targetLang}. " +
    "Preserve technical terminology, citations, numbers, equations, and paragraph breaks. " +
    "Do not add explanations, summaries, notes, or quotation marks. Output only the translation."
);
pref(P + "aiUserPrompt", "${text}");

pref(P + "debug", false);
