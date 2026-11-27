(() => {
  "use strict";

  const protocol = globalThis.MentariAiProtocol || null;

  const runButton = document.getElementById("runToken");
  const kuisionerButton = document.getElementById("runKuesioner");
  const grantHostPermButton = document.getElementById("grantHostPerm");
  const openSettingsButton = document.getElementById("openSettings");
  const quickLinks = document.getElementById("quickLinks");
  const openMentariButton = document.getElementById("openMentari");
  const openMyUnpamButton = document.getElementById("openMyUnpam");
  const pageBadge = document.getElementById("pageBadge");
  const statusEl = document.getElementById("status");

  const LOGIN_PATH_RE = protocol?.LOGIN_PATH_RE || /^\/login(?:\/|$)/i;
  const KUESIONER_PATH_RE =
    protocol?.KUESIONER_PATH_RE || /\/(kuesioner|kuisioner|quesioner|questionnaire|survey)(\/|$|\?)/i;
  const MY_UNPAM_SURVEY_RE =
    protocol?.MY_UNPAM_SURVEY_RE || /\/(kuesioner|kuisioner|quesioner|questionnaire|survey|data-akademik\/khs)(\/|$|\?)/i;
  const PENDING_PERM_STORAGE_KEY = protocol?.PENDING_PERM_STORAGE_KEY || "mentari_pending_host_origin";

  function setStatus(message, type = "") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = type;
  }

  function parseTabUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      return new URL(rawUrl);
    } catch {
      return null;
    }
  }

  function isLoginPath(pathname) {
    return protocol?.isLoginPath ? protocol.isLoginPath(pathname) : LOGIN_PATH_RE.test(String(pathname || ""));
  }

  function getRouteString(parsed) {
    if (protocol?.getRouteString) return protocol.getRouteString(parsed);
    if (!parsed) return "";
    return `${parsed.pathname || ""}${parsed.hash ? `/${parsed.hash.replace(/^#\/?/, "")}` : ""}`;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  }

  function sendPopupAction(tab, action) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error("API ekstensi tidak tersedia."));
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "mentari:popup-action",
          tabId: tab.id,
          url: tab.url || "",
          action,
        },
        (res) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            reject(new Error(lastErr.message || "Gagal berkomunikasi dengan ekstensi."));
            return;
          }
          if (!res || res.ok === false) {
            reject(new Error(res?.error || "Gagal menjalankan perintah pada halaman."));
            return;
          }
          resolve(res);
        }
      );
    });
  }

  function formatHostFromPattern(originPattern) {
    try {
      return new URL(String(originPattern || "").replace(/\/\*$/, "")).host;
    } catch {
      return String(originPattern || "API Custom");
    }
  }

  let pendingOriginPattern = "";
  let pendingHostLabel = "";

  async function syncCustomHostPermissionButton() {
    if (!grantHostPermButton || !chrome?.storage?.local || !chrome?.permissions?.contains) return;
    try {
      const data = await chrome.storage.local.get([PENDING_PERM_STORAGE_KEY]);
      const pending = data?.[PENDING_PERM_STORAGE_KEY];
      const rawPattern = String(pending?.originPattern || "").trim();
      const rawOrigin = rawPattern.replace(/\/\*$/, "");
      const candidatePattern = rawPattern
        ? protocol?.getOriginPattern
          ? protocol.getOriginPattern(rawOrigin) || ""
          : rawPattern
        : "";

      if (!candidatePattern) {
        pendingOriginPattern = "";
        pendingHostLabel = "";
        grantHostPermButton.classList.add("hidden");
        return;
      }

      const alreadyGranted = await chrome.permissions.contains({ origins: [candidatePattern] });
      if (alreadyGranted) {
        pendingOriginPattern = "";
        pendingHostLabel = "";
        await chrome.storage.local.remove([PENDING_PERM_STORAGE_KEY]).catch(() => {});
        grantHostPermButton.classList.add("hidden");
        return;
      }

      pendingOriginPattern = candidatePattern;
      // L4: derive display label strictly from normalized candidatePattern rather than raw storage text
      pendingHostLabel = formatHostFromPattern(candidatePattern);
      grantHostPermButton.textContent = `Izinkan Akses ${pendingHostLabel}`;
      grantHostPermButton.classList.remove("hidden");
    } catch {
      pendingOriginPattern = "";
      pendingHostLabel = "";
      grantHostPermButton.classList.add("hidden");
    }
  }

  let activeSiteMode = "other";

  async function initContext() {
    if (!chrome?.tabs?.query) return;
    try {
      const tab = await getActiveTab();
      const parsed = parseTabUrl(tab?.url);
      const isHttps = parsed?.protocol === "https:";
      const host = parsed?.hostname || "";
      const path = parsed?.pathname || "";
      const routeStr = getRouteString(parsed);
      const isMentari = isHttps && host === "mentari.unpam.ac.id" && !isLoginPath(path);
      const isMyUnpam = isHttps && host === "my.unpam.ac.id" && !isLoginPath(path);
      const isKuisioner =
        (isMentari && KUESIONER_PATH_RE.test(routeStr)) ||
        (isMyUnpam && MY_UNPAM_SURVEY_RE.test(routeStr));

      if (isMentari) activeSiteMode = "mentari";
      else if (isMyUnpam) activeSiteMode = "myunpam";
      else activeSiteMode = "other";

      if (pageBadge) {
        if (isKuisioner) {
          pageBadge.textContent = "Kuesioner";
          pageBadge.className = "badge kui";
        } else if (isMentari) {
          pageBadge.textContent = "MENTARI";
          pageBadge.className = "badge active";
        } else if (isMyUnpam) {
          pageBadge.textContent = "my.unpam";
          pageBadge.className = "badge my";
        } else {
          pageBadge.textContent = "Non-UNPAM";
          pageBadge.className = "badge";
        }
      }

      if (kuisionerButton) {
        kuisionerButton.classList.toggle("hidden", !(isMentari || isMyUnpam));
      }
      if (quickLinks) {
        quickLinks.classList.toggle("hidden", isMentari || isMyUnpam);
      }

      await syncCustomHostPermissionButton();
    } catch {
      if (pageBadge) pageBadge.textContent = "Siap";
    }
  }

  if (grantHostPermButton) {
    grantHostPermButton.addEventListener("click", async () => {
      if (!pendingOriginPattern || !chrome?.permissions?.request) return;
      grantHostPermButton.disabled = true;
      try {
        const granted = await chrome.permissions.request({ origins: [pendingOriginPattern] });
        if (granted) {
          await chrome.storage?.local?.remove([PENDING_PERM_STORAGE_KEY]).catch(() => {});
          grantHostPermButton.classList.add("hidden");
          setStatus(
            `Izin akses ${pendingHostLabel || pendingOriginPattern} diberikan. Silakan simpan ulang konfigurasi API.`,
            "ok"
          );
        } else {
          setStatus(`Izin akses ${pendingHostLabel || pendingOriginPattern} ditolak.`, "error");
        }
      } catch (err) {
        setStatus(err?.message || "Gagal meminta izin host.", "error");
      } finally {
        grantHostPermButton.disabled = false;
      }
    });
  }

  if (runButton) {
    runButton.addEventListener("click", async () => {
      if (!chrome?.tabs?.query || !chrome?.runtime?.sendMessage) {
        setStatus("API ekstensi tidak tersedia.", "error");
        return;
      }

      runButton.disabled = true;
      setStatus("Membuka panel...");

      try {
        const tab = await getActiveTab();
        if (!tab || typeof tab.id !== "number") {
          setStatus("Tab aktif tidak ditemukan.", "error");
          return;
        }

        if (tab.url) {
          const parsed = parseTabUrl(tab.url);
          const isMentari = parsed?.protocol === "https:" && parsed?.hostname === "mentari.unpam.ac.id";
          const isLogin = isLoginPath(parsed?.pathname);
          if (!isMentari || isLogin) {
            setStatus("Buka halaman HTTPS MENTARI (sudah login) terlebih dahulu.", "error");
            return;
          }
        }

        await sendPopupAction(tab, "toggle-panel");
        setStatus("Popup Mentari Mod dijalankan.", "ok");
        setTimeout(() => window.close(), 180);
      } catch (err) {
        const msg = err?.message ? String(err.message) : "Gagal menjalankan panel.";
        setStatus(msg, "error");
      } finally {
        runButton.disabled = false;
      }
    });
  }

  if (kuisionerButton) {
    kuisionerButton.addEventListener("click", async () => {
      kuisionerButton.disabled = true;
      try {
        const tab = await getActiveTab();
        if (!tab || typeof tab.id !== "number") {
          setStatus("Tab aktif tidak ditemukan.", "error");
          return;
        }
        const parsed = parseTabUrl(tab.url);
        const host = parsed?.hostname || "";
        const isHttps = parsed?.protocol === "https:";
        const isLogin = isLoginPath(parsed?.pathname);
        if (!isHttps || isLogin || (host !== "mentari.unpam.ac.id" && host !== "my.unpam.ac.id")) {
          setStatus("Buka halaman HTTPS MENTARI atau my.unpam (sudah login) terlebih dahulu.", "error");
          return;
        }
        const isMyUnpam = host === "my.unpam.ac.id" || activeSiteMode === "myunpam";
        await sendPopupAction(tab, isMyUnpam ? "run-quicksurvey" : "run-kuesioner");
        setStatus("Isi otomatis kuesioner dijalankan.", "ok");
        setTimeout(() => window.close(), 180);
      } catch (err) {
        setStatus(err?.message || "Gagal menjalankan kuesioner.", "error");
      } finally {
        kuisionerButton.disabled = false;
      }
    });
  }

  openSettingsButton?.addEventListener("click", () => {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (chrome?.tabs?.create && chrome?.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
    }
    window.close();
  });

  openMentariButton?.addEventListener("click", () => {
    chrome?.tabs?.create?.({ url: "https://mentari.unpam.ac.id" });
    window.close();
  });

  openMyUnpamButton?.addEventListener("click", () => {
    chrome?.tabs?.create?.({ url: "https://my.unpam.ac.id" });
    window.close();
  });

  initContext();
})();
