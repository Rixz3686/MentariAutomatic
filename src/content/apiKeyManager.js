(() => {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const aiClient = root.MentariAiClient || null;

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (window.__MENTARI_API_KEY_MANAGER_LOADED__) {
    return;
  }
  window.__MENTARI_API_KEY_MANAGER_LOADED__ = true;

  const BANNER_ID = "route_apiKeyPrompt";
  const STYLE_ID = "route_api_styles";

  function isLoginRoute() {
    return /^\/login(?:\/|$)/i.test(String(location.pathname || ""));
  }

  function isExamRoute() {
    return /^\/exam\b/i.test(String(location.pathname || ""));
  }

  function openApiSettings() {
    document.getElementById(BANNER_ID)?.remove();
    aiClient?.openSettings?.().catch(() => {});
  }

  function injectPromptStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BANNER_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 100000;
        width: 320px;
        max-width: calc(100vw - 24px);
        background: #0D091F;
        color: #F3F0FF;
        border: 1px solid rgba(167, 139, 250, 0.36);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 20px 50px rgba(4, 2, 12, 0.68);
        font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      #${BANNER_ID} .rm-title {
        font-size: 13.5px;
        font-weight: 700;
        color: #FFFFFF;
        margin-bottom: 6px;
      }
      #${BANNER_ID} .rm-desc {
        font-size: 12px;
        line-height: 1.45;
        color: #C4B5FD;
        margin-bottom: 12px;
      }
      #${BANNER_ID} .rm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      #${BANNER_ID} .rm-btn {
        border: 1px solid rgba(167, 139, 250, 0.28);
        background: #15102E;
        color: #DDD6FE;
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #${BANNER_ID} .rm-btn.primary {
        border-color: transparent;
        background: linear-gradient(135deg, #4C1D95, #7C3AED);
        color: #FFFFFF;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showApiSetupReminder() {
    if (isLoginRoute() || isExamRoute() || document.getElementById(BANNER_ID)) return;
    injectPromptStyles();

    const box = document.createElement("div");
    box.id = BANNER_ID;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Konfigurasi API AI");

    const title = document.createElement("div");
    title.className = "rm-title";
    title.textContent = "API Key AI Belum Diatur";

    const desc = document.createElement("div");
    desc.className = "rm-desc";
    desc.textContent =
      "Buka halaman pengaturan ekstensi untuk mengisi API key secara aman (tidak tersimpan di halaman web).";

    const actions = document.createElement("div");
    actions.className = "rm-actions";

    const laterBtn = document.createElement("button");
    laterBtn.type = "button";
    laterBtn.className = "rm-btn";
    laterBtn.textContent = "Nanti";
    laterBtn.addEventListener("click", () => box.remove());

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "rm-btn primary";
    openBtn.textContent = "Buka Pengaturan";
    openBtn.addEventListener("click", openApiSettings);

    actions.append(laterBtn, openBtn);
    box.append(title, desc, actions);
    (document.body || document.documentElement).appendChild(box);
  }

  aiClient?.onConfigChange?.((cfg) => {
    if (cfg?.hasApiKey) {
      document.getElementById(BANNER_ID)?.remove();
    }
  });

  async function initializeApiKeyManager() {
    if (isLoginRoute() || isExamRoute()) return null;
    const cfg = await aiClient?.getConfig?.();
    if (!cfg?.hasApiKey && !cfg?.apiKey) {
      setTimeout(() => {
        if (!isLoginRoute() && !isExamRoute()) {
          showApiSetupReminder();
        }
      }, 1500);
      return false;
    }
    return true;
  }

  const onReady = () => {
    setTimeout(() => {
      initializeApiKeyManager().catch(() => {});
    }, 1500);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
