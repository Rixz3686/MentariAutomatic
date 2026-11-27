(() => {
  "use strict";

  if (window.__mentariHomeV2Loaded) return;
  window.__mentariHomeV2Loaded = true;

  const CARD_ID = "mentari-info-floating";
  const STYLE_ID = "mm-home-style";

  const STARRY_SURFACE = [
    "radial-gradient(1px 1px at 14% 22%, rgba(243, 240, 255, 0.72) 50%, transparent 100%)",
    "radial-gradient(1.5px 1.5px at 82% 16%, rgba(221, 214, 254, 0.62) 50%, transparent 100%)",
    "radial-gradient(1px 1px at 46% 64%, rgba(243, 240, 255, 0.45) 50%, transparent 100%)",
    "radial-gradient(ellipse at 86% 0%, rgba(124, 58, 237, 0.32) 0%, transparent 56%)",
    "linear-gradient(135deg, #0B071C 0%, #1F1247 52%, #3B187A 100%)",
  ].join(", ");

  const HOME_CSS = `
    @keyframes mm-in { from { opacity:0; transform:translateY(8px) scale(.98); } to { opacity:1; transform:none; } }

    .MuiDrawer-paperAnchorRight.MuiDrawer-paper {
      background:
        radial-gradient(1px 1px at 10% 8%, rgba(243, 240, 255, 0.55) 50%, transparent 100%),
        radial-gradient(1.5px 1.5px at 88% 12%, rgba(221, 214, 254, 0.5) 50%, transparent 100%),
        radial-gradient(ellipse at 90% 0%, rgba(124, 58, 237, 0.22) 0%, transparent 45%),
        #0D091F !important;
      color: #F3F0FF !important;
      height: 95% !important;
      top: 4% !important;
      width: 420px !important;
      padding: 28px 26px !important;
      border: 1px solid rgba(167, 139, 250, 0.28) !important;
      border-radius: 16px !important;
      box-shadow: 0 24px 64px rgba(4, 2, 12, 0.68) !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
    }
    .MuiDrawer-paperAnchorRight.MuiDrawer-paper::-webkit-scrollbar { width: 6px; }
    .MuiDrawer-paperAnchorRight.MuiDrawer-paper::-webkit-scrollbar-thumb { background: rgba(167, 139, 250, 0.38); border-radius: 10px; }

    @media (max-width: 600px) {
      .MuiDrawer-paperAnchorRight.MuiDrawer-paper {
        width: 95% !important;
        height: 92% !important;
        top: 4% !important;
        left: 2.5% !important;
        right: 2.5% !important;
        transform: none !important;
        padding: 24px 20px !important;
        border-radius: 16px !important;
        margin: 10px auto !important;
      }
    }

    .MuiDivider-root { display: none !important; }

    .MuiTypography-h4 {
      font-size: 26px !important;
      font-weight: 700 !important;
      color: #F3F0FF !important;
      letter-spacing: -0.5px !important;
      line-height: 1.2 !important;
      text-transform: none !important;
      border-left: none !important;
      padding-left: 0 !important;
      margin-bottom: 6px !important;
    }
    .mm-tagline {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #A78BFA;
      margin-top: 6px;
      letter-spacing: 0.2px;
    }
    .MuiTypography-subtitle1 {
      font-size: 12.5px !important;
      color: #C4B5FD !important;
      font-weight: 400 !important;
      line-height: 1.55 !important;
      margin-bottom: 24px !important;
      padding-left: 0 !important;
      opacity: 1 !important;
    }

    .MuiFormControl-root { margin-bottom: 12px !important; }
    .MuiInputLabel-root {
      color: #C4B5FD !important;
      font-weight: 500 !important;
      font-size: 12px !important;
      letter-spacing: 0.2px !important;
      text-transform: none !important;
      margin-left: 0 !important;
    }
    .MuiInputLabel-root.Mui-focused { color: #DDD6FE !important; }

    .MuiOutlinedInput-root {
      background: #15102E !important;
      border-radius: 10px !important;
      border: 1px solid rgba(167, 139, 250, 0.28) !important;
      box-shadow: none !important;
      transform: none !important;
      transition: border-color .2s ease, box-shadow .2s ease !important;
    }
    .MuiOutlinedInput-root fieldset { border: none !important; }
    .MuiOutlinedInput-root:hover {
      border-color: #A78BFA !important;
    }
    .MuiOutlinedInput-root.Mui-focused {
      background: #1A1338 !important;
      border-color: #8B5CF6 !important;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.28) !important;
    }
    .MuiOutlinedInput-input { color: #F3F0FF !important; font-size: 13.5px !important; }
    .MuiOutlinedInput-input::placeholder { color: #8B80B8 !important; opacity: 1 !important; }
    .MuiOutlinedInput-input:-webkit-autofill {
      -webkit-text-fill-color: #F3F0FF !important;
      box-shadow: 0 0 0 100px #15102E inset !important;
      caret-color: #F3F0FF;
    }
    .MuiOutlinedInput-adornedEnd .MuiIconButton-root,
    .MuiOutlinedInput-adornedEnd .MuiSvgIcon-root { color: #C4B5FD !important; }

    div:has(> iframe[src*="cloudflare"]) {
      background: #15102E !important;
      border: 1px dashed rgba(167, 139, 250, 0.4) !important;
      border-radius: 12px !important;
      padding: 10px !important;
      margin: 18px 0 !important;
    }
    iframe { width: 100% !important; height: 100% !important; border: none !important; }

    .MuiButton-containedPrimary {
      background: linear-gradient(135deg, #4C1D95, #7C3AED) !important;
      color: #FFFFFF !important;
      border-radius: 10px !important;
      height: 46px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      letter-spacing: 0.3px !important;
      text-transform: none !important;
      border: none !important;
      box-shadow: 0 8px 22px rgba(91, 33, 182, 0.42) !important;
      transition: filter .2s ease, box-shadow .2s ease, transform .2s ease !important;
    }
    .MuiButton-containedPrimary:hover {
      filter: brightness(1.1);
      box-shadow: 0 10px 26px rgba(124, 58, 237, 0.5) !important;
      transform: translateY(-1px) !important;
    }
    .MuiButton-containedPrimary:disabled {
      background: #1E1742 !important;
      color: #9E94C9 !important;
      box-shadow: none !important;
    }

    .MuiTypography-caption { color: #C4B5FD !important; }
    .MuiTypography-caption a {
      color: #A78BFA !important;
      font-weight: 600 !important;
      text-decoration: none !important;
    }
    .MuiTypography-caption a:hover { text-decoration: underline !important; }

    .mm-bg { filter: brightness(0.28) saturate(1.25) hue-rotate(12deg); }

    #${CARD_ID} {
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: 272px;
      z-index: 9999;
      background: #0D091F;
      color: #F3F0FF;
      border: 1px solid rgba(167, 139, 250, 0.28);
      border-radius: 16px;
      box-shadow: 0 20px 56px rgba(4, 2, 12, 0.65);
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      overflow: hidden;
      animation: mm-in .25s ease-out;
    }
    #${CARD_ID} .mm-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: ${STARRY_SURFACE};
      color: #FFFFFF;
      border-bottom: 1px solid rgba(167, 139, 250, 0.22);
    }
    #${CARD_ID} .mm-logo {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: #C4B5FD;
      background: #15102E;
      border: 1px solid rgba(167, 139, 250, 0.35);
      box-shadow: 0 6px 14px rgba(4, 2, 12, 0.4);
      flex-shrink: 0;
    }
    #${CARD_ID} .mm-name { font-weight: 700; font-size: 13.5px; color: #FFFFFF; }
    #${CARD_ID} .mm-ver { font-size: 11px; color: #DDD6FE; margin-top: 1px; }
    #${CARD_ID} .mm-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
    #${CARD_ID} .mm-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    #${CARD_ID} .mm-k { color: #8B80B8; font-weight: 500; font-size: 11.5px; }
    #${CARD_ID} .mm-v { color: #F3F0FF; font-weight: 600; font-size: 12px; }
    #${CARD_ID} .mm-v a { color: #A78BFA; text-decoration: none; }
    #${CARD_ID} .mm-v a:hover { text-decoration: underline; }
    @media (max-width: 900px) {
      #${CARD_ID} { display: none !important; }
    }
  `;

  let bgReplaced = false;
  let headingUpdated = false;
  let rafScheduled = false;
  let bodyObs = null;

  function isLoginPath() {
    return /^\/login(?:\/|$)/i.test(String(location.pathname || ""));
  }

  function cleanupIfNotLogin() {
    if (isLoginPath()) return false;
    if (bodyObs) {
      bodyObs.disconnect();
      bodyObs = null;
    }
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CARD_ID)?.remove();
    return true;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = HOME_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function enhanceLoginDom() {
    if (cleanupIfNotLogin()) return;
    const heroImg = document.querySelector('img[src*="PersonLearn"]');
    if (heroImg && heroImg.style.display !== "none") {
      heroImg.style.display = "none";
    }

    const title = document.querySelector(".MuiTypography-h4");
    if (title) {
      if (title.textContent?.includes("Selamat Datang")) {
        title.innerHTML = 'Mentari Mod<span class="mm-tagline">v3.0 Revised &bull; Tuning by Rixz</span>';
      }
      if (title.querySelector(".mm-tagline")) headingUpdated = true;
    }

    const subtitle = document.querySelector(".MuiTypography-subtitle1");
    if (subtitle && subtitle.textContent?.includes("Silakan masuk")) {
      subtitle.textContent =
        "Ekstensi pembelajaran MENTARI UNPAM dengan tema Deep Starry Galaxy Space Purple.";
    }

    document.querySelectorAll(".MuiTypography-caption").forEach((el) => {
      const txt = el.textContent || "";
      if (
        (txt.includes("Panduan Penggunaan") || txt.includes("Mahasiswa login") || txt.includes("Dosen login")) &&
        el.style.display !== "none"
      ) {
        el.style.display = "none";
      }
    });

    if (!bgReplaced) {
      const bgImg = document.querySelector('img[src*="Background-"]');
      if (bgImg) {
        try {
          if (typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function") {
            bgImg.src = chrome.runtime.getURL("src/assets/background.webp");
          }
        } catch {
          // ignore
        }
        Object.assign(bgImg.style, {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        });
        bgImg.classList.add("mm-bg");
        bgReplaced = true;
      }
    }

    if (document.querySelector("form") && !document.getElementById(CARD_ID)) {
      const card = document.createElement("div");
      card.id = CARD_ID;
      card.innerHTML = `
        <div class="mm-head">
          <div class="mm-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"/>
              <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>
            </svg>
          </div>
          <div>
            <div class="mm-name">Mentari Mod</div>
            <div class="mm-ver">v3.0 Revised &bull; Tuning by Rixz</div>
          </div>
        </div>
        <div class="mm-body">
          <div class="mm-row">
            <span class="mm-k">Project</span>
            <span class="mm-v">Mentari Mod v3.0</span>
          </div>
          <div class="mm-row">
            <span class="mm-k">Tema</span>
            <span class="mm-v">Deep Starry Galaxy</span>
          </div>
          <div class="mm-row">
            <span class="mm-k">Tuning</span>
            <span class="mm-v">Rixz</span>
          </div>
          <div class="mm-row">
            <span class="mm-k">Fork Base</span>
            <span class="mm-v"><a href="https://github.com/alfinasinaja" target="_blank" rel="noopener">Alfinas Sandi</a></span>
          </div>
        </div>
      `;
      document.body.appendChild(card);
    }

    document.getElementById("mentari-info-top")?.remove();
    document.getElementById("mentari-info-footer")?.remove();

    const h5 = document.querySelector(".MuiTypography-root.MuiTypography-h5");
    if (h5 && h5.style.lineHeight !== "0.334") {
      h5.style.lineHeight = "0.334";
    }

    if (bgReplaced && headingUpdated && document.getElementById(CARD_ID) && bodyObs) {
      bodyObs.disconnect();
      bodyObs = null;
    }
  }

  function scheduleEnhance() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      enhanceLoginDom();
    });
  }

  function start() {
    if (cleanupIfNotLogin()) return;
    injectStyle();
    enhanceLoginDom();
    if (document.body && !(bgReplaced && headingUpdated && document.getElementById(CARD_ID))) {
      bodyObs = new MutationObserver(scheduleEnhance);
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.addEventListener("popstate", cleanupIfNotLogin);
  window.navigation?.addEventListener?.("navigatesuccess", cleanupIfNotLogin);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
