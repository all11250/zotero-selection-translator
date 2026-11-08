/* global Zotero, Services */

/**
 * Translation engines for Selection Translator.
 *
 * This file is loaded into the bootstrap sandbox before translate.js.
 * It deliberately has no dependency on the plugin instance so that the
 * engine implementations are easy to audit and reuse.
 */
var SelectionTranslatorEngines = (function () {
  "use strict";

  const LANGUAGES = [
    { code: "auto", name: "自动检测 / Auto" },
    { code: "zh-CN", name: "简体中文" },
    { code: "zh-TW", name: "繁體中文" },
    { code: "en", name: "English" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "es", name: "Español" },
    { code: "ru", name: "Русский" },
    { code: "pt", name: "Português" },
    { code: "it", name: "Italiano" },
    { code: "nl", name: "Nederlands" },
    { code: "pl", name: "Polski" },
    { code: "tr", name: "Türkçe" },
    { code: "ar", name: "العربية" },
    { code: "hi", name: "हिन्दी" },
    { code: "th", name: "ไทย" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "uk", name: "Українська" },
    { code: "cs", name: "Čeština" },
    { code: "sv", name: "Svenska" },
    { code: "da", name: "Dansk" },
    { code: "fi", name: "Suomi" },
    { code: "no", name: "Norsk" },
    { code: "el", name: "Ελληνικά" },
    { code: "he", name: "עברית" },
    { code: "hu", name: "Magyar" },
    { code: "ro", name: "Română" },
    { code: "bg", name: "Български" },
    { code: "sk", name: "Slovenčina" },
    { code: "sl", name: "Slovenščina" },
    { code: "et", name: "Eesti" },
    { code: "lv", name: "Latviešu" },
    { code: "lt", name: "Lietuvių" },
  ];

  const ENGINE_LABELS = {
    "deepl-free": "DeepL 免费网页版",
    "deepl-api": "DeepL API（官方 Key）",
    "google-free": "Google 翻译（免费）",
    mymemory: "MyMemory（免费）",
    baidu: "百度翻译",
    azure: "Microsoft Translator",
    libretranslate: "LibreTranslate（自建）",
    "ai-openai": "AI · OpenAI 兼容",
    "ai-deepseek": "AI · DeepSeek",
    "ai-anthropic": "AI · Anthropic Claude",
    "ai-gemini": "AI · Google Gemini",
  };

  const ENGINE_IDS = Object.keys(ENGINE_LABELS);

  const ANNOTATION_COLORS = [
    ["黄色", "#ffd400"],
    ["红色", "#ff6666"],
    ["绿色", "#5fb236"],
    ["蓝色", "#2ea8e5"],
    ["紫色", "#a28ae5"],
    ["品红", "#e56eee"],
    ["橙色", "#f19837"],
    ["灰色", "#aaaaaa"],
  ];

  // DeepL's anonymous web endpoint uses mixed-case language codes. Invalid
  // targets are accepted with HTTP 200 and silently translated into English,
  // so these tables and deeplWebTarget() are a correctness guard, not just
  // cosmetics. The official v2 API instead wants uppercase codes.
  const DEEPL_WEB_TARGET = {
    "zh-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
    zh: "zh-Hans",
    en: "en-US",
    "en-US": "en-US",
    "en-GB": "en-US",
    pt: "pt-BR",
    "pt-BR": "pt-BR",
    "pt-PT": "pt-PT",
    no: "nb",
  };

  const DEEPL_WEB_SOURCE = {
    "zh-CN": "zh",
    "zh-TW": "zh",
    zh: "zh",
    en: "en",
    "en-US": "en",
    "en-GB": "en",
    pt: "pt",
    "pt-BR": "pt",
    "pt-PT": "pt",
    no: "nb",
  };

  const DEEPL_WEB_BASE = new Set([
    "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hu",
    "id", "it", "ja", "ko", "lt", "lv", "nb", "nl", "pl", "ro", "ru", "sk",
    "sl", "sv", "tr", "uk", "vi",
  ]);

  const DEEPL_API_TARGET = {
    "zh-CN": "ZH-HANS",
    "zh-TW": "ZH-HANT",
    zh: "ZH-HANS",
    en: "EN-US",
    "en-US": "EN-US",
    "en-GB": "EN-GB",
    pt: "PT-BR",
    "pt-BR": "PT-BR",
    "pt-PT": "PT-PT",
    no: "NB",
  };

  const DEEPL_API_SOURCE = {
    "zh-CN": "ZH",
    "zh-TW": "ZH",
    zh: "ZH",
    en: "EN",
    "en-US": "EN",
    "en-GB": "EN",
    pt: "PT",
    "pt-BR": "PT",
    "pt-PT": "PT",
    no: "NB",
  };

  const BAIDU_TARGET = {
    "zh-CN": "zh",
    "zh-TW": "cht",
    zh: "zh",
    en: "en",
    "en-US": "en",
    "en-GB": "en",
    ja: "jp",
    ko: "kor",
    fr: "fra",
    de: "de",
    es: "spa",
    ru: "ru",
    pt: "pt",
    "pt-BR": "pt",
    "pt-PT": "pt",
    it: "it",
    nl: "nl",
    pl: "pl",
    tr: "tr",
    ar: "ara",
    hi: "hi",
    th: "th",
    vi: "vie",
    id: "id",
    uk: "uk",
    cs: "cs",
    sv: "swe",
    da: "dan",
    fi: "fin",
    no: "nor",
    el: "el",
    he: "he",
    hu: "hu",
    ro: "rom",
    bg: "bul",
    sk: "slo",
    sl: "sl",
    et: "est",
    lv: "lv",
    lt: "lt",
  };

  const BAIDU_SOURCE = Object.assign({}, BAIDU_TARGET, {
    auto: "auto",
    "zh-CN": "zh",
    "zh-TW": "cht",
  });

  const AZURE_TARGET = {
    "zh-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
    zh: "zh-Hans",
    en: "en",
    "en-US": "en",
    "en-GB": "en",
    pt: "pt",
    "pt-BR": "pt",
    "pt-PT": "pt",
  };

  function labelForLanguage(code) {
    return (LANGUAGES.find((x) => x.code === code) || {}).name || code || "";
  }

  function engineLabel(id) {
    return ENGINE_LABELS[id] || id;
  }

  function mapWith(table, code, fallback) {
    return table[code] || fallback || code;
  }

  class HttpError extends Error {
    constructor(status, body, url) {
      const shortBody = String(body || "").replace(/\s+/g, " ").slice(0, 300);
      super(shortBody ? `HTTP ${status}: ${shortBody}` : `HTTP ${status}`);
      this.name = "HttpError";
      this.status = status;
      this.body = body;
      this.url = url;
    }
  }

  function parseJson(text, url) {
    if (text && typeof text === "object") {
      return text;
    }
    const raw = String(text || "").replace(/^\)\]\}'[^\n]*\n?/, "").trim();
    if (!raw) {
      throw new HttpError(0, "Empty response body", url);
    }
    try {
      return JSON.parse(raw);
    }
    catch (e) {
      throw new HttpError(0, `Invalid JSON response: ${raw.slice(0, 240)}`, url);
    }
  }

  function extractErrorMessage(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const data = JSON.parse(raw);
      return String(
        data.message ||
          (data.error && (data.error.message || data.error)) ||
          data.error_msg ||
          data.title ||
          data.detail ||
          raw
      ).slice(0, 500);
    }
    catch (e) {
      return raw.slice(0, 500);
    }
  }

  async function httpRequest(method, url, options) {
    options = options || {};
    const requestOptions = {
      headers: options.headers || {},
      body: options.body,
      responseType: "text",
      timeout: options.timeout || 30000,
      followRedirects: true,
      // Zotero 10 retries 429/5xx for up to an hour by default. We want the
      // status and response body immediately so the panel can offer a retry
      // or engine switch.
      successCodes: [200, 201, 202, 204, 400, 401, 403, 404, 409, 415, 422, 429, 500, 502, 503, 504],
      errorDelayMax: 0,
      noRetryOnThrottle: true,
    };
    if (requestOptions.body === undefined) {
      delete requestOptions.body;
    }

    let xhr;
    try {
      xhr = await Zotero.HTTP.request(method, url, requestOptions);
    }
    catch (e) {
      const failure = e && (e.xmlhttp || e.xhr || e.request || e.target);
      if (failure && typeof failure.status === "number" && failure.status > 0) {
        const body =
          failure.responseText ||
          (typeof failure.response === "string" ? failure.response : "") ||
          e.message;
        throw new HttpError(failure.status, body, url);
      }
      if (e && typeof e.status === "number" && e.status > 0) {
        throw new HttpError(e.status, e.responseText || e.message, url);
      }
      const err = new HttpError(0, (e && e.message) || String(e), url);
      err.cause = e;
      throw err;
    }

    const status = xhr && typeof xhr.status === "number" ? xhr.status : 0;
    const text =
      xhr && typeof xhr.response === "string"
        ? xhr.response
        : (xhr && xhr.responseText) || "";
    if (!status) {
      throw new HttpError(0, "Network request failed", url);
    }
    if (status < 200 || status >= 300) {
      throw new HttpError(status, text, url);
    }
    return { xhr, status, text };
  }

  async function httpJson(method, url, options) {
    const res = await httpRequest(method, url, options);
    return { data: parseJson(res.text, url), text: res.text, status: res.status };
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00ad/g, "")
      .replace(/-\s*\r?\n\s*/g, "")
      .replace(/\s*\r?\n\s*/g, " ")
      .replace(/[\t ]+/g, " ")
      .trim();
  }

  function decodeEntities(text) {
    if (!text) {
      return text;
    }
    if (typeof Zotero !== "undefined" && Zotero.Utilities && Zotero.Utilities.unescapeHTML) {
      try {
        return Zotero.Utilities.unescapeHTML(text);
      }
      catch (e) {
        // Fall through.
      }
    }
    return String(text)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&nbsp;/g, " ");
  }

  function splitText(text, maxLength) {
    const source = String(text || "").trim();
    const chunks = [];
    let rest = source;
    while (rest.length > maxLength) {
      const head = rest.slice(0, maxLength);
      let cut = -1;
      const candidates = [
        head.lastIndexOf("\n"),
        head.lastIndexOf(". "),
        head.lastIndexOf("! "),
        head.lastIndexOf("? "),
        head.lastIndexOf("; "),
        head.lastIndexOf("。"),
        head.lastIndexOf("！"),
        head.lastIndexOf("？"),
        head.lastIndexOf(" "),
      ];
      for (const candidate of candidates) {
        if (candidate > cut) {
          cut = candidate;
        }
      }
      if (cut < Math.floor(maxLength * 0.45)) {
        cut = maxLength;
      }
      else {
        cut += 1;
      }
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) {
      chunks.push(rest);
    }
    return chunks.filter(Boolean);
  }

  function detectSourceLang(text) {
    const t = String(text || "");
    if (/[\u3040-\u30ff]/.test(t)) return "ja";
    if (/[\uac00-\ud7af]/.test(t)) return "ko";
    if (/[\u4e00-\u9fff]/.test(t)) return "zh-CN";
    if (/[\u0400-\u04ff]/.test(t)) return "ru";
    if (/[\u0600-\u06ff]/.test(t)) return "ar";
    if (/[\u0590-\u05ff]/.test(t)) return "he";
    if (/[\u0370-\u03ff]/.test(t)) return "el";
    if (/[\u0e00-\u0e7f]/.test(t)) return "th";
    if (/[\u0900-\u097f]/.test(t)) return "hi";

    // A cheap Latin-script stop-word vote. It is only used for engines that
    // cannot auto-detect (MyMemory), where guessing is better than "auto",
    // which MyMemory rejects outright.
    const lower = ` ${t.toLowerCase()} `;
    const votes = {
      en: [" the ", " and ", " of ", " to ", " in ", " is ", " that ", " for ", " with ", " this "],
      fr: [" le ", " la ", " les ", " des ", " une ", " et ", " est ", " pour ", " dans ", " avec "],
      de: [" der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " für ", " auf ", " ein "],
      es: [" el ", " la ", " los ", " las ", " que ", " es ", " para ", " con ", " una ", " por "],
      pt: [" o ", " a ", " os ", " as ", " que ", " é ", " para ", " com ", " uma ", " não "],
      it: [" il ", " la ", " gli ", " che ", " è ", " per ", " con ", " una ", " non ", " di "],
      nl: [" de ", " het ", " een ", " en ", " is ", " niet ", " met ", " voor ", " van ", " dat "],
    };
    let best = "en";
    let bestScore = 0;
    for (const [lang, words] of Object.entries(votes)) {
      let score = 0;
      for (const word of words) {
        let from = 0;
        while ((from = lower.indexOf(word, from)) !== -1) {
          score += 1;
          from += word.length;
        }
      }
      if (score > bestScore) {
        best = lang;
        bestScore = score;
      }
    }
    return best;
  }

  function resolveSourceFor(engineId, sourceLang, text) {
    if (sourceLang && sourceLang !== "auto") {
      return sourceLang;
    }
    if (engineId === "mymemory") {
      // MyMemory rejects "auto". Its "autodetect" mode sometimes echoes the
      // source text for short English phrases, so use the local script /
      // stop-word detector instead and send an explicit language pair.
      return detectSourceLang(text);
    }
    return "auto";
  }

  function appInfo(host) {
    return {
      os: "iOS",
      os_version: host.getPref("deeplWebOsVersion") || "26.0",
      app_version: host.getPref("deeplWebVersion") || "26.52",
      app_build: host.getPref("deeplWebBuild") || "5443737",
      instance_id: host.instanceId,
    };
  }

  function deeplWebTarget(code) {
    if (DEEPL_WEB_TARGET[code]) {
      return DEEPL_WEB_TARGET[code];
    }
    const base = String(code || "").toLowerCase().split("-")[0];
    if (base === "no") {
      return "nb";
    }
    if (base === "zh") {
      return "zh-Hans";
    }
    if (base === "en") {
      return "en-US";
    }
    if (DEEPL_WEB_BASE.has(base)) {
      return base;
    }
    throw new Error(
      `DeepL 网页版不支持目标语言“${labelForLanguage(code)}”。请改用其他引擎，或在设置中选择 DeepL 支持的语言。`
    );
  }

  function deeplWebSource(code) {
    if (!code || code === "auto") {
      return "";
    }
    if (DEEPL_WEB_SOURCE[code]) {
      return DEEPL_WEB_SOURCE[code];
    }
    const base = String(code).toLowerCase().split("-")[0];
    if (base === "no") return "nb";
    return base;
  }

  function deeplApiTarget(code) {
    const mapped = DEEPL_API_TARGET[code];
    if (mapped) {
      return mapped;
    }
    const base = String(code || "").toLowerCase().split("-")[0];
    if (base === "no") return "NB";
    if (base === "zh") return "ZH-HANS";
    if (base === "en") return "EN-US";
    if (DEEPL_WEB_BASE.has(base)) {
      return base.toUpperCase();
    }
    throw new Error(
      `DeepL API 不支持目标语言“${labelForLanguage(code)}”。请改用其他引擎，或选择 DeepL 支持的语言。`
    );
  }

  function deeplApiSource(code) {
    if (!code || code === "auto") {
      return "";
    }
    if (DEEPL_API_SOURCE[code]) {
      return DEEPL_API_SOURCE[code];
    }
    const base = String(code).toLowerCase().split("-")[0];
    if (base === "no") return "NB";
    return base.toUpperCase();
  }

  async function translateDeepLOneshot(host, text, sourceLang, targetLang) {
    const target = deeplWebTarget(targetLang);
    const source = deeplWebSource(sourceLang);
    const body = {
      text: [text],
      target_lang: target,
      usage_type: "translate",
      app_information: appInfo(host),
    };
    if (source) {
      body.source_lang = source;
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: "None",
      "User-Agent": `DeepL/${body.app_information.app_version} CFNetwork/3826.600.41 Darwin/25.0.0`,
      "x-app-os-version": body.app_information.os_version,
      "x-app-instance-id": host.instanceId,
      "x-app-session-id": host.sessionId,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    let data;
    try {
      const res = await httpJson(
        "POST",
        "https://oneshot-free.www.deepl.com/v1/translate",
        {
          headers,
          body: JSON.stringify(body),
          timeout: 30000,
        }
      );
      data = res.data;
    }
    catch (e) {
      if (e instanceof HttpError && e.status === 429) {
        throw new HttpError(
          429,
          "DeepL 免费网页接口暂时限流（429）。请稍后再试，或在设置中改用 DeepL API Key / 其他引擎。",
          e.url
        );
      }
      if (e instanceof HttpError && e.status === 403) {
        throw new HttpError(
          403,
          "DeepL 网页接口拒绝了请求（403，可能是客户端版本过期或 IP 被临时限制）。请改用 DeepL API Key、其他引擎，或更新插件。",
          e.url
        );
      }
      throw e;
    }

    const result = data && data.translations && data.translations[0] && data.translations[0].text;
    if (!result) {
      throw new HttpError(0, "DeepL 返回了空译文", "https://oneshot-free.www.deepl.com/v1/translate");
    }
    return result;
  }

  async function translateDeepLFree(ctx) {
    // A single request may carry at most 1500 UTF-16 code units across the
    // whole text[] array. The limit counts the JSON text values, not the
    // envelope, but 1200 is a safe, friendly chunk size for PDF selections.
    const chunks = splitText(ctx.text, 1200);
    const out = [];
    for (const chunk of chunks) {
      out.push(await translateDeepLOneshot(ctx.host, chunk, ctx.sourceLang, ctx.targetLang));
    }
    return out.join(" ");
  }

  function deeplApiEndpoint(key) {
    return /:fx$/i.test(key)
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";
  }

  async function translateDeepLApi(ctx) {
    const rawKey = String(ctx.host.getPref("deeplApiKey") || "").trim();
    if (!rawKey) {
      throw new Error("尚未配置 DeepL API Key。请在 设置 → 划词翻译 → DeepL API 中填写。");
    }
    const [key, glossaryId] = rawKey.split("#");
    if (!key) {
      throw new Error("DeepL API Key 为空。");
    }
    const target = deeplApiTarget(ctx.targetLang);
    const source = deeplApiSource(ctx.sourceLang);
    const chunks = splitText(ctx.text, 45000);
    const out = [];
    for (const chunk of chunks) {
      const body = {
        text: [chunk],
        target_lang: target,
      };
      if (source) body.source_lang = source;
      if (glossaryId) body.glossary_id = glossaryId;
      const res = await httpJson("POST", deeplApiEndpoint(key), {
        headers: {
          "Content-Type": "application/json",
          Authorization: `DeepL-Auth-Key ${key}`,
        },
        body: JSON.stringify(body),
        timeout: 45000,
      });
      const result =
        res.data &&
        res.data.translations &&
        res.data.translations[0] &&
        res.data.translations[0].text;
      if (!result) {
        throw new HttpError(0, "DeepL API 返回了空译文", deeplApiEndpoint(key));
      }
      out.push(result);
    }
    return out.join("\n");
  }

  function googleSingleUrl(base, source, target, text) {
    let root = String(base || "https://translate.googleapis.com").trim().replace(/\/+$/, "");
    if (!/\/translate_a\/single$/i.test(root)) {
      root += "/translate_a/single";
    }
    const params = [
      "client=gtx",
      `sl=${encodeURIComponent(source || "auto")}`,
      `tl=${encodeURIComponent(target)}`,
      "dt=t",
      `q=${encodeURIComponent(text)}`,
    ];
    return `${root}?${params.join("&")}`;
  }

  async function googleTranslateOne(host, source, target, text) {
    const bases = [
      host.getPref("googleEndpoint") || "https://translate.googleapis.com",
      "https://translate.googleapis.com",
      "https://translate.google.com",
    ];
    let lastError;
    for (const base of bases) {
      try {
        const res = await httpJson("GET", googleSingleUrl(base, source, target, text), {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
            Accept: "application/json,text/plain,*/*",
          },
          timeout: 25000,
        });
        const data = res.data;
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          throw new HttpError(0, "Google 返回了意外的数据格式", googleSingleUrl(base, source, target, text));
        }
        const result = data[0]
          .map((part) => (part && part[0]) || "")
          .join("")
          .trim();
        if (!result) {
          throw new HttpError(0, "Google 返回了空译文", googleSingleUrl(base, source, target, text));
        }
        return result;
      }
      catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("Google 翻译请求失败。");
  }

  async function translateGoogleFree(ctx) {
    const chunks = splitText(ctx.text, 4000);
    const out = [];
    for (const chunk of chunks) {
      out.push(await googleTranslateOne(ctx.host, ctx.sourceLang, ctx.targetLang, chunk));
    }
    return out.join("\n");
  }

  async function translateMyMemory(ctx) {
    const source = resolveSourceFor("mymemory", ctx.sourceLang, ctx.text);
    const target = ctx.targetLang === "zh-TW" ? "zh-TW" : ctx.targetLang;
    if (source === target) {
      return ctx.text;
    }
    const chunks = splitText(ctx.text, 450);
    const out = [];
    for (const chunk of chunks) {
      const params = [
        `q=${encodeURIComponent(chunk)}`,
        `langpair=${encodeURIComponent(`${source}|${target}`)}`,
      ];
      const email = String(ctx.host.getPref("mymemoryEmail") || "").trim();
      if (email) {
        params.push(`de=${encodeURIComponent(email)}`);
      }
      const url = `https://api.mymemory.translated.net/get?${params.join("&")}`;
      const res = await httpJson("GET", url, { timeout: 25000 });
      const data = res.data;
      const status = String((data && data.responseStatus) || "");
      const translated =
        data && data.responseData && data.responseData.translatedText
          ? decodeEntities(String(data.responseData.translatedText))
          : "";
      if (!translated || (status && status !== "200")) {
        throw new HttpError(
          0,
          (data && (data.responseDetails || data.responseData?.translatedText)) ||
            "MyMemory 返回了空译文",
          url
        );
      }
      out.push(translated);
    }
    return out.join(" ");
  }

  function baiduSign(appid, text, salt, key) {
    const md5 =
      (Zotero.Utilities.Internal && Zotero.Utilities.Internal.md5) ||
      (Zotero.Utilities && Zotero.Utilities.md5);
    if (typeof md5 !== "function") {
      throw new Error("当前 Zotero 版本不提供 MD5，无法使用百度翻译。");
    }
    return md5(appid + text + salt + key);
  }

  async function translateBaidu(ctx) {
    const appid = String(ctx.host.getPref("baiduAppId") || "").trim();
    const key = String(ctx.host.getPref("baiduKey") || "").trim();
    if (!appid || !key) {
      throw new Error("尚未配置百度翻译 AppID / 密钥。请在 设置 → 划词翻译 → 百度翻译 中填写。");
    }
    const source = mapWith(BAIDU_SOURCE, ctx.sourceLang, "auto");
    const target = mapWith(BAIDU_TARGET, ctx.targetLang, ctx.targetLang);
    const chunks = splitText(ctx.text, 1500);
    const out = [];
    for (const chunk of chunks) {
      const salt = String(Date.now());
      const sign = baiduSign(appid, chunk, salt, key);
      const body = [
        `q=${encodeURIComponent(chunk)}`,
        `from=${encodeURIComponent(source)}`,
        `to=${encodeURIComponent(target)}`,
        `appid=${encodeURIComponent(appid)}`,
        `salt=${encodeURIComponent(salt)}`,
        `sign=${encodeURIComponent(sign)}`,
      ].join("&");
      const res = await httpJson("POST", "https://fanyi-api.baidu.com/api/trans/vip/translate", {
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        timeout: 30000,
      });
      const data = res.data;
      if (data && data.error_code) {
        throw new HttpError(0, `百度翻译错误 ${data.error_code}: ${data.error_msg || ""}`, res.text);
      }
      if (!data || !Array.isArray(data.trans_result) || !data.trans_result.length) {
        throw new HttpError(0, "百度翻译返回了空译文", res.text);
      }
      out.push(data.trans_result.map((row) => row.dst || "").join("\n"));
    }
    return out.join("\n");
  }

  function azureLang(code) {
    return AZURE_TARGET[code] || code;
  }

  async function translateAzure(ctx) {
    const key = String(ctx.host.getPref("azureKey") || "").trim();
    const region = String(ctx.host.getPref("azureRegion") || "").trim();
    if (!key) {
      throw new Error("尚未配置 Microsoft Translator 密钥。请在 设置 → 划词翻译 → Microsoft 中填写。");
    }
    const target = azureLang(ctx.targetLang);
    const source = ctx.sourceLang === "auto" ? "" : azureLang(ctx.sourceLang);
    let url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(target)}`;
    if (source) {
      url += `&from=${encodeURIComponent(source)}`;
    }
    const headers = {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
    };
    if (region && region !== "global") {
      headers["Ocp-Apim-Subscription-Region"] = region;
    }
    const chunks = splitText(ctx.text, 45000);
    const out = [];
    for (const chunk of chunks) {
      const res = await httpJson("POST", url, {
        headers,
        body: JSON.stringify([{ Text: chunk }]),
        timeout: 45000,
      });
      const data = res.data;
      const result =
        Array.isArray(data) &&
        data[0] &&
        data[0].translations &&
        data[0].translations[0] &&
        data[0].translations[0].text;
      if (!result) {
        throw new HttpError(0, "Microsoft Translator 返回了空译文", res.text);
      }
      out.push(result);
    }
    return out.join("\n");
  }

  function libreUrl(endpoint) {
    let root = String(endpoint || "https://libretranslate.com").trim().replace(/\/+$/, "");
    if (!/\/translate$/i.test(root)) {
      root += "/translate";
    }
    return root;
  }

  async function translateLibre(ctx) {
    const endpoint = libreUrl(ctx.host.getPref("libretranslateEndpoint"));
    const key = String(ctx.host.getPref("libretranslateKey") || "").trim();
    const chunks = splitText(ctx.text, 4000);
    const out = [];
    for (const chunk of chunks) {
      const body = {
        q: chunk,
        source: ctx.sourceLang === "auto" ? "auto" : ctx.sourceLang,
        target: ctx.targetLang,
        format: "text",
      };
      if (key) body.api_key = key;
      const res = await httpJson("POST", endpoint, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeout: 30000,
      });
      const result = res.data && res.data.translatedText;
      if (!result) {
        throw new HttpError(0, "LibreTranslate 返回了空译文", res.text);
      }
      out.push(result);
    }
    return out.join("\n");
  }

  function cleanAIResult(text) {
    let out = String(text || "").trim();
    out = out.replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?```$/m, "$1").trim();
    out = out.replace(/^<(?:result|translation|answer)>([\s\S]*?)<\/(?:result|translation|answer)>$/i, "$1").trim();
    out = out.replace(/^(?:translation|译文|翻译)\s*[:：]\s*/i, "").trim();
    return out;
  }

  function fillTemplate(template, values) {
    return String(template || "").replace(/\$\{(\w+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : match;
    });
  }

  function aiPrompt(ctx) {
    const paper = ctx.paperContext || {};
    const context = [];
    if (paper.title) context.push(`Paper title: ${paper.title}`);
    if (paper.abstract) context.push(`Paper abstract: ${paper.abstract}`);
    const values = {
      text: ctx.text,
      sourceLang: labelForLanguage(ctx.sourceLang),
      targetLang: labelForLanguage(ctx.targetLang),
      title: paper.title || "",
      abstract: paper.abstract || "",
      context: context.join("\n"),
    };
    let system = fillTemplate(ctx.host.getPref("aiSystemPrompt"), values);
    const user = fillTemplate(ctx.host.getPref("aiUserPrompt") || "${text}", values);
    if (ctx.host.getPref("aiUsePaperContext") && context.length) {
      system += `\n\nUse the following paper metadata only to disambiguate terminology; do not translate it:\n${context.join("\n")}`;
    }
    return { system, user };
  }

  function aiMaxTokens(host) {
    const value = parseInt(host.getPref("aiMaxTokens"), 10);
    return Number.isFinite(value) && value > 0 ? value : 2048;
  }

  function normalizeOpenAIEndpoint(raw) {
    let endpoint = String(raw || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
    if (!endpoint) {
      endpoint = "https://api.openai.com/v1";
    }
    if (/\/chat\/completions$/i.test(endpoint)) {
      return endpoint;
    }
    if (/\/v1$/i.test(endpoint)) {
      return `${endpoint}/chat/completions`;
    }
    return `${endpoint}/v1/chat/completions`;
  }

  function openAIExtract(data) {
    if (!data) return "";
    const choice = data.choices && data.choices[0];
    if (choice) {
      if (choice.message) {
        const content = choice.message.content;
        if (Array.isArray(content)) {
          return content.map((part) => (typeof part === "string" ? part : part && part.text) || "").join("");
        }
        if (typeof content === "string") return content;
      }
      if (typeof choice.text === "string") return choice.text;
    }
    if (typeof data.output_text === "string") return data.output_text;
    if (Array.isArray(data.output)) {
      const parts = [];
      for (const item of data.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && typeof c.text === "string") parts.push(c.text);
          }
        }
      }
      if (parts.length) return parts.join("");
    }
    if (data.message && typeof data.message.content === "string") {
      return data.message.content;
    }
    return "";
  }

  /**
   * Shared OpenAI Chat Completions request. DeepSeek speaks the same protocol
   * but gets its own endpoint/key/model prefs so the two configurations do
   * not overwrite each other.
   */
  async function translateOpenAICompatible(ctx, config) {
    const key = String(ctx.host.getPref(config.keyPref) || "").trim();
    const defaultEndpoint = config.defaultEndpoint || "https://api.openai.com/v1";
    const endpoint = normalizeOpenAIEndpoint(
      ctx.host.getPref(config.endpointPref) || defaultEndpoint
    );
    const model = String(ctx.host.getPref(config.modelPref) || "").trim();
    if (!model) {
      throw new Error(
        `尚未配置 ${config.label} 的模型名。请在 设置 → 划词翻译 → AI 模型中填写。`
      );
    }
    if (!key && !config.allowEmptyKey) {
      throw new Error(
        `尚未配置 ${config.label} 的 API Key。请在 设置 → 划词翻译 → AI 模型中填写。`
      );
    }
    if (!key && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(endpoint)) {
      throw new Error(
        `尚未配置 ${config.label} 的 API Key。Ollama 等本地服务可留空。`
      );
    }
    const prompt = aiPrompt(ctx);
    const headers = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const extraPref = config.extraHeadersPref;
    const extra = extraPref ? String(ctx.host.getPref(extraPref) || "").trim() : "";
    if (extra && extra !== "{}") {
      try {
        const parsed = JSON.parse(extra);
        for (const [k, v] of Object.entries(parsed)) {
          headers[k] = String(v);
        }
      }
      catch (e) {
        throw new Error("AI 额外请求头不是合法 JSON。");
      }
    }
    const body = {
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: Number(ctx.host.getPref(config.temperaturePref)) || 0.2,
      stream: false,
    };
    const maxTokens = aiMaxTokens(ctx.host);
    if (maxTokens) body.max_tokens = maxTokens;
    const res = await httpJson("POST", endpoint, {
      headers,
      body: JSON.stringify(body),
      timeout: 120000,
    });
    const result = cleanAIResult(openAIExtract(res.data));
    if (!result) {
      throw new HttpError(0, `${config.label} 返回了空译文`, res.text);
    }
    return result;
  }

  async function translateOpenAI(ctx) {
    return translateOpenAICompatible(ctx, {
      label: "OpenAI 兼容接口",
      endpointPref: "openaiEndpoint",
      keyPref: "openaiKey",
      modelPref: "openaiModel",
      temperaturePref: "openaiTemperature",
      extraHeadersPref: "openaiExtraHeaders",
      defaultEndpoint: "https://api.openai.com/v1",
      allowEmptyKey: true,
    });
  }

  async function translateDeepSeek(ctx) {
    return translateOpenAICompatible(ctx, {
      label: "DeepSeek",
      endpointPref: "deepseekEndpoint",
      keyPref: "deepseekKey",
      modelPref: "deepseekModel",
      temperaturePref: "deepseekTemperature",
      extraHeadersPref: "",
      defaultEndpoint: "https://api.deepseek.com/v1",
      allowEmptyKey: false,
    });
  }

  function normalizeAnthropicEndpoint(raw) {
    let endpoint = String(raw || "https://api.anthropic.com/v1/messages").trim().replace(/\/+$/, "");
    if (/\/messages$/i.test(endpoint)) return endpoint;
    if (/\/v1$/i.test(endpoint)) return `${endpoint}/messages`;
    return `${endpoint}/v1/messages`;
  }

  async function translateAnthropic(ctx) {
    const key = String(ctx.host.getPref("anthropicKey") || "").trim();
    const model = String(ctx.host.getPref("anthropicModel") || "").trim();
    if (!key) {
      throw new Error("尚未配置 Anthropic API Key。");
    }
    if (!model) {
      throw new Error("尚未配置 Anthropic 模型名。");
    }
    const endpoint = normalizeAnthropicEndpoint(ctx.host.getPref("anthropicEndpoint"));
    const prompt = aiPrompt(ctx);
    const body = {
      model,
      max_tokens: aiMaxTokens(ctx.host),
      temperature: Number(ctx.host.getPref("anthropicTemperature")) || 0.2,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    };
    const res = await httpJson("POST", endpoint, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      timeout: 120000,
    });
    const data = res.data;
    let result = "";
    if (Array.isArray(data && data.content)) {
      result = data.content
        .filter((block) => block && block.type === "text")
        .map((block) => block.text || "")
        .join("");
    }
    result = cleanAIResult(result);
    if (!result) {
      throw new HttpError(0, "Anthropic 返回了空译文", res.text);
    }
    return result;
  }

  function geminiUrl(host) {
    const base = String(host.getPref("geminiEndpoint") || "https://generativelanguage.googleapis.com/v1beta")
      .trim()
      .replace(/\/+$/, "");
    const model = String(host.getPref("geminiModel") || "").trim();
    if (!model) {
      throw new Error("尚未配置 Gemini 模型名。");
    }
    if (/:generateContent$/i.test(base)) {
      return base;
    }
    return `${base}/models/${encodeURIComponent(model)}:generateContent`;
  }

  async function translateGemini(ctx) {
    const key = String(ctx.host.getPref("geminiKey") || "").trim();
    if (!key) {
      throw new Error("尚未配置 Gemini API Key。");
    }
    const endpoint = geminiUrl(ctx.host);
    const prompt = aiPrompt(ctx);
    const body = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      generationConfig: {
        temperature: Number(ctx.host.getPref("geminiTemperature")) || 0.2,
        maxOutputTokens: aiMaxTokens(ctx.host),
      },
    };
    const res = await httpJson("POST", endpoint, {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
      timeout: 120000,
    });
    const data = res.data;
    let result = "";
    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts;
    if (Array.isArray(parts)) {
      result = parts.map((part) => part.text || "").join("");
    }
    result = cleanAIResult(result);
    if (!result) {
      throw new HttpError(0, "Gemini 返回了空译文", res.text);
    }
    return result;
  }

  function createEngines(host) {
    const engines = {
      "deepl-free": { id: "deepl-free", translate: translateDeepLFree },
      "deepl-api": { id: "deepl-api", translate: translateDeepLApi },
      "google-free": { id: "google-free", translate: translateGoogleFree },
      mymemory: { id: "mymemory", translate: translateMyMemory },
      baidu: { id: "baidu", translate: translateBaidu },
      azure: { id: "azure", translate: translateAzure },
      libretranslate: { id: "libretranslate", translate: translateLibre },
      "ai-openai": { id: "ai-openai", translate: translateOpenAI },
      "ai-deepseek": { id: "ai-deepseek", translate: translateDeepSeek },
      "ai-anthropic": { id: "ai-anthropic", translate: translateAnthropic },
      "ai-gemini": { id: "ai-gemini", translate: translateGemini },
    };
    for (const engine of Object.values(engines)) {
      engine.host = host;
      engine.label = ENGINE_LABELS[engine.id];
    }
    return engines;
  }

  return {
    LANGUAGES,
    ENGINE_LABELS,
    ENGINE_IDS,
    ANNOTATION_COLORS,
    HttpError,
    createEngines,
    labelForLanguage,
    engineLabel,
    normalizeText,
    splitText,
    detectSourceLang,
    resolveSourceFor,
    cleanAIResult,
    decodeEntities,
  };
})();
