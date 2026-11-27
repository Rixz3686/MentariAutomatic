(function (root) {
  "use strict";

  const protocol =
    root.MentariAiProtocol ||
    (typeof require === "function" ? require("../shared/aiProtocol.js") : null);

  function getAiClient() {
    if (root.MentariAiClient) return root.MentariAiClient;
    if (typeof require === "function") {
      try {
        return require("./aiClient.js");
      } catch {
        return null;
      }
    }
    return null;
  }

  const DEFAULT_BASE_URL = protocol?.DEFAULT_BASE_URL || "https://route.bogorcreativa.co.id/v1";
  const DEFAULT_MODEL = protocol?.DEFAULT_MODEL || "mentari";
  const CHUNK_SIZE = 8;
  const CONCURRENCY = 3;
  const MAX_RETRIES = 2;
  const RETRY_DELAYS_MS = [450, 1100];
  const REQUEST_TIMEOUT_MS = 25000;
  const CACHE_PREFIX = "mentari_quiz_cache_v2_";
  const MAX_QUIZ_CACHE_KEYS = 16;

  function delayWithSignal(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function normalize(str) {
    return String(str || "")
      .replace(/[=*_•]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function hashOptions(options) {
    const str = (Array.isArray(options) ? options : []).map(normalize).join("||");
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function parseJsonObjects(raw) {
    return protocol ? protocol.parseJsonObjects(raw) : [];
  }

  function extractChatContent(parsedObjects) {
    if (!protocol) return "";
    const list = Array.isArray(parsedObjects) ? parsedObjects : [parsedObjects];
    const errMsg = protocol.extractPayloadError(list);
    if (errMsg) {
      throw new Error(errMsg);
    }
    return (protocol.extractChatContent(list) || "").trim();
  }

  function readRouteConfig(storage) {
    const aiClient = getAiClient();
    if (!storage || typeof storage.getItem !== "function") {
      if (aiClient?.getCachedConfigSync) {
        const cached = aiClient.getCachedConfigSync();
        if (cached?.apiKey) return cached;
      }
      return { apiKey: null, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL };
    }

    let apiKey = null;
    const rawKey = storage.getItem("routeApiKey");
    if (rawKey) {
      try {
        apiKey = typeof atob === "function"
          ? atob(rawKey)
          : Buffer.from(rawKey, "base64").toString("utf8");
      } catch {
        apiKey = null;
      }
    }

    const rawBase = protocol
      ? protocol.normalizeBaseUrl(storage.getItem("routeBaseUrl"))
      : String(storage.getItem("routeBaseUrl") || DEFAULT_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
    const baseUrl = protocol?.isValidBaseUrl(rawBase) ? rawBase : DEFAULT_BASE_URL;
    const model =
      String(storage.getItem("routeModel") || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

    return { apiKey: apiKey ? String(apiKey).trim() : null, baseUrl, model };
  }

  async function readRouteConfigAsync(storage) {
    const aiClient = getAiClient();
    if (aiClient?.getConfig) {
      const cfg = await aiClient.getConfig();
      if (cfg?.hasApiKey || cfg?.apiKey) return cfg;
      if (aiClient.hasExtensionRuntime?.()) return cfg;
    }
    if (aiClient?.hasExtensionRuntime?.()) {
      return { hasApiKey: false, apiKey: null, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL };
    }
    return readRouteConfig(storage);
  }

  function buildFastBatchPrompt(chunk) {
    const formatted = chunk
      .map((q) => {
        const opts = (q.options || [])
          .map((opt, idx) => `${String.fromCharCode(97 + idx)}. ${opt}`)
          .join("\n");
        return `SOAL ${q.number}\n${q.question}\n${opts}`;
      })
      .join("\n\n");

    return [
      "Kamu adalah asisten akademik cepat & akurat untuk quiz mahasiswa UNPAM.",
      "Pilih jawaban PALING BENAR untuk setiap soal di bawah.",
      'Balas HANYA JSON array valid tanpa markdown/teks lain: [{"n":1,"a":"b","r":"alasan singkat max 15 kata"}]',
      'Aturan: "n" = nomor SOAL, "a" = huruf pilihan lowercase sesuai opsi yang tersedia, "r" = 1 kalimat alasan singkat Bahasa Indonesia.',
      "",
      formatted,
    ].join("\n");
  }

  function extractJsonArrayCandidates(rawContent) {
    return protocol ? protocol.extractJsonCandidates(rawContent) : [];
  }

  function parseLetterToken(rawLetter, maxOptions = 26) {
    const cleaned = String(rawLetter ?? "").trim().toLowerCase();
    if (!cleaned) return null;
    const match = cleaned.match(/^\(?([a-z])\)?(?:$|[.):\s])/);
    if (!match) return null;
    const letter = match[1];
    const idx = letter.charCodeAt(0) - 97;
    if (idx < 0 || idx >= Math.min(26, Math.max(1, maxOptions))) return null;
    return letter;
  }

  function parseLegacyTextOutput(rawContent, chunk) {
    const blocks = String(rawContent || "")
      .replace(/\r/g, "")
      .replace(/\*\*|__|[*#`]/g, "")
      .split(/(?:^|\n)[ \t]*SOAL[ \t]+(\d+)[^\n]*\n?/i);

    const byNum = new Map();
    for (let i = 1; i < blocks.length; i += 2) {
      byNum.set(Number(blocks[i]), blocks[i + 1] || "");
    }

    return chunk.map((q) => {
      const body = byNum.get(q.number) || "";
      const ansMatch = body.match(/JAWABAN[ \t]*:[ \t]*\(?([A-Z])\)?\b/i);
      const reasonMatch = body.match(/ALASAN[ \t]*:[ \t]*([\s\S]*?)(?=JAWABAN[ \t]*:|$)/i);
      const maxOpts = Array.isArray(q.options) && q.options.length ? q.options.length : 26;
      const letter = ansMatch ? parseLetterToken(ansMatch[1], maxOpts) : null;
      return {
        letter,
        reasoning: reasonMatch ? reasonMatch[1].replace(/\s+/g, " ").trim() : "",
      };
    });
  }

  function parseFastBatchOutput(rawContent, chunk) {
    const hasObjectItem = (arr) => Array.isArray(arr) && arr.some((it) => it && typeof it === "object");
    let parsedArray = null;
    for (const candidate of extractJsonArrayCandidates(rawContent)) {
      try {
        const parsed = JSON.parse(candidate);
        const arr = hasObjectItem(parsed)
          ? parsed
          : hasObjectItem(parsed?.answers)
            ? parsed.answers
            : hasObjectItem(parsed?.results)
              ? parsed.results
              : hasObjectItem(parsed?.data)
                ? parsed.data
                : null;
        if (arr) {
          parsedArray = arr;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (parsedArray) {
      const qByNum = new Map((chunk || []).map((q) => [q.number, q]));
      const byNum = new Map();
      for (const item of parsedArray) {
        if (!item || typeof item !== "object") continue;
        const num = Number(item.n ?? item.number ?? item.soal);
        if (!Number.isFinite(num)) continue;
        const q = qByNum.get(num);
        const maxOpts = Array.isArray(q?.options) && q.options.length ? q.options.length : 26;
        const rawLetter = item.a ?? item.answer ?? item.jawaban ?? item.letter ?? "";
        const letter = parseLetterToken(rawLetter, maxOpts);
        const reasoning = String(item.r ?? item.reason ?? item.alasan ?? "")
          .replace(/\s+/g, " ")
          .trim();
        byNum.set(num, { letter, reasoning });
      }

      const mapped = chunk.map((q) => byNum.get(q.number) || { letter: null, reasoning: "" });
      if (mapped.some((m) => m.letter)) {
        return mapped;
      }
    }

    return parseLegacyTextOutput(rawContent, chunk);
  }

  function fallbackAnswer(question, options, errorMessage = null) {
    if (!Array.isArray(options) || options.length === 0) {
      return {
        letter: null,
        reasoning: errorMessage || "Tidak ada pilihan jawaban yang tersedia.",
        fallback: true,
        error: errorMessage || null,
      };
    }

    const words = String(question || "")
      .toLowerCase()
      .replace(/[.,?!;:()]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let bestIdx = 0;
    let bestScore = 0;
    options.forEach((opt, idx) => {
      const lower = String(opt || "").toLowerCase();
      const score = words.filter((w) => lower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    const errPrefix = errorMessage ? `AI gagal (${errorMessage}). ` : "";
    return {
      letter: String.fromCharCode(97 + bestIdx),
      reasoning: `${errPrefix}Perkiraan otomatis dari kata kunci — tidak diisi otomatis, mohon cek manual.`,
      fallback: true,
      error: errorMessage || null,
    };
  }

  async function callRouteFast(routeConfig, prompt, opts = {}) {
    const baseUrl = protocol
      ? protocol.normalizeBaseUrl(routeConfig?.baseUrl)
      : String(routeConfig?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const model = String(routeConfig?.model || DEFAULT_MODEL);
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : REQUEST_TIMEOUT_MS;
    const signal = opts.signal;

    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    const aiClient = getAiClient();
    if (!aiClient?.chatCompletion) {
      throw new Error("MentariAiClient tidak tersedia.");
    }

    const useDirect = typeof opts.fetchImpl === "function" || !aiClient.hasExtensionRuntime?.();
    const res = await aiClient.chatCompletion({
      ...(useDirect ? { baseUrl, apiKey: routeConfig?.apiKey } : {}),
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      topP: 0.1,
      maxTokens: 2500,
      timeoutMs,
      signal,
      fetchImpl: opts.fetchImpl,
    });
    if (!res.ok) {
      const err = new Error(res.error || `API Error ${res.status}`);
      err.status = res.status;
      err.retryable = Boolean(res.retryable);
      if (res.retryAfterMs != null) {
        err.retryAfterMs = res.retryAfterMs;
      }
      throw err;
    }
    return res.content;
  }

  async function solveChunk(routeConfig, chunk, opts = {}) {
    const delayImpl = opts.delayImpl || ((ms) => delayWithSignal(ms, opts.signal));
    const isCancelled = typeof opts.isCancelled === "function" ? opts.isCancelled : () => false;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (isCancelled() || opts.signal?.aborted) {
        return null;
      }
      try {
        const raw = await callRouteFast(routeConfig, buildFastBatchPrompt(chunk), opts);
        if (isCancelled() || opts.signal?.aborted) return null;

        const parsed = parseFastBatchOutput(raw, chunk);
        if (parsed.every((p) => !p.letter)) {
          const err = new Error("Format jawaban AI tidak terbaca");
          err.retryable = true;
          throw err;
        }

        return chunk.map((q, idx) => {
          const item = parsed[idx];
          const optIdx = item?.letter ? item.letter.charCodeAt(0) - 97 : -1;
          if (optIdx >= 0 && optIdx < (q.options || []).length) {
            return {
              letter: item.letter,
              reasoning: item.reasoning || "AI tidak menuliskan alasan untuk soal ini.",
              fallback: false,
              error: null,
            };
          }
          return fallbackAnswer(q.question, q.options, "AI melewatkan soal ini");
        });
      } catch (err) {
        if (err?.name === "AbortError" || isCancelled() || opts.signal?.aborted) {
          return null;
        }
        lastError = err;
        const status = Number(err?.status);
        const nonRetryable =
          err?.retryable === false ||
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 404;
        if (nonRetryable || attempt >= MAX_RETRIES) {
          break;
        }
        try {
          const baseDelay = RETRY_DELAYS_MS[attempt] ?? 1000;
          const waitMs = Math.min(15000, Math.max(baseDelay, Number(err?.retryAfterMs) || 0));
          await delayImpl(waitMs);
        } catch {
          return null;
        }
      }
    }

    if (typeof opts.onChunkError === "function" && lastError) {
      try {
        opts.onChunkError(chunk, lastError);
      } catch {
        // ignore callback errors
      }
    }

    const errMsg = lastError?.message || "Gagal menghubungi AI";
    return chunk.map((q) => fallbackAnswer(q.question, q.options, errMsg));
  }

  async function solveAllParallel(routeConfig, questions, opts = {}) {
    const list = Array.isArray(questions) ? questions : [];
    if (!list.length) return [];

    const chunkSize = Math.max(1, opts.chunkSize || CHUNK_SIZE);
    const concurrency = Math.max(1, opts.concurrency || CONCURRENCY);
    const isCancelled = typeof opts.isCancelled === "function" ? opts.isCancelled : () => false;

    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    }

    let nextIdx = 0;
    const allResults = new Array(chunks.length);

    async function worker() {
      while (!isCancelled() && !opts.signal?.aborted) {
        const myIdx = nextIdx++;
        if (myIdx >= chunks.length) break;
        const chunk = chunks[myIdx];
        const results = await solveChunk(routeConfig, chunk, opts);
        if (!results || isCancelled() || opts.signal?.aborted) break;
        allResults[myIdx] = results;
        if (typeof opts.onChunkDone === "function") {
          opts.onChunkDone(chunk, results);
        }
      }
    }

    const workerCount = Math.min(concurrency, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return allResults.flat().filter(Boolean);
  }

  function makeCacheKey(quizId, scope = "") {
    const cleanScope = scope ? `${String(scope).replace(/[^a-z0-9_-]/gi, "")}_` : "";
    return `${CACHE_PREFIX}${cleanScope}${quizId}`;
  }

  function pruneQuizCacheKeys(storage) {
    if (!storage || typeof storage.length !== "number") return;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        let ts = 0;
        try {
          const parsed = JSON.parse(storage.getItem(k) || "{}");
          ts = Number(parsed?.__ts || 0);
        } catch {
          ts = 0;
        }
        keys.push({ key: k, ts });
      }
    }
    if (keys.length <= MAX_QUIZ_CACHE_KEYS) return;
    keys.sort((a, b) => a.ts - b.ts);
    const toRemove = keys.length - MAX_QUIZ_CACHE_KEYS;
    for (let i = 0; i < toRemove; i++) {
      try {
        storage.removeItem(keys[i].key);
      } catch {
        // ignore
      }
    }
  }

  function loadQuizCache(storage, quizId, scope = "") {
    if (!storage || !quizId) return {};
    try {
      const raw = storage.getItem(makeCacheKey(quizId, scope));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function clearQuizCache(storage, quizId, scope = "") {
    if (!storage || !quizId) return;
    try {
      storage.removeItem(makeCacheKey(quizId, scope));
    } catch {
      // ignore
    }
  }

  function saveQuizCache(storage, quizId, entries, scope = "") {
    if (!storage || !quizId || !Array.isArray(entries)) return;
    try {
      const cache = loadQuizCache(storage, quizId, scope);
      for (const entry of entries) {
        if (entry?.status === "done" && entry.letter && !entry.fallback) {
          cache[String(entry.id)] = {
            letter: entry.letter,
            reasoning: entry.reasoning || "",
            optHash: hashOptions(entry.options),
            fallback: false,
          };
        }
      }
      cache.__ts = Date.now();
      storage.setItem(makeCacheKey(quizId, scope), JSON.stringify(cache));
      pruneQuizCacheKeys(storage);
    } catch {
      // Ignore quota / private mode errors
    }
  }

  function groupRadioItems(items) {
    const groups = new Map();
    for (const item of items || []) {
      const key = item.name
        ? `name:${item.name}`
        : item.groupKey
          ? `dom:${item.groupKey}`
          : "__noname__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item.el);
    }
    return [...groups.values()];
  }

  function resolveVisibleGroups(radios, groups, optionCounts) {
    if (
      groups.length === optionCounts.length &&
      groups.every((g, idx) => g.length === optionCounts[idx])
    ) {
      return groups;
    }

    const total = optionCounts.reduce((acc, n) => acc + n, 0);
    if (radios.length === total && total > 0) {
      const sliced = [];
      let cursor = 0;
      for (const count of optionCounts) {
        sliced.push(radios.slice(cursor, cursor + count));
        cursor += count;
      }
      return sliced;
    }

    if (
      groups.length === optionCounts.length &&
      groups.length >= 1 &&
      groups.every((g) => g.length >= 2)
    ) {
      return groups;
    }

    return null;
  }

  function pickTargetRadioInGroup(groupRadios, radioLabels, entry) {
    if (!Array.isArray(groupRadios) || !groupRadios.length || !entry?.letter) return null;
    const ansIdx = entry.letter.charCodeAt(0) - 97;
    const expectedText = normalize(entry.options?.[ansIdx] || "");

    if (expectedText && Array.isArray(radioLabels)) {
      const normLabels = radioLabels.map((lbl) => normalize(lbl));
      const exactMatches = [];
      for (let i = 0; i < groupRadios.length; i++) {
        if (normLabels[i] && normLabels[i] === expectedText) {
          exactMatches.push(groupRadios[i]);
        }
      }
      if (exactMatches.length === 1) return exactMatches[0];

      if (expectedText.length >= 6) {
        const fuzzyMatches = [];
        for (let i = 0; i < groupRadios.length; i++) {
          const lbl = normLabels[i];
          if (lbl && lbl.length >= 6 && (lbl.includes(expectedText) || expectedText.includes(lbl))) {
            fuzzyMatches.push(groupRadios[i]);
          }
        }
        if (fuzzyMatches.length === 1) return fuzzyMatches[0];
      }
    }

    return groupRadios[ansIdx] || null;
  }

  const MentariQuizSolver = {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    CHUNK_SIZE,
    CONCURRENCY,
    normalize,
    hashOptions,
    parseJsonObjects,
    extractChatContent,
    readRouteConfig,
    readRouteConfigAsync,
    buildFastBatchPrompt,
    parseFastBatchOutput,
    fallbackAnswer,
    solveChunk,
    solveAllParallel,
    loadQuizCache,
    saveQuizCache,
    clearQuizCache,
    groupRadioItems,
    resolveVisibleGroups,
    pickTargetRadioInGroup,
  };

  root.MentariQuizSolver = MentariQuizSolver;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MentariQuizSolver;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
