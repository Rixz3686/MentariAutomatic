(() => {
  "use strict";

  const MENTARI_ORIGIN = "https://mentari.unpam.ac.id";
  const DEFAULT_CACHE_PREFIX = "mentari_fg_v2:";
  const LEGACY_CACHE_PREFIX = "mentari_fg_v1:";
  const DEFAULT_COOLDOWN_KEY = "mentari_fg_cooldown_until";
  const COURSE_DATA_TS_KEY = "mentari_course_data_ts";
  const MAX_PERSISTENT_CACHE_ENTRIES = 32;
  const HTML_RE = /^\s*(?:<!doctype|<html)\b/i;

  function decodeBase64Url(b64Url) {
    const b64 = String(b64Url || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob === "function") {
      return atob(padded);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }
    return "";
  }

  function decodeJwtScope(authHeader) {
    if (!authHeader) return "anon";
    const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length < 2) return "anon";
    try {
      const json = decodeBase64Url(parts[1]);
      if (!json) return "anon";
      const payload = JSON.parse(json);
      const id = payload?.userId ?? payload?.username ?? payload?.sub;
      return id != null && String(id).trim() !== "" ? String(id).trim() : "anon";
    } catch {
      return "anon";
    }
  }

  function getHeader(headersInit, name) {
    if (!headersInit) return null;
    const target = name.toLowerCase();
    if (typeof Headers !== "undefined" && headersInit instanceof Headers) {
      return headersInit.get(name);
    }
    if (Array.isArray(headersInit)) {
      for (const [k, v] of headersInit) {
        if (String(k).toLowerCase() === target) return v;
      }
      return null;
    }
    if (typeof headersInit === "object") {
      for (const [k, v] of Object.entries(headersInit)) {
        if (k.toLowerCase() === target) return v;
      }
    }
    return null;
  }

  function makeJsonResponse(payload, status = 200, authHeader = null) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (authHeader) headers.set("Authorization", authHeader);
    return new Response(body, { status, headers });
  }

  function parseRetryAfterMs(headerVal, defaultCooldownMs, nowMs) {
    if (!headerVal) return defaultCooldownMs;
    const trimmed = String(headerVal).trim();
    let ms = NaN;
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      ms = Number(trimmed) * 1000;
    } else {
      const parsed = Date.parse(trimmed);
      if (Number.isFinite(parsed)) {
        ms = parsed - nowMs;
      }
    }
    if (!Number.isFinite(ms) || ms <= 0) return defaultCooldownMs;
    return Math.min(60000, Math.max(10000, ms));
  }

  function classifyRequest(urlStr, method, isBypass) {
    let url;
    try {
      url = new URL(urlStr, MENTARI_ORIGIN);
    } catch {
      return { kind: "passthrough" };
    }

    if (url.href.startsWith("https://api.github.com/repos/lukman754/Mentari-Unpam/releases/latest")) {
      return { kind: "drop-upstream-check", url };
    }

    if (url.origin !== MENTARI_ORIGIN || !url.pathname.startsWith("/api/")) {
      return { kind: "passthrough" };
    }

    const upperMethod = String(method || "GET").toUpperCase();
    const path = url.pathname;

    if (upperMethod !== "GET") {
      let invalidatePatterns = [];
      if (/^\/api\/forum\/reply(?:\/|$)/.test(path)) {
        invalidatePatterns = ["/api/forum/topic/", "/api/forum/reply/"];
      } else if (/^\/api\/kuesioner\/submit(?:\/|$)/.test(path)) {
        invalidatePatterns = ["/api/user-course"];
      } else if (/^\/api\/quiz\//.test(path)) {
        invalidatePatterns = ["/api/quiz/peserta/", "/api/user-course"];
      }
      return { kind: "mutation", url, invalidatePatterns };
    }

    if (/^\/api\/kuesioner\/[^/]+\/[^/]+\/?$/.test(path)) {
      return isBypass ? { kind: "priority", url } : { kind: "drop-kuesioner", url };
    }

    if (/^\/api\/quiz\/soal\//.test(path) || /^\/api\/file\//.test(path)) {
      return { kind: "priority", url };
    }

    if (/^\/api\/user-course(?:\/[^/]+)?\/?$/.test(path)) {
      return {
        kind: "background",
        tier: "course-core",
        url,
        ttlMs: 10 * 60 * 1000,
        persistLocal: true,
        deferUntilPopupOpen: false,
        coldBackgroundDelayMs: 600,
      };
    }
    if (/^\/api\/quiz\/peserta\/[^/]+\/?$/.test(path)) {
      return {
        kind: "background",
        tier: "background-detail",
        url,
        ttlMs: 120000,
        persistLocal: false,
        deferUntilPopupOpen: true,
      };
    }
    if (/^\/api\/forum\/topic\/[^/]+\/?$/.test(path)) {
      return {
        kind: "background",
        tier: "background-detail",
        url,
        ttlMs: 120000,
        persistLocal: false,
        deferUntilPopupOpen: true,
      };
    }
    if (/^\/api\/forum\/reply\/[^/]+\/?$/.test(path)) {
      return {
        kind: "background",
        tier: "background-detail",
        url,
        ttlMs: 180000,
        persistLocal: false,
        deferUntilPopupOpen: true,
      };
    }

    return { kind: "priority", url };
  }

  function createFetchGuard(options = {}) {
    const origFetch = options.origFetch;
    if (typeof origFetch !== "function") {
      throw new Error("createFetchGuard requires origFetch");
    }

    const storage = options.storage || null;
    const localStorageRef = options.localStorage || null;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const isPopupOpen = typeof options.isPopupOpen === "function" ? options.isPopupOpen : () => true;
    const maxConcurrent = Math.max(1, Number(options.maxConcurrent ?? 5));
    const backgroundMaxConcurrent = Math.max(1, Math.min(maxConcurrent, Number(options.backgroundMaxConcurrent ?? 2)));
    const minSpacingMs = Math.max(0, Number(options.minSpacingMs ?? 35));
    const backgroundMinSpacingMs = Math.max(minSpacingMs, Number(options.backgroundMinSpacingMs ?? 120));
    const startupGraceMs = Math.max(0, Number(options.startupGraceMs ?? 150));
    const coldBackgroundDelayMsDefault = Math.max(0, Number(options.coldBackgroundDelayMs ?? 600));
    const requestTimeoutMs = Math.max(1000, Number(options.requestTimeoutMs ?? 10000));
    const priorityTimeoutMs = Math.max(requestTimeoutMs, Number(options.priorityTimeoutMs ?? 15000));
    const defaultCooldownMs = Math.max(1000, Number(options.defaultCooldownMs ?? 20000));
    const cachePrefix = options.cachePrefix || DEFAULT_CACHE_PREFIX;
    const cooldownKey = options.cooldownKey || DEFAULT_COOLDOWN_KEY;
    const createdAt = now();

    let bypassDepth = 0;
    let activeCount = 0;
    let lastDispatchAt = 0;
    let drainTimer = null;
    let popupOpenedOnce = false;
    const queue = [];
    const inFlight = new Map();
    const popupWaiters = new Set();
    const coldDelayWaiters = new Set();

    function getStorageKeys(targetStorage) {
      if (!targetStorage) return [];
      const keys = [];
      for (let i = 0; i < targetStorage.length; i++) {
        const k = targetStorage.key(i);
        if (k) keys.push(k);
      }
      return keys;
    }

    function readFromStore(targetStorage, cacheKey, ttlMs) {
      if (!targetStorage) return null;
      try {
        const raw = targetStorage.getItem(cacheKey);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.ts !== "number" || typeof entry.body !== "string") return null;
        if (now() - entry.ts >= ttlMs) return null;
        return entry.body;
      } catch {
        return null;
      }
    }

    function readCache(cacheKey, ttlMs, persistLocal = false) {
      if (persistLocal && localStorageRef) {
        const localHit = readFromStore(localStorageRef, cacheKey, ttlMs);
        if (localHit !== null) return localHit;
      }
      return readFromStore(storage, cacheKey, ttlMs);
    }

    function evictOldestCacheEntries(targetStorage, count = 5, maxKeep = Infinity) {
      if (!targetStorage) return;
      const entries = [];
      for (const k of getStorageKeys(targetStorage)) {
        if (!k.startsWith(cachePrefix) && !k.startsWith(LEGACY_CACHE_PREFIX)) continue;
        try {
          const parsed = JSON.parse(targetStorage.getItem(k) || "{}");
          entries.push({ key: k, ts: Number(parsed.ts || 0) });
        } catch {
          entries.push({ key: k, ts: 0 });
        }
      }
      entries.sort((a, b) => a.ts - b.ts);
      const excess = Number.isFinite(maxKeep) ? Math.max(0, entries.length - maxKeep) : 0;
      const removeCount = Math.max(count, excess);
      for (let i = 0; i < Math.min(removeCount, entries.length); i++) {
        try {
          targetStorage.removeItem(entries[i].key);
        } catch {
          // ignore
        }
      }
    }

    function writeToStore(targetStorage, cacheKey, bodyText, maxEntries = Infinity) {
      if (!targetStorage) return false;
      const payload = JSON.stringify({ ts: now(), body: bodyText });
      if (Number.isFinite(maxEntries)) {
        evictOldestCacheEntries(targetStorage, 0, maxEntries - 1);
      }
      try {
        targetStorage.setItem(cacheKey, payload);
        return true;
      } catch {
        evictOldestCacheEntries(targetStorage, 8);
        try {
          targetStorage.setItem(cacheKey, payload);
          return true;
        } catch {
          return false;
        }
      }
    }

    function writeCache(cacheKey, bodyText, persistLocal = false) {
      if (persistLocal && localStorageRef) {
        const savedLocal = writeToStore(localStorageRef, cacheKey, bodyText, MAX_PERSISTENT_CACHE_ENTRIES);
        if (savedLocal) return;
      }
      writeToStore(storage, cacheKey, bodyText);
    }

    function clearStorePrefix(targetStorage, list) {
      if (!targetStorage) return;
      for (const k of getStorageKeys(targetStorage)) {
        if (!k.startsWith(cachePrefix) && !k.startsWith(LEGACY_CACHE_PREFIX)) continue;
        if (!list || list.some((p) => k.includes(p))) {
          try {
            targetStorage.removeItem(k);
          } catch {
            // ignore
          }
        }
      }
    }

    function clearCache(patterns) {
      const list = Array.isArray(patterns) && patterns.length > 0 ? patterns : null;
      clearStorePrefix(storage, list);
      clearStorePrefix(localStorageRef, list);
      if (localStorageRef && (!list || list.some((p) => p.includes("/api/user-course")))) {
        try {
          localStorageRef.removeItem(COURSE_DATA_TS_KEY);
        } catch {
          // ignore
        }
      }
    }

    function getCooldownUntil() {
      if (!storage) return 0;
      try {
        const val = Number(storage.getItem(cooldownKey) || 0);
        return Number.isFinite(val) ? val : 0;
      } catch {
        return 0;
      }
    }

    function getCooldownRemainingMs() {
      return Math.max(0, getCooldownUntil() - now());
    }

    function setCooldown(retryAfterHeader) {
      const duration = parseRetryAfterMs(retryAfterHeader, defaultCooldownMs, now());
      const until = now() + duration;
      if (storage) {
        try {
          storage.setItem(cooldownKey, String(until));
        } catch {
          // ignore
        }
      }
      return duration;
    }

    function clearCooldown() {
      if (!storage) return;
      try {
        storage.removeItem(cooldownKey);
      } catch {
        // ignore
      }
    }

    function notifyPopupOpened() {
      popupOpenedOnce = true;
      if (popupWaiters.size) {
        const pending = [...popupWaiters];
        popupWaiters.clear();
        for (const resolve of pending) resolve();
      }
      if (coldDelayWaiters.size) {
        const pendingCold = [...coldDelayWaiters];
        coldDelayWaiters.clear();
        for (const cancel of pendingCold) cancel();
      }
      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }
      drainQueue();
    }

    function waitForPopupOpen() {
      if (isPopupOpen()) return Promise.resolve();
      return new Promise((resolve) => {
        popupWaiters.add(resolve);
      });
    }

    function waitForColdBackgroundDelay(delayMs) {
      if (delayMs <= 0 || isPopupOpen() || popupOpenedOnce) return Promise.resolve();
      const remaining = createdAt + delayMs - now();
      if (remaining <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          coldDelayWaiters.delete(finish);
          if (timer) clearTimeout(timer);
          resolve();
        };
        coldDelayWaiters.add(finish);
        timer = setTimeout(finish, remaining);
      });
    }

    function scheduleDrain(delayMs) {
      if (drainTimer) return;
      drainTimer = setTimeout(() => {
        drainTimer = null;
        drainQueue();
      }, Math.max(1, delayMs));
    }

    function drainQueue() {
      while (queue.length > 0) {
        const nextItem = queue[0];
        const popupActive = popupOpenedOnce || isPopupOpen();
        const isCoreFast = nextItem.tier === "course-core" && popupActive;
        const limit = isCoreFast ? maxConcurrent : backgroundMaxConcurrent;
        if (activeCount >= limit) return;

        const currentTime = now();
        const graceWait = popupActive ? 0 : createdAt + startupGraceMs - currentTime;
        if (graceWait > 0) {
          scheduleDrain(graceWait);
          return;
        }

        const spacing = isCoreFast ? minSpacingMs : backgroundMinSpacingMs;
        const spacingWait = lastDispatchAt > 0 ? lastDispatchAt + spacing - currentTime : 0;
        if (spacingWait > 0) {
          scheduleDrain(spacingWait);
          return;
        }

        const item = queue.shift();
        activeCount++;
        lastDispatchAt = currentTime;

        Promise.resolve()
          .then(item.task)
          .then(item.resolve, item.reject)
          .finally(() => {
            activeCount--;
            drainQueue();
          });
      }
    }

    function enqueueNetwork(task, tier = "background-detail") {
      return new Promise((resolve, reject) => {
        const entry = { task, tier, resolve, reject };
        if (tier === "course-core") {
          const idx = queue.findIndex((item) => item.tier !== "course-core");
          if (idx === -1) queue.push(entry);
          else queue.splice(idx, 0, entry);
        } else {
          queue.push(entry);
        }
        drainQueue();
      });
    }

    async function fetchWithTimeout(input, init, customTimeoutMs = requestTimeoutMs) {
      const mergedInit = { ...(init || {}), credentials: init?.credentials || "include" };
      const hasExternalSignal = Boolean(mergedInit.signal || (typeof input === "object" && input?.signal));
      if (hasExternalSignal || typeof AbortController !== "function") {
        return origFetch(input, mergedInit);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), customTimeoutMs);
      try {
        return await origFetch(input, { ...mergedInit, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    async function readSafeBody(res, fallbackMsg) {
      const raw = await res.text();
      const authHeader = res.headers?.get?.("Authorization") || null;

      if (res.status === 429) {
        setCooldown(res.headers?.get?.("Retry-After"));
        if (!raw || HTML_RE.test(raw)) {
          return {
            status: 429,
            bodyText: JSON.stringify({ error: "Server MENTARI sedang membatasi permintaan (HTTP 429)" }),
            authHeader,
            ok: false,
          };
        }
      }

      if (HTML_RE.test(raw)) {
        return {
          status: res.ok ? 502 : res.status,
          bodyText: JSON.stringify({ error: `${fallbackMsg} (HTTP ${res.status})` }),
          authHeader,
          ok: false,
        };
      }

      return {
        status: res.status,
        bodyText: raw,
        authHeader,
        ok: res.ok,
      };
    }

    async function executeFetch(input, init, isBypass) {
      const reqUrl = typeof input === "string" ? input : input?.url || "";
      const reqMethod = init?.method || (typeof input === "object" && input?.method) || "GET";
      const info = classifyRequest(reqUrl, reqMethod, isBypass);

      if (info.kind === "passthrough") {
        return origFetch(input, init);
      }

      if (info.kind === "drop-upstream-check") {
        return makeJsonResponse({ tag_name: "v3.0" }, 200);
      }

      if (info.kind === "drop-kuesioner") {
        return makeJsonResponse({ kuesioner: [] }, 200);
      }

      if (info.kind === "mutation") {
        const res = await fetchWithTimeout(input, init, priorityTimeoutMs);
        if (res.status === 429) {
          setCooldown(res.headers?.get?.("Retry-After"));
          const cloned = await readSafeBody(res, "Server membatasi permintaan");
          return makeJsonResponse(cloned.bodyText, cloned.status, cloned.authHeader);
        }
        if (res.ok && info.invalidatePatterns.length > 0) {
          clearCache(info.invalidatePatterns);
        }
        return res;
      }

      if (info.kind === "priority") {
        const res = await fetchWithTimeout(input, init, priorityTimeoutMs);
        if (res.status === 429) {
          setCooldown(res.headers?.get?.("Retry-After"));
        }
        return res;
      }

      // info.kind === "background"
      const reqHeaders = init?.headers || (typeof input === "object" && input?.headers) || null;
      const authHeader = getHeader(reqHeaders, "Authorization");
      const userScope = decodeJwtScope(authHeader);
      const cacheKey = `${cachePrefix}${userScope}:${info.url.pathname}${info.url.search}`;
      const persistLocal = Boolean(info.persistLocal);

      if (!isBypass) {
        const cached = readCache(cacheKey, info.ttlMs, persistLocal);
        if (cached !== null) {
          return makeJsonResponse(cached, 200);
        }

        if (info.deferUntilPopupOpen && !isPopupOpen()) {
          await waitForPopupOpen();
          const cachedAfterWait = readCache(cacheKey, info.ttlMs, persistLocal);
          if (cachedAfterWait !== null) {
            return makeJsonResponse(cachedAfterWait, 200);
          }
        } else if (!info.deferUntilPopupOpen && !isPopupOpen() && !popupOpenedOnce) {
          const delayMs = info.coldBackgroundDelayMs ?? coldBackgroundDelayMsDefault;
          await waitForColdBackgroundDelay(delayMs);
          const cachedAfterDelay = readCache(cacheKey, info.ttlMs, persistLocal);
          if (cachedAfterDelay !== null) {
            return makeJsonResponse(cachedAfterDelay, 200);
          }
        }
      }

      if (getCooldownRemainingMs() > 0) {
        return makeJsonResponse({ error: "Rate limit cooldown active" }, 429);
      }

      let sharedPromise = inFlight.get(cacheKey);
      if (!sharedPromise) {
        sharedPromise = enqueueNetwork(async () => {
          if (getCooldownRemainingMs() > 0) {
            return {
              status: 429,
              bodyText: JSON.stringify({ error: "Rate limit cooldown active" }),
              authHeader: null,
              ok: false,
            };
          }
          const res = await fetchWithTimeout(input, init, requestTimeoutMs);
          const parsed = await readSafeBody(res, "Respons server tidak valid");
          if (parsed.ok) {
            writeCache(cacheKey, parsed.bodyText, persistLocal);
            if (info.tier === "course-core" && typeof window !== "undefined" && typeof CustomEvent === "function") {
              window.dispatchEvent(new CustomEvent("mentari-courses-ready"));
            }
          }
          return parsed;
        }, info.tier || "background-detail").finally(() => {
          inFlight.delete(cacheKey);
        });
        inFlight.set(cacheKey, sharedPromise);
      }

      const result = await sharedPromise;
      return makeJsonResponse(result.bodyText, result.status, result.authHeader);
    }

    function guardedFetch(input, init) {
      return executeFetch(input, init, bypassDepth > 0);
    }

    function fetchBypass(input, init) {
      return executeFetch(input, init, true);
    }

    async function withBypass(fn) {
      bypassDepth++;
      try {
        return await fn();
      } finally {
        bypassDepth = Math.max(0, bypassDepth - 1);
      }
    }

    return {
      fetch: guardedFetch,
      fetchBypass,
      withBypass,
      notifyPopupOpened,
      clearCache,
      clearCooldown,
      getCooldownRemainingMs,
      classifyRequest,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createFetchGuard, decodeJwtScope, classifyRequest };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (window.__mentariFetchGuardLoaded) return;
  window.__mentariFetchGuardLoaded = true;

  const origFetch = window.fetch.bind(window);

  let sessionStorageRef = null;
  let localStorageRef = null;
  try {
    sessionStorageRef = window.sessionStorage;
  } catch {
    sessionStorageRef = null;
  }
  try {
    localStorageRef = window.localStorage;
  } catch {
    localStorageRef = null;
  }

  const isPopupActive = () => Boolean(document.getElementById("token-runner-popup")?.classList.contains("active"));
  const guard = createFetchGuard({
    origFetch,
    storage: sessionStorageRef,
    localStorage: localStorageRef,
    isPopupOpen: isPopupActive,
  });

  globalThis.MentariFetchGuard = guard;
  window.fetch = (...args) => guard.fetch(...args);

  let watchedPopup = null;
  let classObserver = null;

  function watchPopupElement() {
    const popup = document.getElementById("token-runner-popup");
    if (!popup || popup === watchedPopup) return Boolean(popup);
    watchedPopup = popup;

    if (popup.classList.contains("active")) {
      guard.notifyPopupOpened();
    }

    if (classObserver) classObserver.disconnect();
    classObserver = new MutationObserver(() => {
      if (popup.classList.contains("active")) {
        guard.notifyPopupOpened();
      }
    });
    classObserver.observe(popup, { attributes: true, attributeFilter: ["class"] });
    return true;
  }

  if (!watchPopupElement()) {
    const rootObserver = new MutationObserver(() => {
      if (watchPopupElement()) rootObserver.disconnect();
    });
    const root = document.body || document.documentElement;
    if (root) {
      rootObserver.observe(root, { childList: true, subtree: !document.body });
    }
  }

  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (!chrome?.runtime?.id || sender?.id !== chrome.runtime.id || sender?.tab) return false;
      if (msg?.type === "mentari:toggle-panel") {
        guard.notifyPopupOpened();
        setTimeout(() => {
          if (isPopupActive()) guard.notifyPopupOpened();
        }, 30);
      }
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      if (e.target?.closest?.("#mentari-header-toggle")) {
        guard.notifyPopupOpened();
      }
      if (e.target?.closest?.("#token-refresh-btn")) {
        guard.clearCache();
        guard.clearCooldown();
        guard.notifyPopupOpened();
      }
    },
    true
  );
})();
