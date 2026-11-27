(() => {
  "use strict";

  if (window.__mentariQuickSurveyV2Loaded) return;
  window.__mentariQuickSurveyV2Loaded = true;
  window.__MENTARI_QUICKSURVEY_LOADED__ = true;

  const TRIGGER_ID = "quickSurveyToggle";
  const CONTAINER_ID = "floatingButtonContainer";
  const POPUP_ROOT_ID = "quick-survey-popup-root";
  const STYLE_ID = "quick-survey-styles-v2";
  const TOAST_ID = "quick-survey-toast";

  const SURVEY_ROUTE_RE =
    globalThis.MentariAiProtocol?.MY_UNPAM_SURVEY_RE ||
    /\/(kuesioner|kuisioner|quesioner|questionnaire|survey|data-akademik\/khs)(\/|$|\?)/i;
  const NEXT_BTN_RE = /^(selanjutnya|berikutnya|next)$/i;
  const SAVE_BTN_RE = /^(simpan|submit|kirim|selesai|simpan\s+kuesioner)$/i;

  let isAutomating = false;
  let activeClosePopup = null;
  let activeFlowId = 0;
  let activeFlowAbort = null;

  function cancelActiveFlow() {
    activeFlowId++;
    if (activeFlowAbort) {
      activeFlowAbort.abort();
      activeFlowAbort = null;
    }
    isAutomating = false;
  }

  function showToast(message, isError = false, duration = 3500) {
    injectStyles();
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = isError ? "qs-toast err" : "qs-toast";
    toast.textContent = message;
    (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 99990;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #${TRIGGER_ID} {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        border: 1px solid rgba(167, 139, 250, 0.38);
        background: linear-gradient(135deg, #2E1065, #7C3AED);
        color: #fff;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 10px 26px rgba(4, 2, 12, 0.55);
        display: grid;
        place-items: center;
      }
      #${TRIGGER_ID}:hover { filter: brightness(1.1); }
      #${POPUP_ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 99995;
        background: rgba(8, 6, 20, 0.72);
        display: grid;
        place-items: center;
        padding: 16px;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      #${POPUP_ROOT_ID} .qs-card {
        width: 380px;
        max-width: 100%;
        background: #0D091F;
        border: 1px solid rgba(167, 139, 250, 0.3);
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(4, 2, 12, 0.68);
        overflow: hidden;
        color: #F3F0FF;
      }
      #${POPUP_ROOT_ID} .qs-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background:
          radial-gradient(1px 1px at 14% 24%, rgba(243, 240, 255, 0.75) 50%, transparent 100%),
          radial-gradient(1.5px 1.5px at 80% 18%, rgba(221, 214, 254, 0.62) 50%, transparent 100%),
          radial-gradient(ellipse at 85% 0%, rgba(124, 58, 237, 0.32) 0%, transparent 56%),
          linear-gradient(135deg, #0B071C, #1F1247 52%, #3B187A);
        color: #FFFFFF;
        border-bottom: 1px solid rgba(167, 139, 250, 0.22);
      }
      #${POPUP_ROOT_ID} .qs-title { font-weight: 700; font-size: 14px; color: #FFFFFF; }
      #${POPUP_ROOT_ID} .qs-close {
        border: 0;
        background: transparent;
        font-size: 18px;
        color: #DDD6FE;
        cursor: pointer;
      }
      #${POPUP_ROOT_ID} .qs-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
      #${POPUP_ROOT_ID} .qs-label { font-size: 11.5px; font-weight: 700; color: #C4B5FD; margin-bottom: 4px; }
      #${POPUP_ROOT_ID} .qs-stars { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
      #${POPUP_ROOT_ID} .qs-btn {
        border: 1px solid rgba(167, 139, 250, 0.24);
        background: #15102E;
        color: #F3F0FF;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      #${POPUP_ROOT_ID} .qs-btn:hover { background: #1E1742; border-color: #A78BFA; }
      #${POPUP_ROOT_ID} .qs-btn.primary {
        background: linear-gradient(135deg, #4C1D95, #7C3AED);
        color: #fff;
        border-color: transparent;
        text-align: center;
      }
      #${POPUP_ROOT_ID} .qs-star {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 8px 4px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      #${POPUP_ROOT_ID} .qs-star span { font-size: 9.5px; font-weight: 500; color: #8B80B8; }
      #${POPUP_ROOT_ID} .qs-foot {
        padding: 9px 16px 12px;
        border-top: 1px solid rgba(167, 139, 250, 0.16);
        font-size: 10.5px;
        font-weight: 600;
        color: #8B80B8;
        text-align: center;
      }
      .qs-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        padding: 10px 16px;
        border-radius: 999px;
        background: #0D091F;
        border: 1px solid rgba(167, 139, 250, 0.35);
        color: #F3F0FF;
        font: 600 12px "Segoe UI", system-ui, sans-serif;
        box-shadow: 0 12px 30px rgba(4, 2, 12, 0.55);
      }
      .qs-toast.err {
        background: #1C0D1D;
        border-color: rgba(248, 113, 113, 0.42);
        color: #FCA5A5;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse") {
      return false;
    }
    if (parseFloat(st.opacity) === 0) return false;
    if (el.offsetParent !== null) return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || st.position === "fixed";
  }

  function isRadioVisible(el) {
    const wrapper = el.closest('[role="radio"], .q-radio, label') || el;
    return isVisible(wrapper);
  }

  function collectSurveyGroups() {
    const groups = [];
    const seen = new Set();

    for (const rg of document.querySelectorAll('[role="radiogroup"]')) {
      if (rg.closest(`#${POPUP_ROOT_ID}, #${CONTAINER_ID}`) || !isVisible(rg)) continue;

      const radios = [];
      // Prefer [role="radio"] wrappers and deduplicate inner <input type="radio"> elements
      for (const roleRadio of rg.querySelectorAll('[role="radio"]')) {
        if (roleRadio.disabled || roleRadio.getAttribute("aria-disabled") === "true") continue;
        if (!isRadioVisible(roleRadio)) continue;
        seen.add(roleRadio);
        roleRadio.querySelectorAll('input[type="radio"]').forEach((inner) => seen.add(inner));
        radios.push(roleRadio);
      }

      for (const input of rg.querySelectorAll('input[type="radio"]')) {
        if (seen.has(input) || input.disabled || input.getAttribute("aria-disabled") === "true") continue;
        if (!isRadioVisible(input)) continue;
        seen.add(input);
        radios.push(input);
      }

      if (!radios.length) continue;
      groups.push({ root: rg, radios });
    }

    const byName = new Map();
    for (const input of document.querySelectorAll('input[type="radio"]')) {
      if (
        seen.has(input) ||
        input.closest(`#${POPUP_ROOT_ID}, #${CONTAINER_ID}`) ||
        input.disabled ||
        input.getAttribute("aria-disabled") === "true" ||
        !isRadioVisible(input)
      ) {
        continue;
      }
      const key = input.name || `__anon_${groups.length + byName.size}`;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(input);
    }
    for (const radios of byName.values()) {
      groups.push({ root: radios[0].closest("fieldset, .q-field, div") || radios[0].parentElement, radios });
    }

    return groups;
  }

  function extractGroupQuestion(root) {
    if (!root) return "";
    let container = root;
    for (let i = 0; i < 3 && container.parentElement; i++) {
      const parent = container.parentElement;
      if (parent.querySelectorAll('[role="radiogroup"]').length > 1) break;
      container = parent;
    }
    const clone = container.cloneNode(true);
    clone.querySelectorAll('[role="radiogroup"], [role="radio"]').forEach((n) => n.remove());
    return clone.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function extractRadioLabel(radio, idx) {
    const label =
      radio.getAttribute("aria-label") ||
      radio.querySelector(".q-radio__label")?.textContent ||
      radio.closest("label")?.textContent ||
      radio.textContent ||
      radio.getAttribute("value") ||
      `Opsi ${idx + 1}`;
    return String(label).replace(/\s+/g, " ").trim();
  }

  function pickStarIndex(len, star) {
    if (len <= 1) return 0;
    const clampedStar = Math.max(1, Math.min(5, Number(star) || 4));
    // Map star 1..5 proportionally across any option count len >= 2 with mild natural variance
    const center = ((clampedStar - 1) / 4) * (len - 1);
    const low = Math.floor(center);
    const high = Math.min(len - 1, Math.ceil(center));
    if (low === high) {
      if (clampedStar === 5 && len >= 3 && Math.random() < 0.25) return len - 2;
      if (clampedStar === 1 && len >= 3 && Math.random() < 0.25) return 1;
      return low;
    }
    const highWeight = center - low;
    return Math.random() < highWeight ? high : low;
  }

  function fillRequiredTextFields() {
    const selector =
      'textarea[required], textarea[aria-required="true"], input[required]:not([type]), input[aria-required="true"]:not([type]), input[type="text"][required], input[type="text"][aria-required="true"], input[type="search"][required], input[type="search"][aria-required="true"]';
    for (const field of document.querySelectorAll(selector)) {
      if (field.closest(`#${POPUP_ROOT_ID}, #${CONTAINER_ID}`) || !isVisible(field)) continue;
      if (field.disabled || field.readOnly || String(field.value || "").trim()) continue;
      const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      const defaultText = "Pembelajaran berjalan dengan baik dan jelas.";
      if (setter) setter.call(field, defaultText);
      else field.value = defaultText;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async function fillCurrentStep(mode, groups, signal, flowId) {
    if (mode === "smart" && globalThis.MentariKuisionerSolver) {
      const input = groups.map((g, index) => ({
        index,
        question: extractGroupQuestion(g.root),
        options: g.radios.map((r, oIdx) => ({
          value: String(oIdx),
          label: extractRadioLabel(r, oIdx),
        })),
      }));
      const solved = await globalThis.MentariKuisionerSolver.solveQuestions(input, { signal });
      if (flowId !== activeFlowId || signal?.aborted || !isSurveyRoute()) {
        return { cancelled: true, mode: solved.mode, aiError: solved.aiError || null };
      }
      groups.forEach((g, idx) => {
        const chosenIdx = Number(solved.answers[idx]?.value ?? 0);
        const target = g.radios[chosenIdx] || g.radios[0];
        if (target?.isConnected) target.click();
      });
      fillRequiredTextFields();
      return { mode: solved.mode, aiError: solved.aiError || null };
    }

    for (const g of groups) {
      const radios = g.radios;
      if (!radios.length) continue;
      let chosen = radios[0];
      if (mode === "Setuju") {
        chosen = radios[Math.min(2, radios.length - 1)];
      } else if (mode === "Random") {
        const pool = radios.length >= 4 ? [1, 2, 2, 3, 3] : [Math.max(0, radios.length - 1)];
        chosen = radios[pool[Math.floor(Math.random() * pool.length)]];
      } else if (mode.startsWith("star")) {
        chosen = radios[pickStarIndex(radios.length, parseInt(mode.slice(4), 10) || 4)];
      } else {
        chosen = radios[Math.floor(Math.random() * radios.length)];
      }
      if (chosen?.isConnected) chosen.click();
    }
    fillRequiredTextFields();
    return { mode, aiError: null };
  }

  function findActionButton(regex) {
    const btns = [...document.querySelectorAll('button, [role="button"]')].filter((el) => {
      if (el.closest(`#${POPUP_ROOT_ID}, #${CONTAINER_ID}`) || !isVisible(el)) return false;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      return true;
    });
    return (
      btns.find((b) => {
        const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
        return regex.test(txt);
      }) || null
    );
  }

  function getStepSignature(groups) {
    const list = groups || collectSurveyGroups();
    return list.map((g) => extractGroupQuestion(g.root).slice(0, 40)).join("|");
  }

  function waitForStepAdvance(prevSignature, maxMs = 1200, signal = null) {
    return new Promise((resolve) => {
      let settled = false;
      let rafId = 0;
      const done = (advanced) => {
        if (settled) return;
        settled = true;
        if (rafId) cancelAnimationFrame(rafId);
        observer.disconnect();
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(advanced);
      };
      const onAbort = () => done(false);
      if (signal?.aborted) {
        resolve(false);
        return;
      }
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const check = () => {
        rafId = 0;
        if (getStepSignature() !== prevSignature) {
          setTimeout(() => done(true), 60);
        }
      };
      const observer = new MutationObserver(() => {
        if (settled || rafId) return;
        rafId = requestAnimationFrame(check);
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      const timer = setTimeout(() => {
        done(getStepSignature() !== prevSignature);
      }, maxMs);
    });
  }

  async function automateFlow(mode) {
    if (isAutomating) {
      showToast("Pengisian kuesioner masih berjalan...", false, 2000);
      return;
    }

    const initialGroups = collectSurveyGroups();
    if (!initialGroups.length) {
      showToast('Buka form "Isi Kuesioner" pada mata kuliah di halaman KHS terlebih dahulu.', true, 4000);
      return;
    }

    isAutomating = true;
    const flowId = ++activeFlowId;
    const flowAbort = typeof AbortController === "function" ? new AbortController() : null;
    activeFlowAbort = flowAbort;
    let lastAiError = null;
    let lastMode = mode;
    let stallCount = 0;

    try {
      for (let step = 1; step <= 30; step++) {
        if (flowId !== activeFlowId || flowAbort?.signal?.aborted || !isSurveyRoute()) return;

        const groups = collectSurveyGroups();
        if (!groups.length) {
          const finalSaveBtn = findActionButton(SAVE_BTN_RE);
          if (finalSaveBtn && isSurveyRoute() && finalSaveBtn.isConnected) {
            fillRequiredTextFields();
            finalSaveBtn.click();
            showToast("Kuesioner selesai diisi & dikirim!", false, 3500);
            return;
          }
          break;
        }

        showToast(`Mengisi halaman kuesioner ${step}...`, false, 2000);
        const prevSig = getStepSignature(groups);
        const stepRes = await fillCurrentStep(mode, groups, flowAbort?.signal, flowId);
        if (stepRes?.cancelled || flowId !== activeFlowId || flowAbort?.signal?.aborted || !isSurveyRoute()) {
          return;
        }
        if (stepRes?.mode) lastMode = stepRes.mode;
        if (stepRes?.aiError) lastAiError = stepRes.aiError;

        const nextBtn = findActionButton(NEXT_BTN_RE);
        if (nextBtn && nextBtn.isConnected) {
          nextBtn.click();
          const advanced = await waitForStepAdvance(prevSig, 1200, flowAbort?.signal);
          if (flowId !== activeFlowId || flowAbort?.signal?.aborted || !isSurveyRoute()) return;
          if (!advanced) {
            stallCount++;
            if (stallCount >= 2) {
              showToast(
                "Halaman kuesioner tidak berpindah. Periksa apakah ada field wajib yang belum terisi.",
                true,
                4200
              );
              return;
            }
          } else {
            stallCount = 0;
          }
          continue;
        }

        const saveBtn = findActionButton(SAVE_BTN_RE);
        if (flowId !== activeFlowId || flowAbort?.signal?.aborted || !isSurveyRoute()) return;
        const modeNote =
          lastMode === "ai"
            ? " (AI)"
            : lastMode === "ai-partial"
              ? " (AI+Lokal)"
              : lastAiError
                ? " (Lokal - AI error)"
                : "";
        if (saveBtn && saveBtn.isConnected) {
          saveBtn.click();
          showToast(`Kuesioner selesai diisi & dikirim${modeNote}!`, false, 3500);
        } else {
          showToast(`Kuesioner selesai diisi${modeNote}!`, false, 3500);
        }
        return;
      }
    } finally {
      if (activeFlowAbort === flowAbort) {
        activeFlowAbort = null;
      }
      if (flowId === activeFlowId) {
        isAutomating = false;
      }
    }
  }

  function closeExistingPopup() {
    if (typeof activeClosePopup === "function") {
      activeClosePopup();
      activeClosePopup = null;
    } else {
      document.getElementById(POPUP_ROOT_ID)?.remove();
    }
  }

  function createQuickSurveyPopup() {
    injectStyles();
    closeExistingPopup();

    const root = document.createElement("div");
    root.id = POPUP_ROOT_ID;
    root.innerHTML = `
      <div class="qs-card" role="dialog" aria-modal="true" aria-label="Quick Survey">
        <div class="qs-head">
          <div class="qs-title">Quick Survey</div>
          <button class="qs-close" id="qs-close-btn" type="button" aria-label="Tutup">&times;</button>
        </div>
        <div class="qs-body">
          <button class="qs-btn primary" id="opt-smart" type="button">
            Isi Otomatis Cerdas (Sesuai Pertanyaan)
          </button>
          <div>
            <div class="qs-label">Penilaian Kinerja Dosen</div>
            <div class="qs-stars">
              <button class="qs-btn qs-star" data-v="star1" type="button">1<span>Buruk</span></button>
              <button class="qs-btn qs-star" data-v="star2" type="button">2<span>Kurang</span></button>
              <button class="qs-btn qs-star" data-v="star3" type="button">3<span>Cukup</span></button>
              <button class="qs-btn qs-star" data-v="star4" type="button">4<span>Baik</span></button>
              <button class="qs-btn qs-star" data-v="star5" type="button">5<span>Sangat</span></button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div class="qs-label">Opsi Cepat</div>
            <button class="qs-btn" id="opt-all-good" type="button">Pilih Semua "Setuju"</button>
            <button class="qs-btn" id="opt-random-safe" type="button">Random (Aman)</button>
            <button class="qs-btn" id="opt-chaos" type="button">Acak Total</button>
          </div>
        </div>
        <div class="qs-foot">v3.0 Revised &bull; Tuning by Rixz</div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(root);

    const onEsc = (e) => {
      if (e.key === "Escape") closePopup();
    };
    const closePopup = () => {
      document.removeEventListener("keydown", onEsc);
      root.remove();
      if (activeClosePopup === closePopup) activeClosePopup = null;
    };
    activeClosePopup = closePopup;
    document.addEventListener("keydown", onEsc);

    root.onclick = (e) => {
      if (e.target === root) closePopup();
    };
    document.getElementById("qs-close-btn").onclick = closePopup;
    document.getElementById("opt-smart").onclick = () => {
      closePopup();
      automateFlow("smart");
    };
    root.querySelectorAll(".qs-star").forEach((btn) => {
      btn.onclick = () => {
        closePopup();
        automateFlow(btn.dataset.v);
      };
    });
    const map = {
      "opt-all-good": "Setuju",
      "opt-random-safe": "Random",
      "opt-chaos": "FullRandom",
    };
    Object.entries(map).forEach(([id, mode]) => {
      document.getElementById(id).onclick = () => {
        closePopup();
        automateFlow(mode);
      };
    });
  }

  function createToggle() {
    injectStyles();
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      (document.body || document.documentElement).appendChild(container);
    }
    if (document.getElementById(TRIGGER_ID)) return;

    const btn = document.createElement("button");
    btn.id = TRIGGER_ID;
    btn.type = "button";
    btn.title = "Quick Survey Otomatis v3.0 Revised • Tuning by Rixz";
    btn.setAttribute("aria-label", "Buka Quick Survey Otomatis");
    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    btn.onclick = () => createQuickSurveyPopup();
    container.appendChild(btn);
  }

  function isSurveyRoute() {
    const hashPath = location.hash ? `/${location.hash.replace(/^#\/?/, "")}` : "";
    return SURVEY_ROUTE_RE.test(`${location.pathname || ""}${hashPath}`);
  }

  function checkRoute() {
    if (isSurveyRoute()) {
      createToggle();
    } else {
      cancelActiveFlow();
      closeExistingPopup();
      document.getElementById(TRIGGER_ID)?.remove();
      const container = document.getElementById(CONTAINER_ID);
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    }
  }

  // Secure extension-only command listener (prevents MAIN-world webpage spoofing)
  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (sender?.id !== chrome.runtime?.id || sender?.tab) return false;
      if (msg?.type === "mentari:run-quicksurvey") {
        if (collectSurveyGroups().length > 0) {
          automateFlow("smart");
        } else {
          createQuickSurveyPopup();
        }
        sendResponse?.({ ok: true });
        return false;
      }
      return false;
    });
  }

  window.addEventListener("popstate", checkRoute);
  window.addEventListener("hashchange", checkRoute);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkRoute();
  });

  window.navigation?.addEventListener?.("navigatesuccess", checkRoute);
  window.navigation?.addEventListener?.("currententrychange", checkRoute);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkRoute, { once: true });
  } else {
    checkRoute();
  }
})();
