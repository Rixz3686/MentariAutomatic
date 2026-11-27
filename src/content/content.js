(() => {
  "use strict";

  if (window.__mentariContentV2Loaded || /^\/login(?:\/|$)/i.test(location.pathname)) return;
  window.__mentariContentV2Loaded = true;

  const HEADER_BTN_ID = "mentari-header-toggle";
  const PET_WRAP_ID = "mentari-developer-changelog";
  const PET_FRAME_ID = "mentari-pet-frame";
  const STYLE_ID = "mentari-content-v2-style";

  let lastRosterJson = "";
  let syncRaf = false;
  let rosterRetryTimer = null;
  let rosterRetryCount = 0;
  let petFrameEl = null;
  let petFrameReady = false;
  let petOrigin = "";
  const MAX_ROSTER_RETRIES = 20;
  const EXPECTED_PET_ORIGIN = (() => {
    try {
      if (typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function") {
        const origin = new URL(chrome.runtime.getURL("pet.html")).origin;
        return origin && origin !== "null" ? origin : "";
      }
    } catch {
      // Ignore
    }
    return "";
  })();

  function isDashboardPath() {
    const path = String(location.pathname || "/").toLowerCase();
    return path === "/" || path === "/home" || path === "/dashboard";
  }

  function clearRosterRetry() {
    if (rosterRetryTimer) {
      clearTimeout(rosterRetryTimer);
      rosterRetryTimer = null;
    }
    rosterRetryCount = 0;
  }

  function injectHeaderStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HEADER_BTN_ID} {
        margin-right: 8px;
        padding: 8px;
        background-color: transparent;
        border: 0;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        outline: 0;
        color: #8B5CF6;
        cursor: pointer;
        transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      #${HEADER_BTN_ID}.light-theme {
        color: #5B21B6;
      }
      #${HEADER_BTN_ID}:hover {
        background-color: rgba(124, 58, 237, 0.14);
      }
      #${HEADER_BTN_ID}:focus-visible {
        outline: 2px solid #7C3AED;
        outline-offset: 2px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanCourseName(raw) {
    const base = String(raw || "");
    return (
      base
        .split("#")[0]
        .replace(/^\[\d+\]\s*/, "")
        .replace(/\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]/g, "")
        .trim() || base.trim()
    );
  }

  function titleCaseName(raw) {
    return String(raw || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase())
      .slice(0, 60);
  }

  function detectContext() {
    const path = location.pathname;
    const heading = document.querySelector("h1, h2");
    const titleText = `${document.title} ${heading?.textContent || ""}`;
    let page = "other";
    if (/\/(quiz|exam)\//i.test(path)) page = "quiz";
    else if (/\/forum\//i.test(path)) page = "forum";
    else if (/kuesioner/i.test(path) || /kuesioner/i.test(titleText)) page = "kuesioner";
    else if (/\/u-courses\//i.test(path)) page = "course";

    let quizKind = null;
    if (page === "quiz") {
      const sample = [
        titleText,
        ...[...document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span")].slice(0, 100).map((n) => n.textContent || ""),
      ].join(" ");
      if (/post\s*-?\s*test/i.test(sample)) quizKind = "POST_TEST";
      else if (/pre\s*-?\s*test/i.test(sample)) quizKind = "PRE_TEST";
    }
    return { page, quizKind };
  }

  function computePending(courses) {
    const pending = { quiz: false, forum: false, kuesioner: false };
    for (const course of courses) {
      if (!course || String(course.kode_course || "").toUpperCase().includes("PKKMB")) continue;
      for (const sec of course.data || []) {
        for (const sub of sec.sub_section || []) {
          if (sub.completion === true) continue;
          if (["PRE_TEST", "POST_TEST"].includes(sub.kode_template) && sub.id) pending.quiz = true;
          else if (sub.kode_template === "FORUM_DISKUSI" && sub.id) pending.forum = true;
          else if (sub.kode_template === "KUESIONER" || sub.tipe === "QUESIONER") pending.kuesioner = true;
        }
      }
    }
    return pending;
  }

  function buildRoster(courses) {
    const filtered = courses
      .filter((c) => c && c.kode_course && !String(c.kode_course).toUpperCase().includes("PKKMB"))
      .map((c) => {
        const peserta = (Array.isArray(c.peserta) ? c.peserta : []).filter((p) => p && p.nim);
        return {
          code: String(c.kode_course),
          name: cleanCourseName(c.coursename),
          peserta,
          count: new Set(peserta.map((p) => p.nim)).size,
        };
      })
      .sort((a, b) => b.count - a.count);

    const seenNim = new Set();
    const classes = [];
    const students = [];
    for (const item of filtered) {
      classes.push({ code: item.code, name: item.name, count: item.count });
      for (const p of item.peserta) {
        if (seenNim.has(p.nim)) continue;
        seenNim.add(p.nim);
        students.push({ name: titleCaseName(p.nama_mahasiswa), code: item.code });
      }
    }
    return { classes, students };
  }

  function syncPetRoster(force = false) {
    const frame = document.getElementById(PET_FRAME_ID);
    const win = frame?.contentWindow;
    if (!frame || !win || !petFrameReady || frame !== petFrameEl) return false;

    let targetOrigin = petOrigin || EXPECTED_PET_ORIGIN;
    if (!targetOrigin || (EXPECTED_PET_ORIGIN && targetOrigin !== EXPECTED_PET_ORIGIN)) {
      return false;
    }

    let courses = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("mentari_course_data") || "[]");
      if (Array.isArray(parsed)) courses = parsed;
    } catch {
      courses = [];
    }

    const roster = buildRoster(courses);
    const context = { ...detectContext(), pending: computePending(courses) };
    const serialized = JSON.stringify({ ...roster, context });
    if (force || serialized !== lastRosterJson) {
      lastRosterJson = serialized;
      const payload = { type: "mentari-roster", ...roster, context };
      try {
        win.postMessage(payload, targetOrigin);
      } catch {
        return false;
      }
    }
    return roster.classes.length > 0;
  }

  function ensureRosterSynced() {
    if (!petFrameReady) return;
    if (syncPetRoster(true)) {
      clearRosterRetry();
      return;
    }
    if (rosterRetryTimer || rosterRetryCount >= MAX_ROSTER_RETRIES) return;
    const scheduleNext = () => {
      if (rosterRetryCount >= MAX_ROSTER_RETRIES) {
        rosterRetryTimer = null;
        return;
      }
      rosterRetryTimer = setTimeout(() => {
        rosterRetryTimer = null;
        rosterRetryCount += 1;
        if (syncPetRoster(true)) {
          clearRosterRetry();
          return;
        }
        scheduleNext();
      }, 700);
    };
    scheduleNext();
  }

  function ensureHeaderToggle() {
    if (document.getElementById(HEADER_BTN_ID)) return;
    const themeIcon = document.querySelector('svg[data-testid="DarkModeIcon"], svg[data-testid="LightModeIcon"]');
    if (!themeIcon) return;

    const themeBtn = themeIcon.closest("button");
    const stack = themeIcon.closest(".MuiStack-root");
    if (!stack || !themeBtn) return;

    injectHeaderStyle();
    const btn = document.createElement("button");
    btn.id = HEADER_BTN_ID;
    btn.type = "button";
    btn.className = "MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeMedium";
    btn.title = "Mentari Mod v3.0 Revised • Tuning by Rixz";
    btn.setAttribute("aria-label", "Buka Panel Mentari Mod");
    btn.classList.toggle("light-theme", document.querySelector(".css-1yxmbwk") !== null);
    btn.innerHTML = `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium" focusable="false" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      globalThis.MentariFetchGuard?.notifyPopupOpened?.();
      if (typeof window.toggleTokenPopup === "function") {
        window.toggleTokenPopup();
      }
    });
    stack.insertBefore(btn, themeBtn);
  }

  function ensurePetPlayground() {
    if (!isDashboardPath()) return;
    if (document.getElementById(PET_WRAP_ID)) return;
    const heading = [...document.querySelectorAll("h6, h5, h4, h3, h2, h1")].find((el) => {
      const t = (el.textContent || "").trim().toLowerCase();
      return t === "courses" || t.includes("course") || t.includes("mata kuliah");
    });
    if (!heading) return;

    const anchor = heading.closest(".MuiGrid-root") || heading.parentElement?.parentElement;
    if (!anchor?.parentNode) return;

    const wrap = document.createElement("div");
    wrap.id = PET_WRAP_ID;
    wrap.style.cssText = "width:100%;margin:10px 0;box-sizing:border-box;";

    let petUrl = "pet.html";
    try {
      if (typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function") {
        petUrl = chrome.runtime.getURL("pet.html");
      }
    } catch {
      // ignore
    }

    const card = document.createElement("div");
    card.style.cssText =
      "width:100%;box-sizing:border-box;overflow:hidden;border-radius:16px;border:1px solid rgba(124,58,237,0.28);box-shadow:0 10px 28px rgba(15,11,30,0.12);";
    const iframe = document.createElement("iframe");
    iframe.id = PET_FRAME_ID;
    iframe.src = petUrl;
    iframe.title = "Mentari Playground v3.0 Revised • Tuning by Rixz";
    iframe.style.cssText = "width:100%;height:360px;border:none;display:block;overflow:hidden;";
    petFrameEl = iframe;
    petFrameReady = false;
    petOrigin = "";
    lastRosterJson = "";
    clearRosterRetry();
    iframe.addEventListener(
      "load",
      () => {
        if (iframe !== petFrameEl || petFrameReady) return;
        try {
          const origin = new URL(iframe.src).origin;
          if (EXPECTED_PET_ORIGIN && origin === EXPECTED_PET_ORIGIN) {
            petOrigin = origin;
            petFrameReady = true;
            ensureRosterSynced();
          }
        } catch {
          // wait for mentari-pet-ready
        }
      },
      { once: true }
    );
    card.appendChild(iframe);
    wrap.appendChild(card);

    anchor.parentNode.insertBefore(wrap, anchor);
  }

  function scheduleDomSync() {
    const hasBtn = Boolean(document.getElementById(HEADER_BTN_ID));
    const hasPet = Boolean(document.getElementById(PET_WRAP_ID));
    const needPet = isDashboardPath() && !hasPet;
    if (hasBtn && !needPet) return;
    if (syncRaf) return;
    syncRaf = true;
    requestAnimationFrame(() => {
      syncRaf = false;
      ensureHeaderToggle();
      if (isDashboardPath()) {
        ensurePetPlayground();
      }
    });
  }

  window.addEventListener("message", (e) => {
    if (!EXPECTED_PET_ORIGIN || e.origin !== EXPECTED_PET_ORIGIN) {
      return;
    }
    if (petFrameEl && e.source === petFrameEl.contentWindow && e.data?.type === "mentari-pet-ready") {
      petFrameReady = true;
      petOrigin = EXPECTED_PET_ORIGIN;
      ensureRosterSynced();
    }
  });

  window.addEventListener("mentari-courses-ready", () => {
    clearRosterRetry();
    syncPetRoster(true);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "mentari_course_data") {
      clearRosterRetry();
      syncPetRoster(true);
    }
  });
  window.addEventListener("popstate", () => syncPetRoster(false));
  window.navigation?.addEventListener?.("navigatesuccess", () => syncPetRoster(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncPetRoster(false);
  });

  function cleanupLoginArtifacts() {
    document.getElementById("mm-home-style")?.remove();
    document.getElementById("mentari-info-floating")?.remove();
  }

  function start() {
    cleanupLoginArtifacts();
    scheduleDomSync();
    if (document.body) {
      const obs = new MutationObserver(scheduleDomSync);
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
