(() => {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  if (root.MentariAiClient && typeof root.MentariAiClient.chatCompletion === "function") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = root.MentariAiClient;
    }
    return;
  }

  const protocol =
    root.MentariAiProtocol ||
    (typeof require === "function" ? require("../shared/aiProtocol.js") : null);

  if (!protocol) {
    throw new Error("MentariAiProtocol harus dimuat sebelum MentariAiClient.");
  }

  const {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    CONFIG_STORAGE_KEY,
    PROVIDERS,
    KNOWN_PROVIDER_BASES,
    isLoopbackHost,
    normalizeBaseUrl,
    isValidBaseUrl,
    getProvider,
    detectProviderId,
    escapeHtml,
    parseHtmlSafely,
    readPartText,
    parseJsonObjects,
    extractPayloadError,
    extractFinishReason,
    extractChatContent,
    extractJsonCandidates,
    errorDetail,
    isGeminiThinkingModel,
    parseRetryAfterMs,
    isMaxCompletionTokensError,
  } = protocol;

  const LEGACY_STORAGE_KEYS = {
    apiKey: "routeApiKey",
    baseUrl: "routeBaseUrl",
    model: "routeModel",
    provider: "routeProvider",
  };

  let cachedConfig = {
    hasApiKey: false,
    apiKey: null,
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    provider: "route",
    loaded: false,
  };

  let initPromise = null;
  let reqCounter = 0;
  const configListeners = new Set();
  const noReasoningEffortEndpoints = new Set();
  const maxCompletionTokensEndpoints = new Set();

  function rememberEndpointCapability(cache, key) {
    if (!key) return;
    if (cache.size >= 64 && !cache.has(key)) {
      cache.delete(cache.values().next().value);
    }
    cache.add(key);
  }

  function onConfigChange(listener) {
    if (typeof listener !== "function") return () => {};
    configListeners.add(listener);
    return () => {
      configListeners.delete(listener);
    };
  }

  function notifyConfigListeners(cfg) {
    const publicSnapshot = {
      hasApiKey: Boolean(cfg?.hasApiKey || cfg?.apiKey),
      baseUrl: cfg?.baseUrl || DEFAULT_BASE_URL,
      model: cfg?.model || DEFAULT_MODEL,
      provider: cfg?.provider || "route",
    };
    for (const fn of [...configListeners]) {
      try {
        fn(publicSnapshot);
      } catch {
        // Ignore listener errors
      }
    }
  }

  function decodeLegacyApiKey(encoded) {
    if (!encoded) return null;
    try {
      if (typeof atob === "function") {
        const bin = atob(encoded);
        try {
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          return new TextDecoder().decode(bytes).trim() || null;
        } catch {
          return bin.trim() || null;
        }
      }
    } catch {
      // Might already be plain text
      return String(encoded).trim() || null;
    }
    return null;
  }

  function readLegacyLocalStorageConfig() {
    if (typeof localStorage === "undefined") return null;
    try {
      const rawKey = localStorage.getItem(LEGACY_STORAGE_KEYS.apiKey);
      const apiKey = decodeLegacyApiKey(rawKey);
      const rawBase = localStorage.getItem(LEGACY_STORAGE_KEYS.baseUrl);
      const rawModel = localStorage.getItem(LEGACY_STORAGE_KEYS.model);
      const rawProvider = localStorage.getItem(LEGACY_STORAGE_KEYS.provider);
      if (!apiKey && !rawBase && !rawModel) return null;
      const baseUrl = normalizeBaseUrl(rawBase);
      return {
        apiKey: apiKey || null,
        baseUrl: isValidBaseUrl(baseUrl) ? baseUrl : DEFAULT_BASE_URL,
        model: String(rawModel || "").trim() || DEFAULT_MODEL,
        provider: rawProvider || detectProviderId(baseUrl),
      };
    } catch {
      return null;
    }
  }

  function clearLegacyLocalStorageKeys() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEYS.apiKey);
      localStorage.removeItem(LEGACY_STORAGE_KEYS.baseUrl);
      localStorage.removeItem(LEGACY_STORAGE_KEYS.model);
      localStorage.removeItem(LEGACY_STORAGE_KEYS.provider);
    } catch {
      // Ignore storage access errors
    }
  }

  function hasExtensionRuntime() {
    return (
      typeof chrome !== "undefined" &&
      Boolean(chrome?.runtime?.id) &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function sendRuntimeOnce(message) {
    return new Promise((resolve, reject) => {
      if (!hasExtensionRuntime()) {
        reject(new Error("Chrome extension runtime tidak tersedia."));
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            reject(new Error(lastErr.message || "Gagal berkomunikasi dengan service worker."));
            return;
          }
          resolve(response);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function sendRuntimeMessage(message) {
    try {
      return await sendRuntimeOnce(message);
    } catch (err) {
      const msg = String(err?.message || "");
      const canRetryColdStart =
        message?.type !== "mentari:ai-abort" &&
        (/receiving end does not exist|could not establish connection/i.test(msg) ||
          (message?.type !== "mentari:ai-chat" && /message port closed/i.test(msg)));
      if (!canRetryColdStart) throw err;
      if (typeof setTimeout === "function") {
        await new Promise((r) => setTimeout(r, 120));
      }
      return sendRuntimeOnce(message);
    }
  }

  function sanitizeConfig(cfg) {
    const baseUrlRaw = normalizeBaseUrl(cfg?.baseUrl);
    const baseUrl = isValidBaseUrl(baseUrlRaw) ? baseUrlRaw : DEFAULT_BASE_URL;
    const model = String(cfg?.model || "").trim() || DEFAULT_MODEL;
    const apiKey = cfg?.apiKey ? String(cfg.apiKey).trim() : null;
    const hasApiKey = Boolean(cfg?.hasApiKey || apiKey);
    const provider = cfg?.provider || detectProviderId(baseUrl);
    return { hasApiKey, apiKey, baseUrl, model, provider, loaded: true };
  }

  function updateCachedConfig(nextCfg) {
    cachedConfig = sanitizeConfig(nextCfg);
    return getCachedConfigSync();
  }

  function getCachedConfigSync() {
    return {
      hasApiKey: Boolean(cachedConfig.hasApiKey || cachedConfig.apiKey),
      apiKey: cachedConfig.apiKey,
      baseUrl: cachedConfig.baseUrl,
      model: cachedConfig.model,
      provider: cachedConfig.provider,
      loaded: cachedConfig.loaded,
    };
  }

  async function loadConfigFromRuntime() {
    if (hasExtensionRuntime()) {
      try {
        const res = await sendRuntimeMessage({ type: "mentari:ai-get-config" });
        if (res?.ok && res.config) {
          if (res.config.hasApiKey || res.config.apiKey) {
            clearLegacyLocalStorageKeys();
            return updateCachedConfig(res.config);
          }
          // One-time migration only for trusted built-in provider baseUrls (prevents MAIN-world endpoint hijack)
          const legacy = readLegacyLocalStorageConfig();
          if (legacy?.apiKey && KNOWN_PROVIDER_BASES.has(legacy.baseUrl)) {
            const migRes = await sendRuntimeMessage({
              type: "mentari:ai-migrate-legacy",
              config: legacy,
            });
            clearLegacyLocalStorageKeys();
            if (migRes?.ok && migRes.config) {
              const updated = updateCachedConfig(migRes.config);
              notifyConfigListeners(updated);
              return updated;
            }
          }
          return updateCachedConfig(res.config);
        }
      } catch {
        // Fallback to cached non-secret state if SW is transiently unavailable
      }
      return updateCachedConfig(cachedConfig);
    }

    // Non-extension environment (e.g., Node unit tests)
    const legacy = readLegacyLocalStorageConfig();
    if (legacy) return updateCachedConfig(legacy);
    return updateCachedConfig(cachedConfig);
  }

  async function getConfig({ forceRefresh = false } = {}) {
    if (!forceRefresh && initPromise) {
      return initPromise;
    }
    if (!forceRefresh && cachedConfig.loaded) {
      return getCachedConfigSync();
    }

    const task = loadConfigFromRuntime().finally(() => {
      if (initPromise === task) {
        initPromise = null;
      }
    });
    initPromise = task;
    return task;
  }

  async function saveConfig({ apiKey, baseUrl, model, provider }) {
    const normBase = normalizeBaseUrl(baseUrl);
    if (!isValidBaseUrl(normBase)) {
      throw new Error("Base URL tidak valid.");
    }
    const cleanKey = String(apiKey || "").trim();
    if (!cleanKey) {
      throw new Error("API key tidak boleh kosong.");
    }
    const cleanModel = String(model || "").trim() || DEFAULT_MODEL;
    const cleanProvider = provider || detectProviderId(normBase);
    const next = {
      apiKey: cleanKey,
      baseUrl: normBase,
      model: cleanModel,
      provider: cleanProvider,
    };

    if (hasExtensionRuntime()) {
      const res = await sendRuntimeMessage({
        type: "mentari:ai-set-config",
        config: next,
      });
      if (!res?.ok) {
        throw new Error(res?.error || "Gagal menyimpan konfigurasi API.");
      }
    }

    clearLegacyLocalStorageKeys();
    const updated = updateCachedConfig(next);
    notifyConfigListeners(updated);
    return updated;
  }

  async function openSettings() {
    if (!hasExtensionRuntime()) {
      throw new Error("Runtime ekstensi tidak tersedia.");
    }
    const res = await sendRuntimeMessage({ type: "mentari:open-options" });
    if (res && res.ok === false) {
      throw new Error(res.error || "Gagal membuka halaman pengaturan API.");
    }
    return true;
  }

  async function verifyConfig({ apiKey, baseUrl, provider }) {
    const cleanKey = String(apiKey || "").trim();
    const normBase = normalizeBaseUrl(baseUrl);
    if (!cleanKey) {
      return { valid: false, message: "API key tidak boleh kosong." };
    }
    if (!isValidBaseUrl(normBase)) {
      return { valid: false, message: "Base URL tidak valid." };
    }

    if (hasExtensionRuntime()) {
      try {
        const res = await sendRuntimeMessage({
          type: "mentari:ai-verify",
          payload: {
            apiKey: cleanKey,
            baseUrl: normBase,
            provider: provider || detectProviderId(normBase),
          },
        });
        if (res && typeof res.valid === "boolean") {
          return res;
        }
        return { valid: false, message: res?.error || "Gagal memverifikasi API key." };
      } catch (err) {
        return {
          valid: false,
          message: err?.message || "Gagal menghubungi service worker untuk verifikasi.",
        };
      }
    }

    return { valid: false, message: "Runtime ekstensi tidak tersedia untuk verifikasi." };
  }

  async function directChatCompletion({
    baseUrl,
    apiKey,
    model,
    messages,
    temperature = 0,
    maxTokens = 400,
    topP,
    timeoutMs = 35000,
    signal,
    fetchImpl,
  }) {
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) {
      return { ok: false, status: 0, content: "", finishReason: "", raw: "", error: "fetch tidak tersedia", retryable: false };
    }

    const normBase = normalizeBaseUrl(baseUrl);
    if (!isValidBaseUrl(normBase)) {
      return { ok: false, status: 0, content: "", finishReason: "", raw: "", error: "Base URL tidak valid", retryable: false };
    }
    if (!apiKey) {
      return { ok: false, status: 401, content: "", finishReason: "", raw: "", error: "API key belum dikonfigurasi", retryable: false };
    }

    const runOnce = async ({ withReasoningEffort, useMaxCompletionTokens, omitTemperature }) => {
      const controller = new AbortController();
      let timedOut = false;
      const onExternalAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }
        signal.addEventListener("abort", onExternalAbort, { once: true });
      }
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const body = {
          model: model || DEFAULT_MODEL,
          messages,
        };
        if (!omitTemperature) {
          body.temperature = temperature;
        }
        if (useMaxCompletionTokens) {
          body.max_completion_tokens = maxTokens;
        } else {
          body.max_tokens = maxTokens;
        }
        if (typeof topP === "number" && Number.isFinite(topP)) {
          body.top_p = topP;
        }
        if (withReasoningEffort) {
          body.reasoning_effort = "low";
        }

        const res = await doFetch(`${normBase}/chat/completions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const raw = await res.text();
        const retryAfterMs = parseRetryAfterMs(res.headers?.get?.("retry-after"));
        return {
          ok: res.ok,
          status: res.status,
          raw,
          ...(retryAfterMs != null ? { retryAfterMs } : {}),
        };
      } catch (err) {
        if (timedOut) {
          return { ok: false, status: 408, raw: "", error: `Timeout setelah ${Math.round(timeoutMs / 1000)} detik`, retryable: true };
        }
        if (err?.name === "AbortError" || signal?.aborted) {
          const abortErr = new Error("Aborted");
          abortErr.name = "AbortError";
          throw abortErr;
        }
        return {
          ok: false,
          status: 0,
          raw: "",
          error: err?.message || "Gagal menghubungi server AI",
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onExternalAbort);
      }
    };

    const resolvedModel = model || DEFAULT_MODEL;
    const endpointKey = `${normBase}\0${resolvedModel}`;
    const wantReasoningEffort = isGeminiThinkingModel(resolvedModel, normBase) && !noReasoningEffortEndpoints.has(endpointKey);
    const wantMaxCompTokens = maxCompletionTokensEndpoints.has(endpointKey);
    let attempt = await runOnce({
      withReasoningEffort: wantReasoningEffort,
      useMaxCompletionTokens: wantMaxCompTokens,
      omitTemperature: false,
    });
    if (!attempt.ok && (attempt.status === 400 || attempt.status === 422)) {
      const needsMaxComp = !wantMaxCompTokens && isMaxCompletionTokensError(attempt.raw);
      const omitTemp = needsMaxComp && /temperature/i.test(String(attempt.raw || ""));
      if (wantReasoningEffort || needsMaxComp) {
        attempt = await runOnce({
          withReasoningEffort: false,
          useMaxCompletionTokens: wantMaxCompTokens || needsMaxComp,
          omitTemperature: omitTemp,
        });
        if (attempt.ok) {
          if (wantReasoningEffort) rememberEndpointCapability(noReasoningEffortEndpoints, endpointKey);
          if (needsMaxComp) rememberEndpointCapability(maxCompletionTokensEndpoints, endpointKey);
        }
      }
    }
    if (!attempt.ok) {
      const status = attempt.status || 0;
      const retryable =
        attempt.retryable !== undefined
          ? attempt.retryable
          : status === 0 || status === 408 || status === 429 || status >= 500;
      return {
        ok: false,
        status,
        content: "",
        finishReason: "",
        raw: attempt.raw || "",
        error: attempt.error || errorDetail(status, attempt.raw),
        retryable,
        ...(attempt.retryAfterMs != null ? { retryAfterMs: attempt.retryAfterMs } : {}),
      };
    }

    const objects = parseJsonObjects(attempt.raw);
    const finishReason = extractFinishReason(objects);
    const payloadErr = extractPayloadError(objects);
    if (payloadErr) {
      return {
        ok: false,
        status: attempt.status,
        content: "",
        finishReason,
        raw: attempt.raw,
        error: payloadErr,
        retryable: false,
      };
    }

    const content = extractChatContent(objects) || "";
    if (!content.trim()) {
      const isFiltered = /content_filter|safety/i.test(String(finishReason || ""));
      return {
        ok: false,
        status: attempt.status,
        content: "",
        finishReason,
        raw: attempt.raw,
        error: isFiltered
          ? "Jawaban diblokir oleh filter keamanan AI."
          : "Respons AI kosong atau tidak memiliki teks jawaban.",
        retryable: !isFiltered,
      };
    }
    return { ok: true, status: attempt.status, content, finishReason, raw: attempt.raw, error: null, retryable: false };
  }

  async function chatCompletion(options = {}) {
    const {
      config,
      baseUrl: rawBaseUrl,
      apiKey: rawApiKey,
      model: rawModel,
      messages,
      temperature = 0,
      maxTokens = 400,
      topP,
      timeoutMs = 35000,
      signal,
      fetchImpl,
    } = options;
    const baseUrl = rawBaseUrl || config?.baseUrl;
    const apiKey = rawApiKey || config?.apiKey;
    const model = rawModel || config?.model;

    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, status: 400, content: "", finishReason: "", raw: "", error: "Messages kosong.", retryable: false };
    }

    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    // Use direct path when a custom fetchImpl is injected (tests) or outside extension runtime
    if (typeof fetchImpl === "function" || !hasExtensionRuntime()) {
      const cfg = apiKey ? { apiKey, baseUrl: baseUrl || cachedConfig.baseUrl, model: model || cachedConfig.model } : await getConfig();
      return directChatCompletion({
        baseUrl: baseUrl || cfg.baseUrl,
        apiKey: apiKey || cfg.apiKey,
        model: model || cfg.model,
        messages,
        temperature,
        maxTokens,
        topP,
        timeoutMs,
        signal,
        fetchImpl,
      });
    }

    // Ensure migration/config is warm before sending via SW
    if (!cachedConfig.loaded) {
      await getConfig();
    }

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${++reqCounter}`;
    let aborted = false;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        aborted = true;
        sendRuntimeMessage({ type: "mentari:ai-abort", requestId }).catch(() => {});
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      sendRuntimeMessage({
        type: "mentari:ai-chat",
        requestId,
        payload: {
          model: model || undefined,
          messages,
          temperature,
          maxTokens,
          topP: typeof topP === "number" && Number.isFinite(topP) ? topP : undefined,
          timeoutMs,
        },
      })
        .then((res) => {
          if (signal) signal.removeEventListener("abort", onAbort);
          if (aborted) return;
          if (!res || typeof res !== "object") {
            resolve({
              ok: false,
              status: 0,
              content: "",
              finishReason: "",
              raw: "",
              error: "Respons tidak valid dari service worker.",
              retryable: true,
            });
            return;
          }
          if (res.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
            return;
          }
          if (!res.ok) {
            let finishReason = String(res.finishReason || "");
            if (!finishReason && res.status === 200 && res.raw) {
              finishReason = extractFinishReason(parseJsonObjects(res.raw));
            }
            resolve({
              ok: false,
              status: Number(res.status) || 0,
              content: "",
              finishReason,
              raw: res.raw || "",
              error: res.error || errorDetail(res.status || 0, res.raw),
              retryable: Boolean(res.retryable),
              ...(res.retryAfterMs != null ? { retryAfterMs: res.retryAfterMs } : {}),
              needsPermission: Boolean(res.needsPermission),
              originPattern: res.originPattern || undefined,
            });
            return;
          }
          let content = typeof res.content === "string" ? res.content : "";
          let finishReason = String(res.finishReason || "");
          if ((!content.trim() || !finishReason) && res.raw) {
            const parsedObjs = parseJsonObjects(res.raw);
            if (!finishReason) finishReason = extractFinishReason(parsedObjs);
            if (!content.trim()) content = extractChatContent(parsedObjs);
          }
          if (!content.trim()) {
            const isFiltered = /content_filter|safety/i.test(String(finishReason || ""));
            resolve({
              ok: false,
              status: res.status || 200,
              content: "",
              finishReason,
              raw: res.raw || "",
              error: isFiltered ? "Jawaban diblokir oleh filter keamanan AI." : "Respons AI kosong.",
              retryable: !isFiltered,
            });
            return;
          }
          resolve({
            ok: true,
            status: res.status || 200,
            content,
            finishReason,
            raw: res.raw || "",
            error: null,
            retryable: false,
          });
        })
        .catch((err) => {
          if (signal) signal.removeEventListener("abort", onAbort);
          if (aborted) return;
          resolve({
            ok: false,
            status: 0,
            content: "",
            finishReason: "",
            raw: "",
            error: err?.message || "Gagal berkomunikasi dengan service worker.",
            retryable: true,
          });
        });
    });
  }

  // Keep in-memory cache synchronized across tabs/origins (mentari.unpam.ac.id & my.unpam.ac.id)
  if (typeof chrome !== "undefined" && chrome?.storage?.onChanged?.addListener) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes?.[CONFIG_STORAGE_KEY]) return;
        const nextVal = changes[CONFIG_STORAGE_KEY].newValue || {};
        const updated = updateCachedConfig({
          baseUrl: nextVal.baseUrl,
          model: nextVal.model,
          provider: nextVal.provider,
          hasApiKey: Boolean(nextVal.hasApiKey || nextVal.apiKey),
          apiKey: null,
        });
        notifyConfigListeners(updated);
      });
    } catch {
      // Ignore
    }
  }

  // Warm cache & trigger automatic legacy migration in browser context
  if (typeof window !== "undefined" && hasExtensionRuntime()) {
    getConfig({ forceRefresh: true }).catch(() => {});
  }

  const api = {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    PROVIDERS,
    KNOWN_PROVIDER_BASES,
    CONFIG_STORAGE_KEY,
    isLoopbackHost,
    normalizeBaseUrl,
    isValidBaseUrl,
    getProvider,
    detectProviderId,
    escapeHtml,
    parseHtmlSafely,
    readPartText,
    parseJsonObjects,
    extractPayloadError,
    extractFinishReason,
    extractChatContent,
    extractJsonCandidates,
    errorDetail,
    hasExtensionRuntime,
    getConfig,
    getCachedConfigSync,
    saveConfig,
    verifyConfig,
    openSettings,
    onConfigChange,
    chatCompletion,
  };

  root.MentariAiClient = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
