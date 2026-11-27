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

  const DOUBLE_NEGATIVE_PATTERNS = [
    /\b(tidak\s+ada|tidak\s+terdapat|tidak\s+mengalami|tanpa|bebas\s+dari|terbebas\s+dari|bukan)\s+(kendala|hambatan|kesulitan|masalah|gangguan|keluhan|error|kesalahan|kekurangan)\b/i,
    /\b(tidak\s+sulit|tidak\s+membingungkan|tidak\s+membosankan|tidak\s+terlambat)\b/i,
    /\b(tidak\s+pernah|jarang|selalu\s+tidak)\s+(terlambat|absen|mengganggu|membosankan|membingungkan|buruk|sulit|gagal|macet|error)\b/i,
    /\b(membantu|memudahkan|mampu|berhasil|dapat|bisa)\s+(mengatasi|menyelesaikan|mengurangi|menghindari|mencegah)\s+(kendala|hambatan|kesulitan|masalah|gangguan|keluhan|error|kesalahan)\b/i,
  ];

  const NEGATIVE_QUESTION_PATTERNS = [
    /\b(kendala|hambatan|kesulitan|kesusahan|gangguan|masalah|keluhan|kekurangan|kelemahan|kesalahan|error|bug|eror|macet|lambat|lemot)\b/i,
    /\b(sulit|susah|rumit|membingungkan|membosankan|buruk|jelek|mengecewakan|mengganggu|terlambat|jarang|kurang\s+(jelas|baik|paham|memahami|aktif|sesuai|memadai|memuaskan|menarik|responsif|tepat|efektif|lengkap))\b/i,
    /\b(tidak|belum|gagal|enggan)\s+(hadir|aktif|jelas|sesuai|paham|memahami|mudah|baik|responsif|tepat\s+waktu|memadai|mendukung|membantu|berjalan|berfungsi|tersedia|lengkap|puas|nyaman|efektif|disampaikan|diberikan)\b/i,
    /\b(difficult|hard\s+to|problem|issue|obstacle|trouble|confusing|boring|poor|bad|late|absent|not\s+(clear|helpful|active|available|working))\b/i,
  ];

  // Order matters: check multi-word negative phrases before positive words.
  const OPTION_POLARITY_RULES = [
    {
      score: -2,
      re: /^(sangat\s+tidak\s+(setuju|puas|baik|sesuai|jelas|mudah|membantu|efektif|memuaskan|relevan)|sangat\s+(kurang|buruk|sulit|jarang|tidak)|buruk\s+sekali|amat\s+buruk|tidak\s+pernah\s+sama\s+sekali|strongly\s+disagree|very\s+poor|very\s+dissatisfied)\b/i,
    },
    {
      score: -1,
      re: /^(tidak|tidak\s+setuju|tidak\s+pernah|tidak\s+ada|tidak\s+sesuai|tidak\s+puas|tidak\s+memuaskan|tidak\s+jelas|tidak\s+mudah|tidak\s+baik|tidak\s+relevan|kurang|kurang\s+setuju|kurang\s+baik|kurang\s+puas|kurang\s+memuaskan|kurang\s+jelas|jarang|belum|salah|buruk|sulit|no|false|disagree|never|rarely|poor|dissatisfied)\b/i,
    },
    {
      score: 0,
      re: /^(netral|cukup|cukup\s+baik|cukup\s+setuju|cukup\s+puas|cukup\s+memuaskan|ragu|ragu-ragu|sedang|kadang|kadang-kadang|biasa\s+saja|neutral|sometimes|average|fair)\b/i,
    },
    {
      score: 2,
      re: /^(sangat\s+(setuju|baik|puas|jelas|mudah|membantu|sesuai|memuaskan|efektif|sering|bagus)|baik\s+sekali|amat\s+baik|istimewa|selalu|strongly\s+agree|very\s+good|very\s+satisfied|excellent|always)\b/i,
    },
    {
      score: 1,
      re: /^(ya|iya|benar|setuju|baik|bagus|puas|memuaskan|jelas|mudah|sesuai|sering|ada|pernah|memadai|membantu|efektif|tepat|lancar|relevan|yes|true|agree|good|satisfied|often)\b/i,
    },
  ];

  function normalizeText(str) {
    return String(str ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function stripQuestionPrefix(str) {
    return String(str ?? "")
      .trim()
      .replace(/^(?:no\.?\s*\d+|pertanyaan\s*\d+|\d+)\s*[.):\-]\s*/i, "")
      .trim();
  }

  function stripOptionPrefix(str) {
    const raw = String(str ?? "").trim();
    const stripped = raw
      .replace(/^\(?[a-e0-9]{1,2}\)?\s*[.):\-]\s+/i, "")
      .replace(/^\([a-e0-9]{1,2}\)\s*/i, "")
      .trim();
    return stripped || raw;
  }

  function isNegativeQuestion(questionText) {
    const clean = normalizeText(stripQuestionPrefix(questionText));
    if (!clean) return false;
    for (const re of DOUBLE_NEGATIVE_PATTERNS) {
      if (re.test(clean)) return false;
    }
    for (const re of NEGATIVE_QUESTION_PATTERNS) {
      if (re.test(clean)) return true;
    }
    return false;
  }

  function scoreOptionPolarity(labelText) {
    const clean = normalizeText(stripOptionPrefix(labelText));
    if (!clean) return null;
    for (const rule of OPTION_POLARITY_RULES) {
      if (rule.re.test(clean)) return rule.score;
    }
    return null;
  }

  /**
   * Only treats options as numeric scales when their visible labels themselves are numeric
   * (e.g., "1", "2", "3", "4", "5"), never falling back to synthetic indices or DB IDs in opt.value.
   */
  function pickNumericOption(options, isNegative) {
    const parsed = options.map((opt) => {
      const labelStr = String(opt?.label ?? "").trim();
      const match = labelStr.match(/^(\d+(?:\.\d+)?)$/);
      return {
        opt,
        num: match ? Number(match[1]) : NaN,
      };
    });

    if (!parsed.length || !parsed.every((p) => Number.isFinite(p.num))) return null;

    let chosen = parsed[0];
    for (let i = 1; i < parsed.length; i++) {
      if (isNegative ? parsed[i].num < chosen.num : parsed[i].num > chosen.num) {
        chosen = parsed[i];
      }
    }
    return chosen.opt;
  }

  function isYesLabel(label) {
    return /^(ya|iya|yes)$/i.test(normalizeText(stripOptionPrefix(label)));
  }

  function isNoLabel(label) {
    return /^(tidak|no)$/i.test(normalizeText(stripOptionPrefix(label)));
  }

  function isYesNoOptions(options) {
    if (!Array.isArray(options) || options.length !== 2) return false;
    const hasYes = options.some((o) => isYesLabel(o?.label));
    const hasNo = options.some((o) => isNoLabel(o?.label));
    if (hasYes && hasNo) return true;
    const vals = options.map((o) => String(o?.value ?? "").trim());
    return hasYes && vals.includes("1") && (vals.includes("0") || vals.includes("2"));
  }

  function findYesOption(options) {
    if (!Array.isArray(options) || !options.length) return null;
    return (
      options.find((o) => isYesLabel(o?.label)) ||
      options.find((o) => String(o?.value ?? "").trim() === "1") ||
      options[0]
    );
  }

  function findNoOption(options) {
    if (!Array.isArray(options) || !options.length) return null;
    return (
      options.find((o) => isNoLabel(o?.label)) ||
      options.find((o) => {
        const v = String(o?.value ?? "").trim();
        return v === "0" || v === "2";
      }) ||
      options[options.length - 1]
    );
  }

  function chooseHeuristicAnswer(questionItem, opts = {}) {
    const index = questionItem?.index ?? 0;
    const question = questionItem?.question ?? "";
    const options = Array.isArray(questionItem?.options) ? questionItem.options : [];
    if (!options.length) return null;

    const isNegative = isNegativeQuestion(question);
    const preferYes = opts.preferYes !== false;

    if (isYesNoOptions(options)) {
      if (isNegative) {
        const noOpt = findNoOption(options);
        if (noOpt) {
          return {
            index,
            value: String(noOpt.value),
            label: noOpt.label,
            confidence: "high",
            source: "heuristic",
            reason: 'Pertanyaan negatif/kendala -> pilih "Tidak"',
          };
        }
      } else if (preferYes) {
        const yesOpt = findYesOption(options);
        if (yesOpt) {
          return {
            index,
            value: String(yesOpt.value),
            label: yesOpt.label,
            confidence: "high",
            source: "default-ya",
            reason: 'Default pilih "Ya"',
          };
        }
      }
    }

    const scores = options.map((opt) => scoreOptionPolarity(opt.label));
    const scoredCount = scores.filter((s) => s !== null).length;

    if (scoredCount >= 2 || (scoredCount >= 1 && options.length <= 2)) {
      let bestIdx = -1;
      for (let i = 0; i < options.length; i++) {
        if (scores[i] === null) continue;
        if (bestIdx === -1) {
          bestIdx = i;
          continue;
        }
        if (isNegative ? scores[i] < scores[bestIdx] : scores[i] > scores[bestIdx]) {
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        const best = options[bestIdx];
        return {
          index,
          value: String(best.value),
          label: best.label,
          confidence: "high",
          source: "heuristic",
          reason: isNegative
            ? "Pertanyaan negatif/kendala -> pilih jawaban negatif/aman"
            : "Pertanyaan positif -> pilih jawaban positif terbaik",
        };
      }
    }

    const numericBest = pickNumericOption(options, isNegative);
    if (numericBest) {
      return {
        index,
        value: String(numericBest.value),
        label: numericBest.label,
        confidence: "medium",
        source: "heuristic",
        reason: isNegative
          ? "Skala numerik pada pertanyaan negatif -> pilih nilai minimum"
          : "Skala numerik pada pertanyaan positif -> pilih nilai maksimum",
      };
    }

    return {
      index,
      value: String(options[0].value),
      label: options[0].label,
      confidence: "low",
      source: "heuristic-fallback",
      reason: "Opsi non-evaluasi (butuh AI untuk akurasi maksimal)",
    };
  }

  function buildAiPrompt(questions) {
    const lines = [
      "Kamu adalah asisten pengisian kuesioner akademik dan evaluasi pembelajaran di MENTARI UNPAM.",
      "Tugasmu memilih 1 jawaban PALING BENAR untuk setiap pertanyaan berikut:",
      "1. Jika pertanyaan bersifat pemahaman/materi/faktual, pilih jawaban yang benar secara faktual.",
      "2. Jika pertanyaan bersifat evaluasi pembelajaran/dosen/platform, pilih jawaban yang paling tepat dan positif.",
      "3. PERHATIAN KHUSUS untuk pertanyaan bernada negatif/kendala (contoh: 'Apakah ada kendala?', 'Apakah materi sulit dipahami?', 'Apakah dosen tidak aktif?'): jawaban yang tepat adalah 'Tidak' / 'Tidak Pernah' / 'Sangat Tidak Setuju', BUKAN 'Ya'.",
      'Balas HANYA dengan JSON array valid tanpa teks tambahan: [{"index":0,"value":"EXACT_OPTION_VALUE","reason":"singkat"}]',
      "",
    ];

    for (const q of questions) {
      lines.push(`Pertanyaan ${q.index}: ${stripQuestionPrefix(q.question) || "(Tanpa teks)"}`);
      const opts = (q.options || [])
        .map((o, i) => `  ${i + 1}. value="${o.value}" | label="${o.label}"`)
        .join("\n");
      lines.push(opts);
      lines.push("");
    }

    return lines.join("\n");
  }

  function extractJsonCandidates(rawContent) {
    return protocol ? protocol.extractJsonCandidates(rawContent) : [];
  }

  function matchOptionForQuestion(item, question) {
    const options = question?.options || [];
    if (!options.length || !item) return null;

    if (item.value !== undefined && item.value !== null) {
      const targetVal = String(item.value);
      const exactVal = options.find((o) => String(o.value) === targetVal);
      if (exactVal) return exactVal;
    }

    const labelNeedle = normalizeText(item.label ?? item.answer ?? item.value ?? "");
    if (labelNeedle) {
      const byLabel = options.find((o) => normalizeText(o.label) === labelNeedle);
      if (byLabel) return byLabel;
      const byStripped = options.find(
        (o) => normalizeText(stripOptionPrefix(o.label)) === normalizeText(stripOptionPrefix(labelNeedle))
      );
      if (byStripped) return byStripped;
    }

    const optIdx = Number(item.option_index);
    if (Number.isInteger(optIdx) && optIdx >= 1) {
      const oneBased = options[optIdx - 1];
      if (oneBased) return oneBased;
    }

    return null;
  }

  function parseQuestionIndex(rawIndex) {
    if (typeof rawIndex === "number" && Number.isInteger(rawIndex)) return rawIndex;
    if (typeof rawIndex === "string" && /^\d+$/.test(rawIndex.trim())) {
      return Number(rawIndex.trim());
    }
    return NaN;
  }

  function parseAiResponse(rawContent, questions) {
    const hasObjectItem = (arr) => Array.isArray(arr) && arr.some((it) => it && typeof it === "object");
    let parsedArray = null;
    for (const candidate of extractJsonCandidates(rawContent)) {
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

    const resultMap = new Map();
    if (!parsedArray) return resultMap;

    const qByIndex = new Map((questions || []).map((q) => [q.index, q]));
    for (const item of parsedArray) {
      if (!item || typeof item !== "object") continue;
      const qIdx = parseQuestionIndex(item.index);
      if (!Number.isInteger(qIdx)) continue;
      const question = qByIndex.get(qIdx);
      if (!question) continue;
      const matched = matchOptionForQuestion(item, question);
      if (!matched) continue;

      resultMap.set(qIdx, {
        index: qIdx,
        value: String(matched.value),
        label: matched.label,
        confidence: "high",
        source: "ai",
        reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : "Dipilih oleh AI",
      });
    }

    return resultMap;
  }

  function readRouteConfigFromStorage(storage) {
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
        apiKey = rawKey;
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

  async function resolveRouteConfig(opts) {
    if (opts.routeConfig) return opts.routeConfig;
    const aiClient = getAiClient();
    if (aiClient?.getConfig && (!opts.storage || (aiClient.hasExtensionRuntime?.() && !opts.fetchImpl))) {
      return aiClient.getConfig();
    }
    if (opts.storage) {
      const fromStorage = readRouteConfigFromStorage(opts.storage);
      if (fromStorage?.apiKey) return fromStorage;
    }
    if (aiClient?.getConfig) {
      return aiClient.getConfig();
    }
    return { hasApiKey: false, apiKey: null, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL };
  }

  async function solveQuestions(questions, opts = {}) {
    const list = Array.isArray(questions) ? questions : [];
    const preferYes = opts.preferYes !== false;
    const heuristics = list.map((q) => chooseHeuristicAnswer(q, { preferYes }));

    if (!list.length) {
      return { answers: [], mode: "heuristic", aiError: null };
    }

    const allDefaultYa = heuristics.every((a) => a?.source === "default-ya");
    const allHighConfidence = heuristics.every((a) => a?.confidence === "high");

    // Only skip AI when caller explicitly opts into skipAiWhenConfident or disables AI
    if (opts.useAi === false || (opts.skipAiWhenConfident && !opts.forceAi && allHighConfidence)) {
      return {
        answers: heuristics,
        mode: allDefaultYa ? "default-ya" : "heuristic",
        aiError: null,
      };
    }

    const routeConfig = await resolveRouteConfig(opts);
    if (!routeConfig?.hasApiKey && !routeConfig?.apiKey) {
      return {
        answers: heuristics,
        mode: allDefaultYa ? "default-ya" : "heuristic",
        aiError: null,
      };
    }

    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 20000;
    const promptText = buildAiPrompt(list);

    try {
      const aiClient = getAiClient();
      if (!aiClient?.chatCompletion) {
        return {
          answers: heuristics,
          mode: allDefaultYa ? "default-ya" : "heuristic",
          aiError: null,
        };
      }

      const useDirect = typeof opts.fetchImpl === "function" || !aiClient.hasExtensionRuntime?.();
      const res = await aiClient.chatCompletion({
        ...(useDirect ? { baseUrl: routeConfig.baseUrl, apiKey: routeConfig.apiKey } : {}),
        model: routeConfig.model,
        messages: [{ role: "user", content: promptText }],
        temperature: 0.1,
        maxTokens: 2500,
        timeoutMs,
        signal: opts.signal,
        fetchImpl: opts.fetchImpl,
      });
      if (!res.ok) {
        throw new Error(res.error || `AI HTTP ${res.status}`);
      }
      const rawContent = res.content;

      const aiMap = parseAiResponse(rawContent, list);
      if (aiMap.size === 0) {
        return {
          answers: heuristics,
          mode: allDefaultYa ? "default-ya" : "heuristic",
          aiError: "Respons AI tidak valid",
        };
      }

      let aiCount = 0;
      const merged = list.map((q, idx) => {
        const aiAns = aiMap.get(q.index);
        if (aiAns) {
          aiCount++;
          return aiAns;
        }
        return heuristics[idx];
      });

      return {
        answers: merged,
        mode: aiCount === list.length ? "ai" : "ai-partial",
        aiError: null,
      };
    } catch (err) {
      return {
        answers: heuristics,
        mode: allDefaultYa ? "default-ya" : "heuristic",
        aiError: err?.name === "AbortError" ? "AI timeout" : (err?.message || "Gagal menghubungi AI"),
      };
    }
  }

  const MentariKuisionerSolver = {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    normalizeText,
    stripQuestionPrefix,
    stripOptionPrefix,
    isNegativeQuestion,
    scoreOptionPolarity,
    isYesNoOptions,
    findYesOption,
    findNoOption,
    chooseHeuristicAnswer,
    buildAiPrompt,
    parseAiResponse,
    readRouteConfigFromStorage,
    solveQuestions,
  };

  root.MentariKuisionerSolver = MentariKuisionerSolver;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MentariKuisionerSolver;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
