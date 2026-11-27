(() => {
  "use strict";

  if (window.__mentariKuisionerV2Loaded) return;
  window.__mentariKuisionerV2Loaded = true;

  const KUESIONER_PATH_RE = /\/(kuesioner|kuisioner|quesioner|questionnaire|survey)(\/|$|\?)/i;
  const AUTO_SUBMIT_STORAGE_KEY = "mentari_kuesioner_autosubmit";
  const HUD_ID = "mentari-kuesioner-hud";
  const HUD_STYLE_ID = "mentari-kuesioner-hud-styles";
  const OWN_UI_SELECTOR = `#${HUD_ID}, #token-runner-popup, #route_apiKeyOverlay, #qh-panel`;

  let handledHref = "";
  let pendingHref = "";
  let activeRunId = 0;
  let countdownTimer = null;
  let activeAbort = null;
  let cancelWait = null;

  function cancelActiveRun() {
    activeRunId++;
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    if (typeof cancelWait === "function") {
      const fn = cancelWait;
      cancelWait = null;
      fn();
    }
    handledHref = "";
    pendingHref = "";
    removeHud();
  }

  function getSolver() {
    return globalThis.MentariKuisionerSolver || null;
  }

  function getCurrentRoutePath() {
    const hashPath = location.hash ? `/${location.hash.replace(/^#\/?/, "")}` : "";
    return `${location.pathname || ""}${hashPath}`;
  }

  function isKuesionerRoute() {
    return KUESIONER_PATH_RE.test(getCurrentRoutePath());
  }

  function isAutoSubmitEnabled() {
    try {
      const saved = localStorage.getItem(AUTO_SUBMIT_STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  }

  function setAutoSubmitEnabled(enabled) {
    try {
      localStorage.setItem(AUTO_SUBMIT_STORAGE_KEY, String(Boolean(enabled)));
    } catch {
      // ignore storage errors
    }
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function removeHud() {
    clearCountdown();
    document.getElementById(HUD_ID)?.remove();
  }

  function injectHudStyles() {
    if (document.getElementById(HUD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HUD_STYLE_ID;
    style.textContent = `
      #${HUD_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 99999;
        width: 310px;
        max-width: calc(100vw - 24px);
        padding: 12px 14px;
        border-radius: 14px;
        background:
          radial-gradient(1px 1px at 14% 18%, rgba(243, 240, 255, 0.7) 50%, transparent 100%),
          radial-gradient(1.5px 1.5px at 86% 22%, rgba(221, 214, 254, 0.58) 50%, transparent 100%),
          radial-gradient(ellipse at 85% 0%, rgba(124, 58, 237, 0.24) 0%, transparent 55%),
          #0D091F;
        border: 1px solid rgba(167, 139, 250, 0.3);
        box-shadow: 0 18px 46px rgba(4, 2, 12, 0.62);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #F3F0FF;
        font-size: 12px;
        line-height: 1.4;
      }
      #${HUD_ID} .mk-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      #${HUD_ID} .mk-title {
        font-weight: 700;
        font-size: 13px;
        color: #F3F0FF;
      }
      #${HUD_ID} .mk-badge {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        background: rgba(124, 58, 237, 0.24);
        color: #DDD6FE;
        border: 1px solid rgba(167, 139, 250, 0.38);
      }
      #${HUD_ID} .mk-badge.ai {
        background: rgba(34, 197, 94, 0.16);
        color: #86EFAC;
        border-color: rgba(74, 222, 128, 0.35);
      }
      #${HUD_ID} .mk-badge.err {
        background: rgba(239, 68, 68, 0.18);
        color: #FCA5A5;
        border-color: rgba(248, 113, 113, 0.38);
      }
      #${HUD_ID} .mk-msg {
        color: #C4B5FD;
        margin-bottom: 8px;
      }
      #${HUD_ID} .mk-warn {
        font-size: 11px;
        color: #FCD34D;
        margin-bottom: 8px;
      }
      #${HUD_ID} .mk-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      #${HUD_ID} button {
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      #${HUD_ID} .mk-btn-primary {
        background: linear-gradient(135deg, #4C1D95, #7C3AED);
        color: #FFFFFF;
      }
      #${HUD_ID} .mk-btn-secondary {
        background: #1E1742;
        color: #DDD6FE;
      }
      #${HUD_ID} .mk-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(167, 139, 250, 0.18);
        font-size: 11px;
        color: #C4B5FD;
        cursor: pointer;
        user-select: none;
      }
      #${HUD_ID} .mk-toggle input[type="checkbox"] {
        accent-color: #7C3AED;
        cursor: pointer;
      }
      #${HUD_ID} .mk-credit {
        margin-top: 6px;
        text-align: center;
        font-size: 10px;
        font-weight: 600;
        color: #8B80B8;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function renderHud({
    badgeText,
    badgeKind = "",
    message,
    warning,
    showSubmitControls,
    countdownSec,
    onCancel,
    onSubmitNow,
    onRefill,
    openUrl,
  }) {
    injectHudStyles();
    let hud = document.getElementById(HUD_ID);
    if (!hud) {
      hud = document.createElement("div");
      hud.id = HUD_ID;
      (document.body || document.documentElement).appendChild(hud);
    }

    hud.textContent = "";

    const top = document.createElement("div");
    top.className = "mk-top";
    const title = document.createElement("span");
    title.className = "mk-title";
    title.textContent = "Smart Kuesioner";
    const badge = document.createElement("span");
    badge.className = `mk-badge${badgeKind ? ` ${badgeKind}` : ""}`;
    badge.textContent = badgeText;
    top.append(title, badge);
    hud.appendChild(top);

    const msgEl = document.createElement("div");
    msgEl.className = "mk-msg";
    msgEl.textContent = message;
    hud.appendChild(msgEl);

    if (warning) {
      const warnEl = document.createElement("div");
      warnEl.className = "mk-warn";
      warnEl.textContent = warning;
      hud.appendChild(warnEl);
    }

    const actions = document.createElement("div");
    actions.className = "mk-actions";

    if (openUrl) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "mk-btn-primary";
      openBtn.textContent = "Buka Halaman Kuesioner";
      openBtn.onclick = () => {
        window.open(openUrl, "_blank", "noopener") || (location.href = openUrl);
      };
      actions.appendChild(openBtn);
    }

    if (showSubmitControls) {
      if (typeof countdownSec === "number" && countdownSec > 0) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "mk-btn-secondary";
        cancelBtn.textContent = `Batal (${countdownSec}d)`;
        cancelBtn.onclick = onCancel;
        actions.appendChild(cancelBtn);
      }

      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "mk-btn-primary";
      submitBtn.textContent = "Kirim Sekarang";
      submitBtn.onclick = onSubmitNow;
      actions.appendChild(submitBtn);
    }

    if (onRefill) {
      const refillBtn = document.createElement("button");
      refillBtn.type = "button";
      refillBtn.className = "mk-btn-secondary";
      refillBtn.textContent = "Isi Ulang";
      refillBtn.onclick = onRefill;
      actions.appendChild(refillBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mk-btn-secondary";
    closeBtn.textContent = "Tutup";
    closeBtn.onclick = removeHud;
    actions.appendChild(closeBtn);

    hud.appendChild(actions);

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "mk-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isAutoSubmitEnabled();
    checkbox.onchange = () => {
      setAutoSubmitEnabled(checkbox.checked);
      if (!checkbox.checked && countdownTimer) {
        if (typeof onCancel === "function") {
          onCancel();
        } else {
          clearCountdown();
        }
      }
    };
    const toggleText = document.createElement("span");
    toggleText.textContent = "Kirim otomatis setelah terisi";
    toggleLabel.append(checkbox, toggleText);
    hud.appendChild(toggleLabel);

    const credit = document.createElement("div");
    credit.className = "mk-credit";
    credit.textContent = "v3.0 Revised \u2022 Tuning by Rixz";
    hud.appendChild(credit);
  }

  function isPageElement(el) {
    return Boolean(el) && !el.closest(OWN_UI_SELECTOR);
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return false;
    }
    if (parseFloat(style.opacity) === 0) return false;
    if (el.offsetParent !== null) return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || style.position === "fixed";
  }

  function isRadioContainerVisible(radio) {
    const wrapper =
      radio.closest(".MuiFormControlLabel-root, label, [role='radio'], [role='radiogroup']") || radio;
    return isElementVisible(wrapper);
  }

  function isRadioDisabled(radio) {
    return Boolean(radio.disabled || radio.getAttribute("aria-disabled") === "true");
  }

  function isRadioChecked(radio) {
    if (typeof radio.checked === "boolean" && radio.checked) return true;
    return radio.getAttribute("aria-checked") === "true";
  }

  function collectPageRadios() {
    const out = [];
    const seen = new Set();

    for (const input of document.querySelectorAll('input[type="radio"]')) {
      if (!isPageElement(input) || !isRadioContainerVisible(input)) continue;
      seen.add(input);
      out.push(input);
    }

    for (const ariaRadio of document.querySelectorAll('[role="radio"]')) {
      if (!isPageElement(ariaRadio) || !isRadioContainerVisible(ariaRadio)) continue;
      const inner = ariaRadio.querySelector('input[type="radio"]');
      if (inner && seen.has(inner)) continue;
      out.push(ariaRadio);
    }

    return out;
  }

  function waitForPageRadios(timeoutMs = 6000, signal = null) {
    return new Promise((resolve) => {
      let done = false;
      let observer = null;
      let timer = null;
      let debounceTimer = null;

      const finish = (radios) => {
        if (done) return;
        done = true;
        observer?.disconnect();
        clearTimeout(timer);
        clearTimeout(debounceTimer);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (cancelWait === onAbort) cancelWait = null;
        resolve(radios);
      };

      const onAbort = () => finish([]);
      if (signal?.aborted) {
        resolve([]);
        return;
      }
      cancelWait = onAbort;
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      const settle = (prevCount, ticks = 0) => {
        if (done) return;
        const current = collectPageRadios();
        if (current.length > prevCount && ticks < 3) {
          debounceTimer = setTimeout(() => settle(current.length, ticks + 1), 160);
          return;
        }
        finish(current);
      };

      const existing = collectPageRadios();
      if (existing.length > 0) {
        debounceTimer = setTimeout(() => settle(existing.length, 0), 160);
        return;
      }

      observer = new MutationObserver(() => {
        const found = collectPageRadios();
        if (found.length > 0) {
          observer.disconnect();
          clearTimeout(timer);
          debounceTimer = setTimeout(() => settle(found.length, 0), 160);
        }
      });

      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      timer = setTimeout(() => settle(0, 3), timeoutMs);
    });
  }

  function extractOptionLabel(input) {
    const muiLabel = input.closest(".MuiFormControlLabel-root")?.querySelector(".MuiFormControlLabel-label");
    if (muiLabel?.textContent?.trim()) return muiLabel.textContent.trim();

    const parentLabel = input.closest("label");
    if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

    if (input.id && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      const forLabel = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
    }

    const aria = input.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();

    if (input.getAttribute("role") === "radio" && input.textContent?.trim()) {
      return input.textContent.trim();
    }

    const explicitVal = input.getAttribute("value");
    if (explicitVal && explicitVal.trim()) return explicitVal.trim();
    return String(input.dataset?.value || "").trim();
  }

  function extractQuestionText(radios) {
    const first = radios[0];
    if (!first) return "";

    const groupRoot = first.closest('[role="radiogroup"], .MuiFormGroup-root') || first.parentElement;
    let container = groupRoot;

    for (let depth = 0; depth < 4 && container?.parentElement; depth++) {
      const parent = container.parentElement;
      const groupCount = parent.querySelectorAll('[role="radiogroup"], .MuiFormGroup-root').length;
      if (groupCount > 1) break;
      container = parent;
      if (parent.matches(".MuiFormControl-root, fieldset, .MuiPaper-root, .MuiCard-root, li")) {
        break;
      }
    }

    if (!container) return "";

    const candidates = container.querySelectorAll(
      "legend, .MuiFormLabel-root, h1, h2, h3, h4, h5, h6, .MuiTypography-root, p"
    );
    for (const el of candidates) {
      if (el.closest('[role="radiogroup"], .MuiFormGroup-root, .MuiFormControlLabel-root')) continue;
      const text = el.textContent?.trim();
      if (text) return text.replace(/\s+/g, " ");
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll('[role="radiogroup"], .MuiFormGroup-root, label').forEach((el) => el.remove());
    return clone.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function splitRepeatingOptionChunks(groupRadios) {
    if (groupRadios.length <= 2) return [groupRadios];
    const chunks = [];
    let current = [];
    let seenLabels = new Set();

    for (const radio of groupRadios) {
      const norm = extractOptionLabel(radio).trim().toLowerCase();
      if (norm && seenLabels.has(norm) && current.length >= 2) {
        chunks.push(current);
        current = [radio];
        seenLabels = new Set([norm]);
      } else {
        if (norm) seenLabels.add(norm);
        current.push(radio);
      }
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  function extractQuestions(radios) {
    const groups = new Map();
    const groupIds = new WeakMap();
    let anonCounter = 0;

    const getElementKey = (prefix, node, suffix = "") => {
      let id = groupIds.get(node);
      if (!id) {
        id = ++anonCounter;
        groupIds.set(node, id);
      }
      return suffix ? `${prefix}:${id}:${suffix}` : `${prefix}:${id}`;
    };

    for (const radio of radios) {
      if (!isRadioContainerVisible(radio)) continue;
      const nameAttr = radio.getAttribute("name") || radio.name || "";
      const radioGroupEl = radio.closest('[role="radiogroup"], .MuiFormGroup-root');
      let key;

      if (radioGroupEl) {
        key = getElementKey("rg", radioGroupEl);
      } else {
        const controlEl = radio.closest(".MuiFormControl-root, fieldset");
        if (controlEl) {
          key = getElementKey("fc", controlEl, nameAttr);
        } else if (nameAttr) {
          key = `name:${nameAttr}`;
        } else {
          key = `single:${++anonCounter}`;
        }
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(radio);
    }

    const questions = [];
    let qIdx = 0;
    for (const rawGroup of groups.values()) {
      for (const groupRadios of splitRepeatingOptionChunks(rawGroup)) {
        if (groupRadios.every(isRadioDisabled)) continue;
        const options = groupRadios.map((input, optIdx) => {
          const label = extractOptionLabel(input);
          const hasExplicitVal =
            input.tagName === "INPUT"
              ? input.hasAttribute("value") && input.getAttribute("value") !== ""
              : input.value !== undefined && input.value !== "";
          const rawVal = hasExplicitVal
            ? String(input.value)
            : String(input.dataset?.value ?? (label || optIdx));
          return { input, value: rawVal, label: label || rawVal };
        });
        questions.push({
          index: qIdx++,
          question: extractQuestionText(groupRadios),
          options,
        });
      }
    }

    return questions;
  }

  function selectRadio(input) {
    if (!input || isRadioDisabled(input)) return false;
    if (isRadioChecked(input)) return true;

    const labelTarget = input.closest(".MuiFormControlLabel-root") || input.closest("label");
    if (labelTarget) {
      labelTarget.click();
      if (isRadioChecked(input)) return true;
    }

    input.click();
    if (isRadioChecked(input)) return true;

    if (input.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
      if (setter) setter.call(input, true);
      else input.checked = true;
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    } else {
      input.setAttribute("aria-checked", "true");
    }

    return isRadioChecked(input);
  }

  function fillRequiredTextFields() {
    const selector =
      'textarea[required], textarea[aria-required="true"], input[required]:not([type]), input[aria-required="true"]:not([type]), input[type="text"][required], input[type="text"][aria-required="true"], input[type="search"][required], input[type="search"][aria-required="true"]';
    const fields = document.querySelectorAll(selector);
    for (const field of fields) {
      if (!isPageElement(field) || !isElementVisible(field) || field.disabled || field.readOnly) continue;
      if (String(field.value || "").trim()) continue;
      const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      const defaultText = "Materi pembelajaran sudah jelas dan mudah dipahami.";
      if (setter) setter.call(field, defaultText);
      else field.value = defaultText;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function findSubmitButton() {
    const candidates = [...document.querySelectorAll('button, [role="button"]')].filter((el) => {
      if (!isPageElement(el) || !isElementVisible(el)) return false;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
      return true;
    });

    const exact = candidates.find((el) => /submit\s*kuesioner/i.test(el.textContent || ""));
    if (exact) return exact;

    return (
      candidates.find((el) => {
        const text = (el.textContent || "").trim();
        if (/^(submit|kirim|simpan)(\s+kuesioner)?$/i.test(text)) return true;
        return el.classList.contains("MuiButton-containedPrimary") && /submit|kirim/i.test(text);
      }) || null
    );
  }

  function clickSubmitButton(btn) {
    if (!btn) return false;
    btn.scrollIntoView({ behavior: "smooth", block: "center" });
    btn.click();
    return true;
  }

  async function runKuesionerFlow(targetHref, forceRun = false) {
    if (!forceRun && (handledHref === targetHref || pendingHref === targetHref)) return;

    if (activeAbort) {
      activeAbort.abort();
    }
    if (typeof cancelWait === "function") {
      const fn = cancelWait;
      cancelWait = null;
      fn();
    }

    const runId = ++activeRunId;
    const runAbort = typeof AbortController === "function" ? new AbortController() : null;
    activeAbort = runAbort;
    pendingHref = isKuesionerRoute() ? targetHref : "";
    clearCountdown();

    try {
      if (forceRun) {
        renderHud({
          badgeText: "Mencari...",
          message: "Memeriksa form kuesioner di halaman ini...",
          showSubmitControls: false,
        });
      }

      const radios = await waitForPageRadios(forceRun ? 2500 : 6000, runAbort?.signal);
      if (runId !== activeRunId || runAbort?.signal?.aborted) return;
      if (!forceRun && !isKuesionerRoute()) return;

      const questions = extractQuestions(radios);
      if (!questions.length) {
        if (forceRun) {
          renderHud({
            badgeText: "Kosong",
            badgeKind: "err",
            message:
              "Tidak ada pertanyaan kuesioner aktif di halaman ini. Buka halaman kuesioner atau klik tombol play di popup Mentari Mod.",
            showSubmitControls: false,
          });
        }
        return;
      }

      const solver = getSolver();
      if (!solver) {
        renderHud({
          badgeText: "Error",
          badgeKind: "err",
          message: "Modul solver kuesioner belum dimuat. Coba muat ulang halaman.",
          showSubmitControls: false,
        });
        return;
      }

      if (isKuesionerRoute()) {
        handledHref = targetHref;
      }

      renderHud({
        badgeText: "Menganalisis...",
        message: `Menganalisis ${questions.length} pertanyaan kuesioner...`,
        showSubmitControls: false,
        onRefill: () => runKuesionerFlow(location.href, true),
      });

      const solverInput = questions.map((q) => ({
        index: q.index,
        question: q.question,
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      }));

      const result = await solver.solveQuestions(solverInput, { signal: runAbort?.signal });
      if (runId !== activeRunId || runAbort?.signal?.aborted) return;
      if (!forceRun && !isKuesionerRoute()) return;

    let filledCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const ans = result.answers[i];
      if (!ans) continue;
      const targetOpt =
        questions[i].options.find((o) => o.value === String(ans.value)) ||
        questions[i].options.find(
          (o) => String(o.label).trim().toLowerCase() === String(ans.label || "").trim().toLowerCase()
        ) ||
        questions[i].options[0];
      if (targetOpt && selectRadio(targetOpt.input)) {
        filledCount++;
      }
    }

    fillRequiredTextFields();

    const submitBtn = findSubmitButton();
    const isAiMode = result.mode === "ai" || result.mode === "ai-partial";
    const badgeKind = isAiMode ? "ai" : "";
    const badgeText =
      result.mode === "default-ya"
        ? "Default Ya"
        : result.mode === "ai"
          ? "AI Aktif"
          : result.mode === "ai-partial"
            ? "AI + Lokal"
            : "Smart Lokal";
    const incompleteWarn =
      filledCount < questions.length
        ? `Hanya ${filledCount}/${questions.length} pertanyaan berhasil terisi. Auto-kirim dijeda agar bisa dicek manual.`
        : "";
    const aiWarn = result.aiError ? `AI tidak tersedia (${result.aiError}), memakai Smart Lokal.` : "";
    const warning = [incompleteWarn, aiWarn].filter(Boolean).join(" ");

    const submitNow = () => {
      clearCountdown();
      const btn = findSubmitButton() || submitBtn;
      if (clickSubmitButton(btn)) {
        renderHud({
          badgeText,
          badgeKind,
          message: `Terkirim (${filledCount}/${questions.length} pertanyaan).`,
          warning,
          showSubmitControls: false,
        });
      }
    };

    const canAutoSubmit = Boolean(submitBtn) && isAutoSubmitEnabled() && filledCount > 0 && filledCount === questions.length;
    if (!canAutoSubmit) {
      renderHud({
        badgeText,
        badgeKind,
        message: `${filledCount}/${questions.length} pertanyaan terisi otomatis.`,
        warning,
        showSubmitControls: Boolean(submitBtn),
        onSubmitNow: submitNow,
        onRefill: () => runKuesionerFlow(location.href, true),
      });
      return;
    }

    let remaining = 2;
    const cancelCountdown = () => {
      clearCountdown();
      renderHud({
        badgeText,
        badgeKind,
        message: `${filledCount}/${questions.length} pertanyaan terisi (auto-kirim dibatalkan).`,
        warning,
        showSubmitControls: true,
        onSubmitNow: submitNow,
        onRefill: () => runKuesionerFlow(location.href, true),
      });
    };

    const drawCountdown = () => {
      renderHud({
        badgeText,
        badgeKind,
        message: `${filledCount}/${questions.length} pertanyaan terisi. Mengirim dalam ${remaining}d...`,
        warning,
        showSubmitControls: true,
        countdownSec: remaining,
        onCancel: cancelCountdown,
        onSubmitNow: submitNow,
        onRefill: () => runKuesionerFlow(location.href, true),
      });
    };

    drawCountdown();
    countdownTimer = setInterval(() => {
      if (runId !== activeRunId) {
        clearCountdown();
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        submitNow();
      } else {
        drawCountdown();
      }
    }, 1000);
    } finally {
      if (activeAbort === runAbort) activeAbort = null;
      if (pendingHref === targetHref && !handledHref) pendingHref = "";
    }
  }

  // --- Unlock & smart-wire .kuesioner-submit-btn inside #token-runner-popup ---

  function extractJwtString(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.token && String(item.token).includes(".")) return String(item.token);
        }
      }
      if (parsed && typeof parsed === "object") {
        const candidate = parsed.token || parsed.access || parsed.jwt;
        if (candidate && String(candidate).includes(".")) return String(candidate);
      }
      if (typeof parsed === "string") {
        const cleaned = parsed.replace(/^Bearer\s+/i, "").trim();
        if (cleaned.split(".").length >= 2) return cleaned;
      }
    } catch {
      const cleaned = String(raw).replace(/^"|"$/g, "").replace(/^Bearer\s+/i, "").trim();
      if (cleaned.startsWith("eyJ") && cleaned.split(".").length >= 2) return cleaned;
    }
    return null;
  }

  function isJwtExpired(jwt) {
    try {
      const part = String(jwt || "").split(".")[1];
      if (!part) return false;
      const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return typeof payload?.exp === "number" && payload.exp * 1000 < Date.now() + 5000;
    } catch {
      return false;
    }
  }

  function readMentariJwt() {
    let expiredFallback = null;
    const candidates = [];

    try {
      for (const key of ["mentari_auth_token", "access", "token", "mentari_token"]) {
        const jwt = extractJwtString(localStorage.getItem(key));
        if (jwt) candidates.push(jwt);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key);
        if (!val) continue;
        if (key.toLowerCase().includes("token") || key.toLowerCase().includes("access") || val.includes("eyJ")) {
          const jwt = extractJwtString(val);
          if (jwt) candidates.push(jwt);
        }
      }
    } catch {
      return null;
    }

    for (const jwt of candidates) {
      if (!isJwtExpired(jwt)) return jwt;
      if (!expiredFallback) expiredFallback = jwt;
    }
    return expiredFallback;
  }

  async function safeParseJsonResponse(res, contextLabel) {
    if (res.status === 429) {
      throw new Error(
        `${contextLabel}: Server MENTARI sedang membatasi permintaan (HTTP 429). Tunggu 20-30 detik lalu coba lagi.`
      );
    }
    const raw = await res.text();
    if (/^\s*(?:<!doctype|<html)\b/i.test(raw)) {
      throw new Error(
        `${contextLabel}: Server mengembalikan halaman HTML (HTTP ${res.status}). Pastikan sesi login MENTARI aktif lalu muat ulang halaman.`
      );
    }
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${contextLabel}: Respons server bukan JSON valid (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      const serverMsg = data?.message || data?.error || `HTTP ${res.status}`;
      throw new Error(`${contextLabel}: ${serverMsg}`);
    }
    return data;
  }

  function normalizeApiOptions(item) {
    const rawOpts = item?.list_jawaban || item?.pilihan || item?.opsi || item?.options;
    if (Array.isArray(rawOpts) && rawOpts.length > 0) {
      return rawOpts.map((o, idx) => {
        if (o && typeof o === "object") {
          return {
            value: String(o.value ?? o.id ?? o.kode ?? idx + 1),
            label: String(o.label ?? o.jawaban ?? o.nama ?? o.text ?? o.value ?? idx + 1),
          };
        }
        return { value: String(o), label: String(o) };
      });
    }
    return [
      { value: "1", label: "Ya" },
      { value: "0", label: "Tidak" },
    ];
  }

  async function handlePopupKuesionerClick(btn) {
    if (activeAbort) activeAbort.abort();
    const clickAbort = typeof AbortController === "function" ? new AbortController() : null;
    activeAbort = clickAbort;
    const runId = ++activeRunId;
    clearCountdown();

    const courseCode = btn.dataset.courseCode;
    const sectionCode = btn.dataset.sectionCode;
    const solver = getSolver();
    if (!courseCode || !sectionCode || !solver) {
      throw new Error("Data course/section tidak lengkap.");
    }

    const jwt = readMentariJwt();
    if (!jwt) {
      throw new Error("Token login MENTARI tidak ditemukan. Muat ulang halaman lalu coba lagi.");
    }
    if (isJwtExpired(jwt)) {
      throw new Error("Sesi login MENTARI sudah kedaluwarsa. Muat ulang halaman lalu login ulang.");
    }

    renderHud({
      badgeText: "Memuat...",
      message: "Mengambil pertanyaan kuesioner dari server...",
      showSubmitControls: false,
    });

    const explicitFetch = globalThis.MentariFetchGuard?.fetchBypass
      ? (url, opts) => globalThis.MentariFetchGuard.fetchBypass(url, opts)
      : fetch;

    const encodedCourse = encodeURIComponent(courseCode);
    const encodedSection = encodeURIComponent(sectionCode);

    const getRes = await explicitFetch(
      `https://mentari.unpam.ac.id/api/kuesioner/${encodedCourse}/${encodedSection}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        signal: clickAbort?.signal,
      }
    );
    if (runId !== activeRunId || clickAbort?.signal?.aborted) return;
    const getData = await safeParseJsonResponse(getRes, "Gagal memuat kuesioner");
    if (runId !== activeRunId || clickAbort?.signal?.aborted) return;
    const list = getData?.kuesioner || getData?.data || [];
    if (!Array.isArray(list) || !list.length) {
      throw new Error("Pertanyaan kuesioner kosong atau sudah selesai.");
    }

    const solverInput = list.map((item, index) => ({
      index,
      question: String(
        item.pertanyaan || item.deskripsi || item.soal || item.nama || item.judul || item.question || ""
      ),
      options: normalizeApiOptions(item),
    }));

    const solved = await solver.solveQuestions(solverInput, { signal: clickAbort?.signal });
    if (runId !== activeRunId || clickAbort?.signal?.aborted) return;
    const kuesionerPayload = list.map((item, idx) => {
      const rawVal = solved.answers[idx]?.value ?? "1";
      const numVal = Number(rawVal);
      return {
        id_kuesioner: item.id,
        jawaban: Number.isFinite(numVal) && String(rawVal).trim() !== "" ? numVal : rawVal,
      };
    });

    renderHud({
      badgeText: "Mengirim...",
      message: `Mengirim ${list.length} jawaban kuesioner...`,
      showSubmitControls: false,
    });

    const postRes = await explicitFetch("https://mentari.unpam.ac.id/api/kuesioner/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        kode_section: sectionCode,
        kode_course: courseCode,
        kuesioner: kuesionerPayload,
      }),
      signal: clickAbort?.signal,
    });
    if (runId !== activeRunId || clickAbort?.signal?.aborted) return;
    await safeParseJsonResponse(postRes, "Gagal mengirim kuesioner");
    if (runId !== activeRunId || clickAbort?.signal?.aborted) return;

    const isAiMode = solved.mode === "ai" || solved.mode === "ai-partial";
    const modeLabel =
      solved.mode === "default-ya"
        ? "Default Ya"
        : solved.mode === "ai"
          ? "AI Aktif"
          : solved.mode === "ai-partial"
            ? "AI + Lokal"
            : "Smart Lokal";

    renderHud({
      badgeText: modeLabel,
      badgeKind: isAiMode ? "ai" : "",
      message: `Kuesioner berhasil diisi & dikirim (${list.length} soal).`,
      warning: solved.aiError ? `AI tidak tersedia (${solved.aiError}), memakai Smart Lokal.` : "",
      showSubmitControls: false,
    });

    btn.classList.add("done");
    btn.disabled = true;
    btn.textContent = "\u2713";
    btn.title = "Sudah Selesai";

    const row = btn.closest(".mt-item, .mt-act-row, li") || btn.parentElement?.parentElement;
    const todoChip = row?.querySelector(".mt-chip.todo");
    if (todoChip) {
      todoChip.classList.remove("todo");
      todoChip.classList.add("ok");
      todoChip.textContent = "Selesai";
    }
  }

  function bindPopupKuesionerButtons() {
    const popup = document.getElementById("token-runner-popup");
    if (!popup) return;

    if (popup.dataset.mkDelegated !== "1") {
      popup.dataset.mkDelegated = "1";
      popup.addEventListener(
        "click",
        async (e) => {
          const btn = e.target?.closest?.(".kuesioner-submit-btn");
          if (!btn || btn.classList.contains("done")) return;

          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          if (btn.dataset.mkBusy === "1") return;
          btn.dataset.mkBusy = "1";
          btn.disabled = true;
          const prevHtml = btn.innerHTML;
          btn.textContent = "...";

          try {
            await handlePopupKuesionerClick(btn);
          } catch (err) {
            btn.disabled = false;
            btn.innerHTML = prevHtml;
            const courseCode = btn.dataset.courseCode;
            const sectionCode = btn.dataset.sectionCode;
            const fallbackUrl =
              courseCode && sectionCode
                ? `https://mentari.unpam.ac.id/u-courses/${encodeURIComponent(courseCode)}/kuesioner/${encodeURIComponent(sectionCode)}`
                : "";
            renderHud({
              badgeText: "Gagal",
              badgeKind: "err",
              message: err?.message || "Gagal mengisi kuesioner.",
              showSubmitControls: false,
              openUrl: fallbackUrl,
            });
          } finally {
            btn.dataset.mkBusy = "0";
          }
        },
        true
      );
    }

    for (const btn of popup.querySelectorAll(".kuesioner-submit-btn")) {
      if (btn.classList.contains("done") || btn.dataset.mkBusy === "1") continue;
      btn.onclick = null;
      btn.disabled = false;
      btn.removeAttribute("disabled");
      btn.title = "Isi Kuesioner Otomatis (Smart)";
    }
  }

  let popupObserver = null;
  let observedPopupEl = null;
  let popupBindRaf = 0;

  function attachPopupObserver() {
    const popup = document.getElementById("token-runner-popup");
    if (!popup) return false;
    bindPopupKuesionerButtons();
    if (observedPopupEl !== popup) {
      popupObserver?.disconnect();
      observedPopupEl = popup;
      popupObserver = new MutationObserver(() => {
        if (popupBindRaf) return;
        popupBindRaf = requestAnimationFrame(() => {
          popupBindRaf = 0;
          bindPopupKuesionerButtons();
        });
      });
      popupObserver.observe(popup, { childList: true, subtree: true });
    }
    return true;
  }

  function ensurePopupObserver() {
    attachPopupObserver();
    if (document.body) {
      const bodyObserver = new MutationObserver(() => {
        const popup = document.getElementById("token-runner-popup");
        if (popup && popup !== observedPopupEl) {
          attachPopupObserver();
        }
      });
      bodyObserver.observe(document.body, { childList: true });
    }
  }

  function onRouteMaybeChanged() {
    if (!isKuesionerRoute()) {
      if (handledHref || pendingHref || activeAbort || cancelWait || document.getElementById(HUD_ID)) {
        cancelActiveRun();
      }
      return;
    }
    if (location.href !== handledHref && location.href !== pendingHref) {
      runKuesionerFlow(location.href, false);
    }
  }

  // Secure extension-only command listener (prevents MAIN-world webpage spoofing)
  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (sender?.id !== chrome.runtime?.id || sender?.tab) return false;
      if (msg?.type === "mentari:run-kuesioner") {
        runKuesionerFlow(location.href, true);
        sendResponse?.({ ok: true });
        return false;
      }
      return false;
    });
  }

  window.addEventListener("popstate", onRouteMaybeChanged);
  window.addEventListener("hashchange", onRouteMaybeChanged);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onRouteMaybeChanged();
  });

  window.navigation?.addEventListener?.("navigatesuccess", onRouteMaybeChanged);
  window.navigation?.addEventListener?.("currententrychange", onRouteMaybeChanged);

  const init = () => {
    ensurePopupObserver();
    onRouteMaybeChanged();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
