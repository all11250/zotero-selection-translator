/* global Zotero, Components, SelectionTranslatorEngines */

/**
 * Single-word dictionary lookups for Selection Translator.
 *
 * Sources are keyless public dictionary services:
 *  - Bing Dictionary (cn.bing.com/dict)         public web page
 *  - Youdao Dictionary (dict.youdao.com)        public JSON endpoint
 *  - Oxford Learner's Dictionaries              public web page
 *  - Free Dictionary API (dictionaryapi.dev)    open API, Wiktionary data
 *  - AI dictionary                              user's own AI API key
 *
 * The first three read public pages, which is what makes them free without an
 * API key, but they are unofficial integrations: they may change without
 * notice and their data is copyright of the respective publisher. The panel
 * always shows the source name and a link back, lookups are one word at a
 * time, and results are cached for the session. No bulk crawling is done.
 */
var SelectionTranslatorDictionary = (function () {
  "use strict";

  const E = SelectionTranslatorEngines;

  const SOURCES = {
    choose: {
      id: "choose",
      label: "请选择词典来源（不默认查询）",
      homepage: "",
      official: false,
    },
    auto: {
      id: "auto",
      label: "自动（依次尝试）",
      homepage: "",
      official: false,
    },
    bing: {
      id: "bing",
      label: "必应词典",
      homepage: "https://cn.bing.com/dict/",
      official: false,
    },
    youdao: {
      id: "youdao",
      label: "有道词典",
      homepage: "https://dict.youdao.com/",
      official: false,
    },
    oxford: {
      id: "oxford",
      label: "牛津学习者词典",
      homepage: "https://www.oxfordlearnersdictionaries.com/",
      official: false,
    },
    freedict: {
      id: "freedict",
      label: "Free Dictionary API",
      homepage: "https://dictionaryapi.dev/",
      official: true,
    },
    ai: {
      id: "ai",
      label: "AI 词典",
      homepage: "",
      official: false,
    },
  };

  const SOURCE_LIST = ["choose", "auto", "bing", "youdao", "oxford", "freedict", "ai"].map(
    (id) => SOURCES[id]
  );

  // Auto mode only walks free, keyless sources. AI is never called
  // implicitly because it costs the user money. Youdao is first because its
  // JSON endpoint is by far the fastest and provides both IPA and Chinese
  // meanings; Bing is the cross-check/fallback.
  const AUTO_ORDER = ["youdao", "bing", "oxford", "freedict"];

  const WEB_HEADERS = {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };

  function sourceLabel(id) {
    return (SOURCES[id] && SOURCES[id].label) || SOURCES[id] || id || "";
  }

  function sources() {
    return SOURCES;
  }

  function sourceList() {
    return SOURCE_LIST;
  }

  function normalizeWord(text) {
    const value = String(text || "")
      .trim()
      .replace(/^[\s"'“”‘’()[\]{}<>«».,;:!?、。，；：！？]+/u, "")
      .replace(/[\s"'“”‘’()[\]{}<>«».,;:!?、。，；：！？]+$/u, "");
    if (!value || /\s/.test(value) || value.length > 64) {
      return "";
    }
    if (!/\p{Script=Latin}/u.test(value)) {
      return "";
    }
    return /^[\p{L}\p{M}'’\-]+$/u.test(value) ? value : "";
  }

  function textOf(node) {
    if (!node) {
      return "";
    }
    return String(node.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseHtml(text, doc) {
    const candidates = [];
    try {
      candidates.push(doc && doc.defaultView);
    }
    catch (e) {
      // Ignore.
    }
    try {
      candidates.push(Zotero.getMainWindow());
    }
    catch (e) {
      // Ignore.
    }
    for (const win of candidates) {
      try {
        if (win && win.DOMParser) {
          return new win.DOMParser().parseFromString(text, "text/html");
        }
      }
      catch (e) {
        // Try the next parser.
      }
    }
    try {
      const parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
        .createInstance(Components.interfaces.nsIDOMParser);
      return parser.parseFromString(text, "text/html");
    }
    catch (e) {
      // Fall through.
    }
    throw new Error("当前环境无法解析词典网页。");
  }

  function absoluteUrl(path, base) {
    const value = String(path || "").trim();
    if (!value) {
      return "";
    }
    if (/^https?:/i.test(value)) {
      return value;
    }
    if (value.startsWith("//")) {
      return `https:${value}`;
    }
    try {
      return new URL(value, base).href;
    }
    catch (e) {
      return `${String(base || "").replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
    }
  }

  function attrOf(doc, selector, name) {
    const node = doc.querySelector(selector);
    return node && node.getAttribute ? node.getAttribute(name) || "" : "";
  }

  function trimIpa(value) {
    let out = String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/^\s*(?:英国|美国|美|英)\s*/u, "")
      .trim();
    out = out.replace(/^\[|\]$/g, "").replace(/^\/|\/$/g, "").trim();
    return out;
  }

  function splitMeanings(value) {
    return String(value || "")
      .split(/[；;]/u)
      .map((part) => part.trim().replace(/[，,、]\s*$/u, ""))
      .filter(Boolean);
  }

  const POS_LABELS = {
    noun: "n. 名词",
    verb: "v. 动词",
    adjective: "adj. 形容词",
    adverb: "adv. 副词",
    pronoun: "pron. 代词",
    preposition: "prep. 介词",
    conjunction: "conj. 连词",
    interjection: "int. 感叹词",
    exclamation: "int. 感叹词",
    determiner: "det. 限定词",
    article: "art. 冠词",
    numeral: "num. 数词",
    number: "num. 数词",
    auxiliary: "aux. 助动词",
    modal: "modal 情态动词",
    "phrasal verb": "phr.v. 动词短语",
    idiom: "idiom 习语",
    phrase: "phrase 短语",
    prefix: "prefix 前缀",
    suffix: "suffix 后缀",
  };

  function localizePos(pos) {
    const value = String(pos || "").trim();
    if (!value) {
      return "释义";
    }
    const translated = POS_LABELS[value.toLowerCase()];
    return translated || value;
  }

  function makeData(options) {
    if (options && Array.isArray(options.entries)) {
      options.entries = options.entries.map((entry) =>
        Object.assign({}, entry, { pos: localizePos(entry.pos) })
      );
    }
    const data = {
      word: options.word || "",
      source: options.source || "",
      sourceLabel: options.sourceLabel || sourceLabel(options.source),
      sourceUrl: options.sourceUrl || "",
      phonetics: options.phonetics || {},
      audio: options.audio || {},
      entries: options.entries || [],
      translation: options.translation || "",
      note: options.note || "",
    };
    return data;
  }

  async function requestText(url, options) {
    const res = await E.httpRequest("GET", url, options || {});
    return res.text;
  }

  // ------------------------------------------------------------------ Bing

  async function lookupBing(ctx) {
    const word = ctx.word;
    const url = `https://cn.bing.com/dict/search?q=${encodeURIComponent(
      word
    )}&FORM=BDVSP6&mkt=zh-cn`;
    const html = await requestText(url, {
      headers: WEB_HEADERS,
      timeout: 20000,
    });
    const doc = parseHtml(html, ctx.doc);
    const headword =
      textOf(doc.querySelector("#headword h1")) ||
      textOf(doc.querySelector(".hd_area h1")) ||
      word;
    const us = trimIpa(textOf(doc.querySelector(".hd_prUS")));
    const uk = trimIpa(textOf(doc.querySelector(".hd_pr")));
    const usAudio = absoluteUrl(
      attrOf(doc, "#bigaud_us", "data-mp3link"),
      "https://cn.bing.com"
    );
    const ukAudio = absoluteUrl(
      attrOf(doc, "#bigaud_uk", "data-mp3link"),
      "https://cn.bing.com"
    );

    const qdef = doc.querySelector(".qdef");
    let list = qdef && qdef.parentElement
      ? qdef.parentElement.querySelector("ul")
      : null;
    if (!list) {
      list = doc.querySelector(".lf_area ul");
    }
    const entries = [];
    if (list) {
      for (const item of Array.from(list.children)) {
        if (entries.length >= 6) {
          break;
        }
        if (!item || item.tagName !== "LI") {
          continue;
        }
        const posNode = item.querySelector(".pos");
        const defNode = item.querySelector(".def");
        const pos = textOf(posNode);
        const meaning = textOf(defNode);
        if (!meaning) {
          continue;
        }
        if (/^网络$/u.test(pos)) {
          continue;
        }
        entries.push({ pos: pos || "释义", terms: splitMeanings(meaning) });
      }
    }
    if (!entries.length) {
      throw new Error(`必应词典未找到“${word}”的释义`);
    }
    return makeData({
      word: headword || word,
      source: "bing",
      sourceUrl: url,
      phonetics: { us, uk },
      audio: { us: usAudio, uk: ukAudio },
      entries,
    });
  }

  // ---------------------------------------------------------------- Youdao

  async function lookupYoudao(ctx) {
    const word = ctx.word;
    // Ask for the ec (English-Chinese) section only: the full response can be
    // hundreds of kilobytes and we do not display examples or web results.
    const dicts = encodeURIComponent(JSON.stringify({ count: 1, dicts: [["ec"]] }));
    const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(
      word
    )}&dicts=${dicts}`;
    const raw = await requestText(url, {
      headers: Object.assign({}, WEB_HEADERS, {
        Accept: "application/json,text/plain,*/*",
        Referer: "https://dict.youdao.com/",
      }),
      timeout: 20000,
    });
    const data = E.parseJson(raw, url);
    if (data && data.meta && data.meta.isHasSimpleDict === "0") {
      throw new Error(`有道词典未找到“${word}”的释义`);
    }
    const ec = data && data.ec;
    const ecWord = ec && ec.word && (Array.isArray(ec.word) ? ec.word[0] : ec.word);
    const simple =
      data && data.simple && data.simple.word
        ? Array.isArray(data.simple.word)
          ? data.simple.word[0]
          : data.simple.word
        : null;
    const phones = ecWord || simple || {};
    const us = trimIpa(phones.usphone);
    const uk = trimIpa(phones.ukphone);
    const entries = [];
    const trs = (ecWord && ecWord.trs) || [];
    for (const group of trs) {
      const rows = (group && group.tr) || [];
      for (const row of rows) {
        if (entries.length >= 6) {
          break;
        }
        const items = row && row.l && row.l.i;
        const values = Array.isArray(items) ? items : items ? [items] : [];
        for (const value of values) {
          const text = String(value || "").trim();
          if (!text) {
            continue;
          }
          const match = text.match(/^([A-Za-z]+\.)\s*(.+)$/u);
          const pos = match ? match[1] : "";
          const terms = splitMeanings(match ? match[2] : text);
          if (terms.length) {
            entries.push({ pos: pos || "释义", terms });
          }
        }
      }
    }
    if (!entries.length) {
      throw new Error(`有道词典未找到“${word}”的释义`);
    }
    return makeData({
      word,
      source: "youdao",
      sourceUrl: `https://dict.youdao.com/result?word=${encodeURIComponent(
        word
      )}&lang=en`,
      phonetics: { us, uk },
      audio: {
        us: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(
          word
        )}&type=2`,
        uk: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(
          word
        )}&type=1`,
      },
      entries,
    });
  }

  // ---------------------------------------------------------------- Oxford

  async function lookupOxford(ctx) {
    const word = ctx.word;
    const url = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(
      word.toLowerCase()
    )}`;
    const html = await requestText(url, {
      headers: WEB_HEADERS,
      timeout: 25000,
    });
    const doc = parseHtml(html, ctx.doc);
    const headword = textOf(doc.querySelector("h1.headword")) || word;
    const pos = textOf(doc.querySelector(".webtop .pos")) || "释义";
    const uk = trimIpa(
      textOf(doc.querySelector(".phons_br .phon")) ||
        textOf(doc.querySelector(".phon_br .phon"))
    );
    const us = trimIpa(
      textOf(doc.querySelector(".phons_n_am .phon")) ||
        textOf(doc.querySelector(".phon_us .phon"))
    );
    const ukAudio = absoluteUrl(
      attrOf(doc, ".phons_br .sound", "data-src-mp3"),
      "https://www.oxfordlearnersdictionaries.com"
    );
    const usAudio = absoluteUrl(
      attrOf(doc, ".phons_n_am .sound", "data-src-mp3"),
      "https://www.oxfordlearnersdictionaries.com"
    );

    const definitions = [];
    const seen = new Set();
    for (const sense of Array.from(
      doc.querySelectorAll("#entryContent .sense")
    )) {
      if (definitions.length >= 6) {
        break;
      }
      const def = sense.querySelector(".def");
      const value = textOf(def);
      if (value && !seen.has(value)) {
        seen.add(value);
        definitions.push(value);
      }
    }
    if (!definitions.length) {
      throw new Error(`牛津词典未找到“${word}”的释义`);
    }
    return makeData({
      word: headword || word,
      source: "oxford",
      sourceUrl: url,
      phonetics: { us, uk },
      audio: { us: usAudio, uk: ukAudio },
      entries: [{ pos, terms: [], definitions }],
      note: "牛津词典仅提供英文释义，中文翻译由当前翻译引擎补充。",
    });
  }

  // ------------------------------------------------------------- Free Dict

  async function lookupFreeDict(ctx) {
    const word = ctx.word;
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
      word.toLowerCase()
    )}`;
    const raw = await requestText(url, {
      headers: { Accept: "application/json" },
      timeout: 20000,
    });
    const data = E.parseJson(raw, url);
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry) {
      throw new Error(`Free Dictionary 未收录“${word}”`);
    }
    const phoneticList = Array.isArray(entry.phonetics) ? entry.phonetics : [];
    let usAudio = "";
    let ukAudio = "";
    let usIpa = "";
    let ukIpa = "";
    for (const item of phoneticList) {
      const audio = String((item && item.audio) || "");
      if (!audio) {
        continue;
      }
      if (/[-_/]us[-_.]|us_pron|\/us\//i.test(audio)) {
        usAudio = usAudio || audio;
        usIpa = usIpa || trimIpa(item.text);
      }
      else if (/[-_/](uk|gb)[-_.]|uk_pron|\/uk\//i.test(audio)) {
        ukAudio = ukAudio || audio;
        ukIpa = ukIpa || trimIpa(item.text);
      }
    }
    const us = usIpa || trimIpa(entry.phonetic || "");
    const entries = [];
    for (const meaning of entry.meanings || []) {
      if (entries.length >= 6) {
        break;
      }
      const definitions = (meaning.definitions || [])
        .slice(0, 3)
        .map((item) => textOf({ textContent: item.definition }))
        .filter(Boolean);
      entries.push({
        pos: meaning.partOfSpeech || "释义",
        terms: [],
        definitions,
      });
    }
    if (!entries.length) {
      throw new Error(`Free Dictionary 未收录“${word}”`);
    }
    const license = entry.license && entry.license.name;
    return makeData({
      word: entry.word || word,
      source: "freedict",
      sourceUrl:
        (entry.sourceUrls && entry.sourceUrls[0]) ||
        `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      phonetics: { us, uk: ukIpa },
      audio: { us: usAudio, uk: ukAudio },
      entries,
      note: license
        ? `Wiktionary 数据，${license}；释义为英文，中文翻译由当前翻译引擎补充。`
        : "Wiktionary 数据；释义为英文，中文翻译由当前翻译引擎补充。",
    });
  }

  // -------------------------------------------------------------------- AI

  function parseAIDictionary(text, word) {
    const raw = String(text || "").trim();
    if (!raw) {
      throw new Error("AI 返回了空内容");
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        const entries = [];
        for (const entry of parsed.entries || []) {
          if (entries.length >= 6) {
            break;
          }
          const pos = String(entry.pos || entry.partOfSpeech || "释义").trim();
          let terms = entry.meanings || entry.terms || entry.translations || [];
          if (typeof terms === "string") {
            terms = splitMeanings(terms);
          }
          terms = (Array.isArray(terms) ? terms : [])
            .map((item) =>
              typeof item === "string"
                ? item
                : String((item && (item.meaning || item.text)) || "")
            )
            .map((item) => item.trim())
            .filter(Boolean);
          if (terms.length) {
            entries.push({ pos, terms });
          }
        }
        if (entries.length) {
          return makeData({
            word: parsed.word || word,
            source: "ai",
            phonetics: {
              us: trimIpa(parsed.phonetic_us || parsed.usphone),
              uk: trimIpa(parsed.phonetic_uk || parsed.ukphone),
            },
            entries,
            note: "AI 生成，仅供参考。",
          });
        }
      }
      catch (e) {
        // Fall through to the plain-text parser.
      }
    }
    // Tolerate "n. 意思；意思" lines when the model ignores the JSON request.
    const entries = [];
    for (const line of raw.split(/\r?\n/)) {
      const match = line
        .trim()
        .match(/^([A-Za-z]+\.)\s*(.+)$/u);
      if (match) {
        const terms = splitMeanings(match[2]);
        if (terms.length) {
          entries.push({ pos: match[1], terms });
        }
      }
    }
    if (!entries.length) {
      throw new Error("AI 词典返回的内容无法解析");
    }
    return makeData({
      word,
      source: "ai",
      entries,
      note: "AI 生成，仅供参考。",
    });
  }

  async function lookupAI(ctx) {
    const result = await E.aiDictionary({
      host: ctx.host,
      word: ctx.word,
      engineId: ctx.engineId,
      targetLang: ctx.targetLang,
      sourceLang: ctx.sourceLang,
      paperContext: ctx.paperContext,
    });
    const data = parseAIDictionary(result.text, ctx.word);
    data.note = `${E.engineLabel(result.engine)} 生成，仅供参考。`;
    return data;
  }

  // ------------------------------------------------------------- utilities

  async function attachTranslation(data, ctx) {
    if (!data || data.source === "ai") {
      return data;
    }
    if (data.translation || typeof ctx.translateWord !== "function") {
      return data;
    }
    // Chinese translations for dictionaries that only define the word in
    // English (Oxford, Wiktionary). A failed translation must not hide the
    // dictionary result, so errors are swallowed.
    try {
      const translated = await ctx.translateWord(data.word || ctx.word);
      if (translated && String(translated).trim()) {
        data.translation = String(translated).trim();
      }
    }
    catch (e) {
      // Best effort only.
    }
    return data;
  }

  async function lookupSource(id, ctx) {
    let data;
    if (id === "bing") {
      data = await lookupBing(ctx);
    }
    else if (id === "youdao") {
      data = await lookupYoudao(ctx);
    }
    else if (id === "oxford") {
      data = await lookupOxford(ctx);
    }
    else if (id === "freedict") {
      data = await lookupFreeDict(ctx);
    }
    else if (id === "ai") {
      data = await lookupAI(ctx);
    }
    else {
      throw new Error(`未知词典来源：${id}`);
    }
    if (id === "oxford" || id === "freedict") {
      await attachTranslation(data, ctx);
    }
    return data;
  }

  async function lookup(ctx) {
    const word = normalizeWord(ctx && ctx.word);
    if (!word) {
      throw new Error("这不是一个可以查词典的单词。");
    }
    const source = (ctx && ctx.source) || "choose";
    if (source === "choose") {
      throw new Error("尚未选择词典来源。请先在设置或词典卡片顶部选择来源。");
    }
    if (source === "auto") {
      const errors = [];
      for (const id of AUTO_ORDER) {
        try {
          return await lookupSource(id, Object.assign({}, ctx, { word }));
        }
        catch (error) {
          errors.push(`${sourceLabel(id)}：${(error && error.message) || error}`);
        }
      }
      throw new Error(`所有免费词典都没有查到“${word}”：\n${errors.join("\n")}`);
    }
    return await lookupSource(source, Object.assign({}, ctx, { word }));
  }

  // Text copied to the clipboard / written into an annotation comment.
  function plainText(data) {
    if (!data) {
      return "";
    }
    const lines = [];
    if (data.word) {
      lines.push(data.word);
    }
    const us = data.phonetics && data.phonetics.us;
    const uk = data.phonetics && data.phonetics.uk;
    if (us || uk) {
      lines.push(
        [us ? `美 /${us}/` : "", uk ? `英 /${uk}/` : ""].filter(Boolean).join("  ")
      );
    }
    if (data.translation) {
      lines.push(data.translation);
    }
    for (const entry of data.entries || []) {
      const meaning = (entry.terms || []).length
        ? entry.terms.join("；")
        : (entry.definitions || [])[0] || "";
      if (meaning) {
        lines.push(`${entry.pos || ""} ${meaning}`.trim());
      }
    }
    return lines.filter(Boolean).join("\n");
  }

  return {
    SOURCES,
    sources,
    sourceList,
    sourceLabel,
    normalizeWord,
    lookup,
    plainText,
    parseAIDictionary,
  };
})();
