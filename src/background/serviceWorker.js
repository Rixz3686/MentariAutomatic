(() => {
  "use strict";

  if (typeof importScripts === "function" && !globalThis.MentariAiProtocol) {
    importScripts("../shared/aiProtocol.js");
  }

  const protocol =
    globalThis.MentariAiProtocol ||
    (typeof require === "function" ? require("../shared/aiProtocol.js") : null);

  if (!protocol) {
    throw new Error("MentariAiProtocol gagal dimuat di Service Worker.");
  }

  const {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    CONFIG_STORAGE_KEY,
    PENDING_PERM_STORAGE_KEY,
    KNOWN_PROVIDER_BASES,
    KUESIONER_PATH_RE,
    MY_UNPAM_SURVEY_RE,
    normalizeBaseUrl,
    isValidBaseUrl,
    getOriginPattern,
    isLoginPath,
    getRouteString,
    parseJsonObjects,
    extractPayloadError,
    extractFinishReason,
    extractChatContent,
    errorDetail,
    isGeminiThinkingModel,
    parseRetryAfterMs,
    isMaxCompletionTokensError,
    extractModelIds,
  } = protocol;

  const MENTARI_ACTIVE_SCRIPTS = [
    "src/content/theme.js",
    "src/content/mentariFetchGuard.js",
    "src/shared/aiProtocol.js",
    "src/content/aiClient.js",
    "src/content/apiKeyManager.js",
    "src/content/token.js",
    "src/content/content.js",
    "src/content/kuisionerSolver.js",
    "src/content/kuisioner.js",
    "src/content/quizSolver.js",
    "src/content/quiz.js",
  ];

  const MY_UNPAM_ACTIVE_SCRIPTS = [
    "src/content/theme.js",
    "src/shared/aiProtocol.js",
    "src/content/aiClient.js",
    "src/content/presensi.js",
    "src/content/kuisionerSolver.js",
    "src/content/QuickSurvey.js",
  ];

  const FORUM_TOPIC_RE = /^\/u-courses\/[^/]+\/forum\/[^/]+\/topics\/[^/]+/i;
  const OPTIONS_PATHS = ["src/options/options.html"];
  const POPUP_PATHS = ["src/popup/popup.html"];
  const EXT_UI_PATHS = ["src/options/options.html", "src/popup/popup.html"];

  const activeAiRequests = new Map();
  const pendingInjections = new Map();
  const pendingTabInjections = new Set();
  const noReasoningEffortEndpoints = new Set();
  const maxCompletionTokensEndpoints = new Set();

  function rememberEndpointCapability(cache, key) {
    if (!key) return;
    if (cache.size >= 64 && !cache.has(key)) {
      cache.delete(cache.values().next().value);
    }
    cache.add(key);
  }

  function parseUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      return new URL(rawUrl);
    } catch {
      return null;
    }
  }

  function isMentariActiveUrl(url) {
    const parsed = parseUrl(url);
    return parsed?.protocol === "https:" && parsed?.hostname === "mentari.unpam.ac.id" && !isLoginPath(parsed.pathname);
  }

  function isMyUnpamUrl(url) {
    const parsed = parseUrl(url);
    return parsed?.protocol === "https:" && parsed?.hostname === "my.unpam.ac.id" && !isLoginPath(parsed.pathname);
  }

  function isAllowedContentSender(sender) {
    if (!sender?.tab) return false;
    if (typeof sender.frameId === "number" && sender.frameId !== 0) return false;
    const senderUrl = sender.url || sender.tab.url || "";
    if (!senderUrl) return false;
    return isMentariActiveUrl(senderUrl) || isMyUnpamUrl(senderUrl);
  }

  function isExtensionPageSender(sender, allowedPaths) {
    if (!chrome?.runtime?.id || sender?.id !== chrome.runtime.id) return false;
    if (sender?.tab && typeof sender.frameId === "number" && sender.frameId !== 0) return false;
    const rawUrl = sender?.url || sender?.tab?.url || "";
    if (!rawUrl) {
      return !sender?.tab && typeof chrome?.runtime?.getURL !== "function";
    }
    const parsedSender = parseUrl(rawUrl);
    if (!parsedSender) return false;
    return allowedPaths.some((relPath) => {
      const targetRaw =
        typeof chrome?.runtime?.getURL === "function"
          ? chrome.runtime.getURL(relPath)
          : `chrome-extension://${chrome.runtime.id}/${relPath}`;
      const targetUrl = parseUrl(targetRaw);
      return Boolean(
        targetUrl &&
        parsedSender.origin === targetUrl.origin &&
        parsedSender.pathname === targetUrl.pathname
      );
    });
  }

  function toPublicConfig(cfg) {
    return {
      hasApiKey: Boolean(cfg?.apiKey),
      apiKey: null,
      baseUrl: cfg?.baseUrl || DEFAULT_BASE_URL,
      model: cfg?.model || DEFAULT_MODEL,
      provider: cfg?.provider || "route",
    };
  }

  async function migrateLegacyConfig(cfg) {
    if (!cfg || typeof cfg !== "object") {
      return readStoredConfig();
    }
    const existing = await readStoredConfig();
    if (existing.apiKey) {
      return existing;
    }
    const baseUrl = normalizeBaseUrl(cfg.baseUrl);
    const apiKey = String(cfg.apiKey || "").trim();
    if (!apiKey || !KNOWN_PROVIDER_BASES.has(baseUrl)) {
      return existing;
    }
    return writeStoredConfig({
      apiKey,
      baseUrl,
      model: cfg.model,
      provider: cfg.provider,
    });
  }

  async function openExtensionOptions() {
    if (chrome?.runtime?.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
      return;
    }
    if (chrome?.tabs?.create && chrome?.runtime?.getURL) {
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
      return;
    }
    throw new Error("Halaman pengaturan ekstensi tidak tersedia.");
  }

  async function hasOriginPermission(baseUrl) {
    const norm = normalizeBaseUrl(baseUrl);
    if (KNOWN_PROVIDER_BASES.has(norm)) return true;
    const originPattern = getOriginPattern(norm);
    if (!originPattern) return false;
    if (!chrome?.permissions?.contains) return !chrome?.runtime?.id;
    try {
      return Boolean(await chrome.permissions.contains({ origins: [originPattern] }));
    } catch {
      return false;
    }
  }

  async function recordPendingPermission(originPattern, host) {
    if (!chrome?.storage?.local || !originPattern) return;
    try {
      await chrome.storage.local.set({
        [PENDING_PERM_STORAGE_KEY]: { originPattern, host, ts: Date.now() },
      });
    } catch {
      // Ignore storage errors
    }
  }

  async function clearPendingPermission() {
    if (!chrome?.storage?.local) return;
    try {
      await chrome.storage.local.remove([PENDING_PERM_STORAGE_KEY]);
    } catch {
      // Ignore storage errors
    }
  }

  async function readStoredConfig() {
    if (!chrome?.storage?.local) {
      return { apiKey: null, baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, provider: "route" };
    }
    const items = await chrome.storage.local.get([CONFIG_STORAGE_KEY]);
    const saved = items?.[CONFIG_STORAGE_KEY] || {};
    const baseUrl = normalizeBaseUrl(saved.baseUrl);
    return {
      apiKey: saved.apiKey ? String(saved.apiKey).trim() : null,
      baseUrl: isValidBaseUrl(baseUrl) ? baseUrl : DEFAULT_BASE_URL,
      model: String(saved.model || "").trim() || DEFAULT_MODEL,
      provider: String(saved.provider || "").trim() || protocol.detectProviderId(baseUrl),
    };
  }

  async function writeStoredConfig(cfg) {
    const baseUrl = normalizeBaseUrl(cfg?.baseUrl);
    if (!isValidBaseUrl(baseUrl)) {
      throw new Error("Base URL tidak valid.");
    }
    const apiKey = String(cfg?.apiKey || "").trim();
    if (!apiKey) {
      throw new Error("API key tidak boleh kosong.");
    }
    const next = {
      apiKey,
      baseUrl,
      model: String(cfg?.model || "").trim() || DEFAULT_MODEL,
      provider: String(cfg?.provider || "").trim() || protocol.detectProviderId(baseUrl),
    };
    await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: next });
    if (KNOWN_PROVIDER_BASES.has(baseUrl) || (await hasOriginPermission(baseUrl))) {
      await clearPendingPermission();
    } else if (chrome?.storage?.local?.get) {
      try {
        const items = await chrome.storage.local.get([PENDING_PERM_STORAGE_KEY]);
        const pendingPattern = items?.[PENDING_PERM_STORAGE_KEY]?.originPattern;
        const nextPattern = getOriginPattern(baseUrl);
        if (pendingPattern && pendingPattern !== nextPattern) {
          await clearPendingPermission();
        }
      } catch {
        // Ignore storage errors
      }
    }
    return next;
  }

  async function fetchTextWithTimeout(url, options, timeoutMs, requestState) {
    const controller = new AbortController();
    let timedOut = false;

    const reqState = requestState && typeof requestState === "object" ? requestState : null;
    if (reqState) {
      reqState.controller = controller;
      if (reqState.aborted) {
        return { ok: false, status: 0, raw: "", timedOut: false, aborted: true, error: "Aborted" };
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(3000, Math.min(120000, Number(timeoutMs) || 35000)));

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const raw = await res.text();
      const retryAfterMs = parseRetryAfterMs(res.headers?.get?.("retry-after"));
      return {
        ok: res.ok,
        status: res.status,
        raw,
        timedOut: false,
        aborted: false,
        ...(retryAfterMs != null ? { retryAfterMs } : {}),
      };
    } catch (err) {
      if (reqState?.aborted) {
        return { ok: false, status: 0, raw: "", timedOut: false, aborted: true, error: "Aborted" };
      }
      if (timedOut) {
        return {
          ok: false,
          status: 408,
          raw: "",
          timedOut: true,
          aborted: false,
          error: `Timeout setelah ${Math.round((Number(timeoutMs) || 35000) / 1000)} detik`,
        };
      }
      return {
        ok: false,
        status: 0,
        raw: "",
        timedOut: false,
        aborted: false,
        error: err?.message || "Gagal menghubungi server AI.",
      };
    } finally {
      clearTimeout(timer);
      if (reqState && reqState.controller === controller) {
        reqState.controller = null;
      }
    }
  }

  async function handleAiVerify(payload) {
    const apiKey = String(payload?.apiKey || "").trim();
    const rawBase = payload?.baseUrl == null ? DEFAULT_BASE_URL : String(payload.baseUrl).trim();
    if (!apiKey) {
      return { valid: false, status: 400, message: "API key tidak boleh kosong." };
    }
    if (!rawBase || !isValidBaseUrl(rawBase)) {
      return { valid: false, status: 400, message: "Base URL tidak valid." };
    }
    const baseUrl = normalizeBaseUrl(rawBase);

    let host = baseUrl;
    try {
      host = new URL(baseUrl).host;
    } catch {
      // Keep raw
    }

    // Security gate: check optional host permission BEFORE any outbound fetch
    const permitted = await hasOriginPermission(baseUrl);
    if (!permitted) {
      const originPattern = getOriginPattern(baseUrl);
      await recordPendingPermission(originPattern, host);
      return {
        valid: false,
        status: 0,
        needsPermission: true,
        originPattern,
        message: `Akses ke ${host} belum diizinkan. Izinkan akses host terlebih dahulu lalu coba lagi.`,
      };
    }

    const verifyFetch = () =>
      fetchTextWithTimeout(
        `${baseUrl}/models`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
        15000
      );

    let res = await verifyFetch();
    if (!res.ok && !res.timedOut && (res.status === 0 || res.status === 502 || res.status === 503 || res.status === 504)) {
      await new Promise((r) => setTimeout(r, 250));
      res = await verifyFetch();
    }

    if (res.ok) {
      await clearPendingPermission();
      let parsed = null;
      if (res.raw && !/^\s*(?:<!doctype|<html)\b/i.test(res.raw)) {
        try {
          parsed = JSON.parse(res.raw);
        } catch {
          parsed = null;
        }
      }
      const models = extractModelIds(parsed);
      return { valid: true, status: res.status, models };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        valid: false,
        status: res.status,
        message: "API key tidak valid atau sudah tidak aktif.",
      };
    }

    const isCustomEndpoint =
      payload?.provider === "custom" || !KNOWN_PROVIDER_BASES.has(baseUrl);
    if (isCustomEndpoint && (res.status === 404 || res.status === 405)) {
      await clearPendingPermission();
      return {
        valid: true,
        status: res.status,
        models: [],
        warning: `Endpoint /models tidak tersedia (HTTP ${res.status}), konfigurasi Custom tetap dapat disimpan.`,
      };
    }

    if (res.status > 0) {
      return {
        valid: false,
        status: res.status,
        message: `Server merespons status ${res.status}. ${errorDetail(res.status, res.raw)}`,
      };
    }

    return {
      valid: false,
      status: 0,
      message: `Gagal menghubungi ${host}. Periksa Base URL atau koneksi internet Anda.`,
    };
  }

  async function handleAiChat(requestId, payload, sender) {
    const cleanReqId = String(requestId || "").trim();
    const senderScope = sender?.tab?.id != null ? `tab:${sender.tab.id}` : "ext";
    const reqKey = cleanReqId ? `${senderScope}:${cleanReqId}` : "";
    const reqState = {
      aborted: false,
      controller: null,
      abort() {
        this.aborted = true;
        try {
          this.controller?.abort();
        } catch {
          // Ignore
        }
      },
    };
    if (reqKey) {
      activeAiRequests.set(reqKey, reqState);
    }

    try {
      const isExtUi = isExtensionPageSender(sender, EXT_UI_PATHS);
      const isContentCaller = Boolean(sender?.tab) && !isExtUi;
      const stored = await readStoredConfig();
      if (reqState.aborted) {
        return { ok: false, status: 0, aborted: true, retryable: false, error: "Aborted" };
      }

      let apiKey = stored.apiKey;
      let baseUrl = stored.baseUrl;
      if (!isContentCaller) {
        const hasExplicitBase = Boolean(String(payload?.baseUrl || "").trim());
        const hasExplicitKey = Boolean(String(payload?.apiKey || "").trim());
        if (hasExplicitBase) {
          const rawExplicitBase = String(payload.baseUrl).trim();
          if (!isValidBaseUrl(rawExplicitBase)) {
            return { ok: false, status: 400, retryable: false, error: "Base URL AI tidak valid." };
          }
          const candidateBase = normalizeBaseUrl(rawExplicitBase);
          if (!hasExplicitKey && candidateBase !== stored.baseUrl && stored.apiKey) {
            return {
              ok: false,
              status: 400,
              retryable: false,
              error: "Tidak dapat mengirim API key tersimpan ke Base URL berbeda.",
            };
          }
          baseUrl = candidateBase;
        }
        if (hasExplicitKey) {
          apiKey = String(payload.apiKey).trim();
        }
      }

      const model = String(payload?.model || stored.model || DEFAULT_MODEL).trim();
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0;
      const maxTokens = Number(payload?.maxTokens) || 400;
      const topP = typeof payload?.topP === "number" && Number.isFinite(payload.topP) ? payload.topP : undefined;
      const timeoutMs = Number(payload?.timeoutMs) || 35000;

      if (!apiKey) {
        return {
          ok: false,
          status: 401,
          retryable: false,
          error: "API key belum dikonfigurasi. Silakan atur API key terlebih dahulu.",
        };
      }
      if (!isValidBaseUrl(baseUrl)) {
        return {
          ok: false,
          status: 400,
          retryable: false,
          error: "Base URL AI tidak valid.",
        };
      }
      if (!messages.length) {
        return {
          ok: false,
          status: 400,
          retryable: false,
          error: "Payload messages AI kosong.",
        };
      }

      // Security gate: check optional host permission BEFORE any outbound fetch
      const permitted = await hasOriginPermission(baseUrl);
      if (reqState.aborted) {
        return { ok: false, status: 0, aborted: true, retryable: false, error: "Aborted" };
      }
      if (!permitted) {
        let host = baseUrl;
        try {
          host = new URL(baseUrl).host;
        } catch {
          // Keep raw
        }
        const originPattern = getOriginPattern(baseUrl);
        await recordPendingPermission(originPattern, host);
        return {
          ok: false,
          status: 0,
          raw: "",
          retryable: false,
          needsPermission: true,
          originPattern,
          error: `Akses ke ${host} belum diizinkan. Buka Pengaturan API atau klik ikon Mentari Mod di toolbar lalu tekan "Izinkan Akses ${host}".`,
        };
      }

      const runRequest = async ({ withReasoningEffort, useMaxCompletionTokens, omitTemperature }) => {
        if (reqState.aborted) {
          return { ok: false, status: 0, raw: "", timedOut: false, aborted: true, error: "Aborted" };
        }
        const body = {
          model,
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
        if (topP !== undefined) {
          body.top_p = topP;
        }
        if (withReasoningEffort) {
          body.reasoning_effort = "low";
        }
        return fetchTextWithTimeout(
          `${baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
          },
          timeoutMs,
          reqState
        );
      };

      const endpointKey = `${baseUrl}\0${model}`;
      const wantReasoningEffort = isGeminiThinkingModel(model, baseUrl) && !noReasoningEffortEndpoints.has(endpointKey);
      const wantMaxCompTokens = maxCompletionTokensEndpoints.has(endpointKey);
      let res = await runRequest({
        withReasoningEffort: wantReasoningEffort,
        useMaxCompletionTokens: wantMaxCompTokens,
        omitTemperature: false,
      });
      if (!res.ok && !res.aborted && !reqState.aborted && (res.status === 400 || res.status === 422)) {
        const needsMaxComp = !wantMaxCompTokens && isMaxCompletionTokensError(res.raw);
        const omitTemp = needsMaxComp && /temperature/i.test(String(res.raw || ""));
        if (wantReasoningEffort || needsMaxComp) {
          res = await runRequest({
            withReasoningEffort: false,
            useMaxCompletionTokens: wantMaxCompTokens || needsMaxComp,
            omitTemperature: omitTemp,
          });
          if (res.ok) {
            if (wantReasoningEffort) rememberEndpointCapability(noReasoningEffortEndpoints, endpointKey);
            if (needsMaxComp) rememberEndpointCapability(maxCompletionTokensEndpoints, endpointKey);
          }
        }
      }

      if (res.aborted || reqState.aborted) {
        return { ok: false, status: 0, aborted: true, retryable: false, error: "Aborted" };
      }

      if (!res.ok) {
        const status = Number(res.status) || 0;
        const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
        return {
          ok: false,
          status,
          raw: res.raw || "",
          retryable,
          ...(res.retryAfterMs != null ? { retryAfterMs: res.retryAfterMs } : {}),
          error: res.error || errorDetail(status, res.raw),
        };
      }

      const objects = parseJsonObjects(res.raw);
      const finishReason = extractFinishReason(objects);
      const payloadErr = extractPayloadError(objects);
      if (payloadErr) {
        return {
          ok: false,
          status: res.status,
          content: "",
          finishReason,
          raw: res.raw || "",
          retryable: false,
          error: payloadErr,
        };
      }

      const content = extractChatContent(objects) || "";
      if (!content.trim()) {
        const isFiltered = /content_filter|safety/i.test(String(finishReason || ""));
        return {
          ok: false,
          status: res.status,
          content: "",
          finishReason,
          raw: res.raw || "",
          retryable: !isFiltered,
          error: isFiltered
            ? "Jawaban diblokir oleh filter keamanan AI."
            : "Respons AI kosong atau format tidak dikenali.",
        };
      }

      await clearPendingPermission();
      return {
        ok: true,
        status: res.status,
        content,
        finishReason,
        raw: res.raw || "",
        retryable: false,
        error: null,
      };
    } finally {
      if (reqKey && activeAiRequests.get(reqKey) === reqState) {
        activeAiRequests.delete(reqKey);
      }
    }
  }

  async function ensureContentScriptsInjected(tabId, url) {
    if (typeof tabId !== "number" || !url || !chrome?.scripting?.executeScript) return false;

    const prev = pendingInjections.get(tabId) || Promise.resolve();
    const task = prev
      .catch(() => false)
      .then(async () => {
        try {
          const parsed = parseUrl(url);
          if (!parsed) return false;

          if (isMentariActiveUrl(url)) {
            const [probe] = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => ({
                core: Boolean(
                  window.MentariAiProtocol &&
                  window.MentariAiClient &&
                  typeof window.toggleTokenPopup === "function"
                ),
                discus: Boolean(window.__MENTARI_DISCUS_LOADED__),
              }),
            });
            const state = probe?.result || {};
            if (!state.core) {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: MENTARI_ACTIVE_SCRIPTS,
              });
            }
            if (FORUM_TOPIC_RE.test(parsed.pathname) && !state.discus) {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ["src/content/discus.js"],
              });
            }
            return true;
          }

          if (isMyUnpamUrl(url)) {
            const [probe] = await chrome.scripting.executeScript({
              target: { tabId },
              func: () => Boolean(
                window.MentariAiProtocol &&
                window.MentariAiClient &&
                window.__MENTARI_QUICKSURVEY_LOADED__
              ),
            });
            if (!probe?.result) {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: MY_UNPAM_ACTIVE_SCRIPTS,
              });
            }
            return true;
          }
        } catch {
          return false;
        }
        return false;
      });

    pendingInjections.set(tabId, task);
    try {
      return await task;
    } finally {
      if (pendingInjections.get(tabId) === task) {
        pendingInjections.delete(tabId);
      }
    }
  }

  async function dispatchTabAction(tabId, url, messageType) {
    if (typeof tabId !== "number") {
      return { ok: false, error: "Tab tidak valid." };
    }
    let targetUrl = url;
    if (chrome?.tabs?.get) {
      try {
        const liveTab = await chrome.tabs.get(tabId);
        if (liveTab?.url) targetUrl = liveTab.url;
      } catch {
        // Ignore if tabs.get fails; validate available URL below
      }
    }
    if (!isMentariActiveUrl(targetUrl) && !isMyUnpamUrl(targetUrl)) {
      return { ok: false, error: "Buka halaman HTTPS MENTARI atau my.unpam (sudah login) terlebih dahulu." };
    }
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: messageType });
      if (response && response.ok === false) return response;
      return { ok: true, response };
    } catch {
      // Content script might not be loaded yet if user transitioned from /login via SPA pushState
      const injected = await ensureContentScriptsInjected(tabId, targetUrl);
      if (!injected) {
        return { ok: false, error: "Gagal menjangkau halaman aktif. Coba muat ulang tab." };
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: messageType });
        if (response && response.ok === false) return response;
        return { ok: true, response };
      } catch (err) {
        return {
          ok: false,
          error: err?.message || "Halaman belum siap menerima perintah. Muat ulang tab lalu coba lagi.",
        };
      }
    }
  }

  async function updateTabBadge(tabId, rawUrl) {
    if (!chrome?.action || typeof tabId !== "number") return;
    const parsed = parseUrl(rawUrl);
    const routeStr = getRouteString(parsed);

    let text = "";
    let color = "#6D28D9";
    let title = "Mentari Mod v3.0 Revised • Tuning by Rixz";

    if (isMentariActiveUrl(rawUrl)) {
      if (KUESIONER_PATH_RE.test(routeStr)) {
        text = "KUI";
        color = "#7C3AED";
        title = "Mentari Mod v3.0 Revised — Kuesioner Aktif (Alt+Shift+M) • Tuning by Rixz";
      } else {
        text = "ON";
        color = "#6D28D9";
        title = "Mentari Mod v3.0 Revised — Aktif (Alt+Shift+M) • Tuning by Rixz";
      }
    } else if (isMyUnpamUrl(rawUrl)) {
      if (MY_UNPAM_SURVEY_RE.test(routeStr)) {
        text = "KUI";
        color = "#4338CA";
        title = "Mentari Mod v3.0 Revised — QuickSurvey my.unpam Aktif • Tuning by Rixz";
      } else {
        text = "MY";
        color = "#312E81";
        title = "Mentari Mod v3.0 Revised — my.unpam Aktif • Tuning by Rixz";
      }
    }

    try {
      await chrome.action.setBadgeText({ tabId, text });
      if (text) {
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
      }
      await chrome.action.setTitle({ tabId, title });
    } catch {
      // Ignore closed/inaccessible tab errors
    }
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message !== "object") return false;
    // Fail-closed security gate: reject missing or mismatched extension sender ID
    if (!chrome?.runtime?.id || sender?.id !== chrome.runtime.id) {
      return false;
    }

    switch (message.type) {
      case "mentari:ai-get-config": {
        const isOptions = isExtensionPageSender(sender, OPTIONS_PATHS);
        const isPopup = isExtensionPageSender(sender, POPUP_PATHS);
        const isAllowedContent = !isOptions && !isPopup && isAllowedContentSender(sender);
        if (!isOptions && !isPopup && !isAllowedContent) {
          sendResponse({ ok: false, error: "Konteks pengirim tidak diizinkan." });
          return false;
        }
        readStoredConfig()
          .then((config) =>
            sendResponse({
              ok: true,
              config: isOptions
                ? { ...config, hasApiKey: Boolean(config.apiKey) }
                : toPublicConfig(config),
            })
          )
          .catch((err) => sendResponse({ ok: false, error: err?.message || "Gagal membaca config." }));
        return true;
      }

      case "mentari:ai-set-config":
        if (!isExtensionPageSender(sender, OPTIONS_PATHS)) {
          sendResponse({ ok: false, error: "Pengubahan konfigurasi AI hanya diizinkan dari halaman ekstensi." });
          return false;
        }
        writeStoredConfig(message.config)
          .then((config) => sendResponse({ ok: true, config: { ...config, hasApiKey: Boolean(config.apiKey) } }))
          .catch((err) => sendResponse({ ok: false, error: err?.message || "Gagal menyimpan config." }));
        return true;

      case "mentari:ai-migrate-legacy":
        if (!isExtensionPageSender(sender, EXT_UI_PATHS) && !isAllowedContentSender(sender)) {
          sendResponse({ ok: false, error: "Konteks pengirim tidak diizinkan." });
          return false;
        }
        migrateLegacyConfig(message.config)
          .then((config) => sendResponse({ ok: true, config: toPublicConfig(config) }))
          .catch((err) => sendResponse({ ok: false, error: err?.message || "Gagal migrasi config." }));
        return true;

      case "mentari:ai-verify":
        if (!isExtensionPageSender(sender, EXT_UI_PATHS)) {
          sendResponse({ valid: false, message: "Verifikasi API hanya diizinkan dari halaman ekstensi." });
          return false;
        }
        handleAiVerify(message.payload || {})
          .then((result) => sendResponse(result))
          .catch((err) => sendResponse({ valid: false, message: err?.message || "Gagal memverifikasi." }));
        return true;

      case "mentari:ai-chat":
        if (!isExtensionPageSender(sender, EXT_UI_PATHS) && !isAllowedContentSender(sender)) {
          sendResponse({ ok: false, status: 403, retryable: false, error: "Konteks pengirim tidak diizinkan." });
          return false;
        }
        handleAiChat(message.requestId, message.payload || {}, sender)
          .then((result) => sendResponse(result))
          .catch((err) =>
            sendResponse({
              ok: false,
              status: 0,
              retryable: true,
              error: err?.message || "Gagal memproses permintaan AI.",
            })
          );
        return true;

      case "mentari:ai-abort": {
        if (!isExtensionPageSender(sender, EXT_UI_PATHS) && !isAllowedContentSender(sender)) {
          return false;
        }
        const scope = sender?.tab?.id != null ? `tab:${sender.tab.id}` : "ext";
        const key = `${scope}:${String(message.requestId || "").trim()}`;
        const entry = activeAiRequests.get(key);
        if (entry && typeof entry.abort === "function") {
          entry.abort();
        }
        sendResponse({ ok: true });
        return false;
      }

      case "mentari:open-options":
        if (!isExtensionPageSender(sender, EXT_UI_PATHS) && !isAllowedContentSender(sender)) {
          sendResponse({ ok: false, error: "Konteks pengirim tidak diizinkan." });
          return false;
        }
        openExtensionOptions()
          .then(() => sendResponse({ ok: true }))
          .catch((err) => sendResponse({ ok: false, error: err?.message || "Gagal membuka pengaturan." }));
        return true;

      case "mentari:popup-action": {
        // Security gate: popup actions must only come from popup extension page, never content scripts or other pages
        if (!isExtensionPageSender(sender, POPUP_PATHS)) {
          sendResponse({ ok: false, error: "Aksi popup hanya diizinkan dari halaman ekstensi." });
          return false;
        }
        const { tabId, url, action } = message;
        const allowedActions = {
          "toggle-panel": "mentari:toggle-panel",
          "run-kuesioner": "mentari:run-kuesioner",
          "run-quicksurvey": "mentari:run-quicksurvey",
        };
        const targetMsg = allowedActions[action];
        if (!targetMsg) {
          sendResponse({ ok: false, error: "Aksi tidak dikenali." });
          return false;
        }
        dispatchTabAction(tabId, url, targetMsg)
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({ ok: false, error: err?.message || "Gagal menjalankan aksi." }));
        return true;
      }

      default:
        return false;
    }
  }

  function handleTabUpdated(tabId, changeInfo, tab) {
    const currentUrl = changeInfo.url || tab?.url;
    if (changeInfo.url || changeInfo.status === "complete") {
      updateTabBadge(tabId, currentUrl);
    }
    const isTargetUrl = isMentariActiveUrl(currentUrl) || isMyUnpamUrl(currentUrl);
    if (changeInfo.url) {
      if (!isTargetUrl) {
        pendingTabInjections.delete(tabId);
      } else if (tab?.status === "complete") {
        pendingTabInjections.delete(tabId);
        ensureContentScriptsInjected(tabId, changeInfo.url).catch(() => {});
      } else {
        pendingTabInjections.add(tabId);
      }
      return;
    }
    if (changeInfo.status === "complete" && pendingTabInjections.has(tabId)) {
      pendingTabInjections.delete(tabId);
      if (isTargetUrl) {
        ensureContentScriptsInjected(tabId, currentUrl).catch(() => {});
      }
    }
  }

  if (typeof chrome !== "undefined") {
    chrome.runtime?.onMessage?.addListener(handleMessage);

    chrome.tabs?.onActivated?.addListener(async ({ tabId }) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        await updateTabBadge(tabId, tab?.url);
      } catch {
        // Ignore tab lookup errors
      }
    });

    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);
    chrome.tabs?.onRemoved?.addListener((tabId) => {
      pendingTabInjections.delete(tabId);
    });

    chrome.permissions?.onAdded?.addListener(async (perms) => {
      try {
        if (!chrome?.storage?.local) return;
        const items = await chrome.storage.local.get([PENDING_PERM_STORAGE_KEY]);
        const pendingPattern = items?.[PENDING_PERM_STORAGE_KEY]?.originPattern;
        if (!pendingPattern) return;
        const addedOrigins = Array.isArray(perms?.origins) ? perms.origins : [];
        const normPending = getOriginPattern(String(pendingPattern).replace(/\/\*$/, "")) || pendingPattern;
        if (
          addedOrigins.includes(normPending) ||
          addedOrigins.includes("<all_urls>") ||
          (await hasOriginPermission(String(normPending).replace(/\/\*$/, "")))
        ) {
          await clearPendingPermission();
        }
      } catch {
        // Ignore
      }
    });

    chrome.commands?.onCommand?.addListener(async (command) => {
      if (command !== "toggle-mentari-panel") return;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || typeof tab.id !== "number" || !isMentariActiveUrl(tab.url)) return;
        await dispatchTabAction(tab.id, tab.url, "mentari:toggle-panel");
      } catch {
        // Ignore execution errors on restricted tabs
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      handleAiVerify,
      handleAiChat,
      ensureContentScriptsInjected,
      dispatchTabAction,
      readStoredConfig,
      writeStoredConfig,
      hasOriginPermission,
      handleMessage,
      handleTabUpdated,
    };
  }
})();
