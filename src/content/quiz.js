(() => {
  "use strict";

  if (window.__mentariQuizHelperLoaded) return;
  window.__mentariQuizHelperLoaded = true;

  const EXAM_PATH_RE = /\/exam\/([^/?#]+)/i;
  const AUTOFILL_STORAGE_KEY = "mentari_quiz_autofill";
  const PANEL_HEIGHT_STORAGE_KEY = "mentari_quiz_panel_height";
  const MIN_PANEL_HEIGHT = 300;
  const DEFAULT_MAX_PANEL_HEIGHT = 540;
  const OWN_UI_SEL =
    "#qh-panel, #qh-launcher, #qh-toast, #token-runner-popup, #route_apiKeyOverlay, #mentari-kuesioner-hud";
  const VIEW_MODE = { RINGKAS: 1, STANDAR: 2, DETAIL: 3 };
  const POLL_BACKOFF_MS = [1500, 3000, 6000, 10000];

  const ICONS = {
    sparkles:
      '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    refresh:
      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  };

  function ico(name, size = 14) {
    const span = document.createElement("span");
    span.className = "qh-ico";
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
    return span;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "style") node.style.cssText = v;
      else if (k === "class") node.className = v;
      else if (k === "disabled") node.disabled = Boolean(v);
      else if (k === "checked") node.checked = Boolean(v);
      else if (k === "on") {
        for (const [evt, fn] of Object.entries(v)) {
          node.addEventListener(evt, fn);
        }
      } else {
        node.setAttribute(k, v);
      }
    }
    for (const child of children.flat()) {
      if (child != null && child !== false) {
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    }
    return node;
  }

  const skelLines = (widths) =>
    widths.map((w, idx) => el("div", { class: `qh-skel${idx === 0 ? " first" : ""}`, style: `width:${w}` }));

  function injectStyles() {
    if (document.getElementById("qh-style")) return;
    (document.head || document.documentElement).appendChild(
      el(
        "style",
        { id: "qh-style" },
        `
    @keyframes qh-in { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:none; } }
    @keyframes qh-up { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
    @keyframes qh-spin { to { transform:rotate(360deg); } }
    @keyframes qh-shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }

    #qh-panel, #qh-panel * { box-sizing:border-box; }
    #qh-panel {
      position:fixed; z-index:10000; top:20px; right:20px; width:392px; max-width:calc(100vw - 32px);
      max-height:calc(100vh - 24px); display:flex; flex-direction:column;
      background:#0D091F;
      color:#F3F0FF; border:1px solid rgba(167, 139, 250, 0.28); border-radius:16px;
      box-shadow:0 24px 64px rgba(4, 2, 12, 0.65);
      font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; font-size:13px;
      overflow:hidden; animation:qh-in .22s ease-out;
    }
    #qh-panel.minimized { height:auto !important; }
    #qh-panel.qh-resizing { user-select:none !important; }
    #qh-panel .qh-header {
      flex-shrink:0;
      display:flex; justify-content:space-between; align-items:center; gap:10px;
      padding:12px 12px 12px 14px;
      background:
        radial-gradient(1px 1px at 14% 24%, rgba(243,240,255,0.75) 50%, transparent 100%),
        radial-gradient(1.5px 1.5px at 80% 20%, rgba(221,214,254,0.65) 50%, transparent 100%),
        radial-gradient(1px 1px at 44% 72%, rgba(243,240,255,0.5) 50%, transparent 100%),
        radial-gradient(ellipse at 85% 0%, rgba(124,58,237,0.34) 0%, transparent 58%),
        linear-gradient(135deg,#0B071C,#1F1247 52%,#3B187A);
      color:#FFFFFF;
      border-bottom:1px solid rgba(167, 139, 250, 0.22); cursor:move; user-select:none;
    }
    #qh-panel .qh-brand { display:flex; align-items:center; gap:10px; min-width:0; }
    #qh-panel .qh-logo {
      width:32px; height:32px; border-radius:10px; display:grid; place-items:center; color:#C4B5FD;
      background:#15102E; border:1px solid rgba(167, 139, 250, 0.35); box-shadow:0 6px 16px rgba(4, 2, 12, 0.45); flex-shrink:0;
    }
    #qh-panel .qh-title { font-weight:650; font-size:13.5px; letter-spacing:.1px; color:#FFFFFF; }
    #qh-panel .qh-sub { font-size:11px; color:#DDD6FE; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px; }
    #qh-panel .qh-header-actions { display:flex; gap:4px; }
    #qh-panel .qh-icon-btn {
      width:28px; height:28px; border-radius:8px; border:0; background:transparent; color:#DDD6FE;
      display:grid; place-items:center; cursor:pointer;
    }
    #qh-panel .qh-icon-btn:hover { background:rgba(167, 139, 250, 0.2); color:#FFFFFF; }
    #qh-panel .qh-content {
      flex:1 1 auto; min-height:0; padding:12px 14px; overflow-y:auto;
      display:flex; flex-direction:column; gap:10px;
    }
    #qh-panel .qh-content::-webkit-scrollbar { width:6px; }
    #qh-panel .qh-content::-webkit-scrollbar-thumb { background:rgba(167, 139, 250, 0.4); border-radius:10px; }
    #qh-panel .qh-progress { background:#15102E; border:1px solid rgba(167, 139, 250, 0.18); border-radius:12px; padding:10px 12px; }
    #qh-panel .qh-progress-top { display:flex; justify-content:space-between; font-size:12px; margin-bottom:7px; color:#C4B5FD; font-variant-numeric:tabular-nums; }
    #qh-panel .qh-track { height:6px; background:#241B4B; border-radius:99px; overflow:hidden; }
    #qh-panel .qh-bar { height:100%; background:linear-gradient(90deg,#5B21B6,#8B5CF6,#C4B5FD); transition:width .25s ease; }
    #qh-panel .qh-notice {
      display:flex; gap:8px; align-items:flex-start; padding:9px 11px; border-radius:10px;
      background:rgba(124, 58, 237, 0.16); border:1px solid rgba(167, 139, 250, 0.28); color:#DDD6FE; font-size:11.5px; line-height:1.4;
    }
    #qh-panel .qh-notice.err {
      background:rgba(239, 68, 68, 0.14); border-color:rgba(248, 113, 113, 0.36); color:#FCA5A5;
    }
    #qh-panel .qh-toolbar { display:flex; flex-direction:column; gap:8px; }
    #qh-panel .qh-row { display:flex; gap:8px; }
    #qh-panel .qh-btn {
      flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px;
      padding:8px 10px; border-radius:10px; border:1px solid rgba(167, 139, 250, 0.28);
      background:#15102E; color:#EDE9FE; font-size:12px; font-weight:600; cursor:pointer;
    }
    #qh-panel .qh-btn:hover:not(:disabled) { background:#1E1742; border-color:#A78BFA; }
    #qh-panel .qh-btn.primary { background:linear-gradient(135deg,#4C1D95,#7C3AED); color:#fff; border-color:transparent; }
    #qh-panel .qh-btn:disabled { opacity:.55; cursor:not-allowed; }
    #qh-panel .qh-autofill-row {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:6px 10px; border-radius:9px; background:#15102E; border:1px solid rgba(167, 139, 250, 0.18);
      font-size:11.5px; color:#C4B5FD; cursor:pointer; user-select:none;
    }
    #qh-panel .qh-autofill-row input[type="checkbox"] { accent-color:#7C3AED; cursor:pointer; }
    #qh-panel .qh-seg { display:flex; padding:3px; border-radius:10px; background:#15102E; border:1px solid rgba(167, 139, 250, 0.16); gap:3px; }
    #qh-panel .qh-seg button {
      flex:1; border:0; background:transparent; padding:6px 8px; border-radius:8px;
      font-size:11.5px; font-weight:600; color:#C4B5FD; cursor:pointer;
    }
    #qh-panel .qh-seg button.active { background:#7C3AED; color:#FFFFFF; box-shadow:0 2px 8px rgba(4,2,12,.35); }
    #qh-panel .qh-card {
      background:#15102E; border:1px solid rgba(167, 139, 250, 0.18); border-radius:12px; padding:11px 12px;
      display:flex; flex-direction:column; gap:8px;
    }
    #qh-panel .qh-card-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    #qh-panel .qh-num { font-weight:700; font-size:12px; color:#A78BFA; font-variant-numeric:tabular-nums; }
    #qh-panel .qh-credit {
      flex-shrink:0;
      display:flex; flex-direction:column; align-items:center; gap:5px;
      border-top:1px solid rgba(167, 139, 250, 0.16);
      padding:7px 14px 6px;
      font-size:10px;
      font-weight:600;
      color:#8B80B8;
      text-align:center;
      background:#0A0718;
      cursor:ns-resize;
      user-select:none;
      touch-action:none;
    }
    #qh-panel .qh-resize-grip {
      width:38px; height:4px; border-radius:99px;
      background:rgba(167, 139, 250, 0.42);
      transition:background-color .15s ease, width .15s ease;
    }
    #qh-panel .qh-credit:hover .qh-resize-grip,
    #qh-panel .qh-credit:focus-visible .qh-resize-grip,
    #qh-panel.qh-resizing .qh-resize-grip {
      background:#A78BFA; width:52px;
    }
    #qh-panel.minimized .qh-credit { cursor:default; padding-bottom:7px; }
    #qh-panel.minimized .qh-resize-grip { display:none; }
    #qh-panel .qh-chip {
      display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:99px;
      font-size:11px; font-weight:600; background:#1E1742; color:#C4B5FD;
    }
    #qh-panel .qh-chip.ok { background:rgba(34, 197, 94, 0.16); color:#4ADE80; }
    #qh-panel .qh-chip.ok.fb { background:rgba(245, 158, 11, 0.2); color:#FDE68A; }
    #qh-panel .qh-spin { width:10px; height:10px; border-radius:50%; border:2px solid rgba(196, 181, 253, 0.35); border-top-color:#A78BFA; animation:qh-spin .7s linear infinite; }
    #qh-panel .qh-question { font-size:12.5px; line-height:1.45; color:#F3F0FF; white-space:pre-wrap; }
    #qh-panel .qh-opt {
      display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:8px;
      border:1px solid rgba(167, 139, 250, 0.14); font-size:12px; color:#C4B5FD;
    }
    #qh-panel .qh-opt.ans { background:rgba(34, 197, 94, 0.14); border-color:rgba(74, 222, 128, 0.45); color:#DCFCE7; font-weight:600; }
    #qh-panel .qh-opt-letter { font-weight:700; min-width:16px; }
    #qh-panel .qh-opt-text { flex:1; }
    #qh-panel .qh-short { display:flex; align-items:center; gap:6px; font-size:12px; color:#4ADE80; font-weight:600; }
    #qh-panel .qh-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    #qh-panel .qh-foot .qh-btn { flex:0 0 auto; padding:6px 12px; }
    #qh-panel .qh-link {
      border:0; background:transparent; color:#A78BFA; font-size:11.5px; font-weight:600;
      display:inline-flex; align-items:center; gap:4px; cursor:pointer; padding:0;
    }
    #qh-panel .qh-chev { display:inline-flex; transition:transform .15s ease; }
    #qh-panel .qh-chev.up { transform:rotate(180deg); }
    #qh-panel .qh-reason {
      padding:8px 10px; border-radius:8px; background:#1A1338; border:1px solid rgba(167, 139, 250, 0.22);
      font-size:11.5px; line-height:1.45; color:#C4B5FD;
    }
    #qh-panel .qh-reason-title { font-weight:700; color:#DDD6FE; margin-bottom:2px; font-size:11px; }
    #qh-panel .qh-state { text-align:center; padding:18px 8px; display:flex; flex-direction:column; align-items:center; gap:8px; }
    #qh-panel .qh-ring { width:26px; height:26px; border-radius:50%; border:3px solid rgba(196, 181, 253, 0.25); border-top-color:#8B5CF6; animation:qh-spin .8s linear infinite; }
    #qh-panel .qh-state-title { font-weight:700; font-size:13.5px; color:#F3F0FF; }
    #qh-panel .qh-state-msg { font-size:12px; color:#8B80B8; max-width:290px; }
    #qh-panel .qh-skel-list { width:100%; display:flex; flex-direction:column; gap:8px; margin-top:6px; }
    #qh-panel .qh-skel {
      height:10px; border-radius:6px;
      background:linear-gradient(90deg,#15102E 25%,#241B4B 50%,#15102E 75%);
      background-size:200% 100%; animation:qh-shimmer 1.4s linear infinite;
    }
    #qh-panel .qh-skel.first { margin-top:0; }

    #qh-launcher {
      position:fixed; right:20px; bottom:20px; z-index:10000; display:none; align-items:center; gap:7px;
      padding:9px 15px; border-radius:99px; border:1px solid rgba(167, 139, 250, 0.35);
      background:linear-gradient(135deg,#1F1247,#5B21B6 55%,#7C3AED); color:#fff;
      font:600 12px Inter,system-ui,sans-serif; box-shadow:0 10px 25px rgba(4, 2, 12, 0.5); cursor:pointer;
    }
    #qh-launcher:hover { filter:brightness(1.08); }

    #qh-toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:10001;
      display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:99px;
      background:#0D091F; border:1px solid rgba(167, 139, 250, 0.35); color:#F3F0FF;
      font:500 12px Inter,system-ui,sans-serif; box-shadow:0 12px 30px rgba(4, 2, 12, 0.55);
      max-width:90vw; transition:opacity .4s ease, transform .4s ease; animation:qh-up .22s ease;
    }
    .qh-ico { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .qh-lbl { white-space:nowrap; }
  `
      )
    );
  }

  function decodeJwtPayload(jwt) {
    try {
      const part = String(jwt || "").split(".")[1];
      if (!part) return null;
      const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  function isJwtExpired(jwt) {
    const payload = decodeJwtPayload(jwt);
    return typeof payload?.exp === "number" && payload.exp * 1000 < Date.now() + 5000;
  }

  function getTokenScope(jwt) {
    const payload = decodeJwtPayload(jwt);
    const id = payload?.userId ?? payload?.username ?? payload?.sub;
    return id != null ? String(id) : "";
  }

  const Utils = {
    getQuizId: () => {
      const m = location.pathname.match(EXAM_PATH_RE);
      return m ? m[1] : null;
    },
    readToken: () => {
      const candidates = [];
      try {
        for (const key of ["mentari_auth_token", "access", "token", "mentari_token"]) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed[0]?.token) candidates.push(String(parsed[0].token));
            else if (parsed && typeof parsed === "object") {
              const tok = parsed.token || parsed.access || parsed.jwt;
              if (tok) candidates.push(String(tok));
            } else if (typeof parsed === "string" && parsed.split(".").length >= 2) {
              candidates.push(parsed.replace(/^Bearer\s+/i, "").trim());
            }
          } catch {
            const cleaned = raw.replace(/^"|"$/g, "").replace(/^Bearer\s+/i, "").trim();
            if (cleaned.startsWith("eyJ") && cleaned.split(".").length >= 2) candidates.push(cleaned);
          }
        }
      } catch {
        return null;
      }
      for (const tok of candidates) {
        if (!isJwtExpired(tok)) return tok;
      }
      return null;
    },
    isAutoFillEnabled: () => {
      try {
        const v = localStorage.getItem(AUTOFILL_STORAGE_KEY);
        return v === null ? true : v === "true";
      } catch {
        return true;
      }
    },
    setAutoFillEnabled: (enabled) => {
      try {
        localStorage.setItem(AUTOFILL_STORAGE_KEY, String(Boolean(enabled)));
      } catch {
        // ignore
      }
    },
    getDefaultPanelHeight: () =>
      Math.min(DEFAULT_MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(window.innerHeight * 0.64))),
    getMaxPanelHeight: (topPx = 20) =>
      Math.max(MIN_PANEL_HEIGHT, Math.floor(window.innerHeight - Math.max(8, Number(topPx) || 0) - 16)),
    clampPanelHeight: (px, topPx = 20) =>
      Math.min(Utils.getMaxPanelHeight(topPx), Math.max(MIN_PANEL_HEIGHT, Math.round(Number(px) || 0))),
    getSavedPanelHeight: () => {
      try {
        const raw = Number(localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY));
        return Number.isFinite(raw) && raw >= MIN_PANEL_HEIGHT ? raw : null;
      } catch {
        return null;
      }
    },
    setSavedPanelHeight: (height) => {
      try {
        if (height == null) localStorage.removeItem(PANEL_HEIGHT_STORAGE_KEY);
        else localStorage.setItem(PANEL_HEIGHT_STORAGE_KEY, String(Math.round(height)));
      } catch {
        // ignore
      }
    },
    showToast: (message, type = "error", duration = 4000) => {
      injectStyles();
      document.getElementById("qh-toast")?.remove();
      const color = { error: "#f87171", success: "#4ade80", info: "#60a5fa" }[type] || "#fff";
      const iconName = type === "success" ? "check" : type === "info" ? "info" : "x";
      const toast = el(
        "div",
        { id: "qh-toast", role: "status" },
        el("span", { style: `color:${color};display:inline-flex;` }, ico(iconName, 14)),
        el("span", {}, message)
      );
      (document.body || document.documentElement).appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, 8px)";
        setTimeout(() => toast.remove(), 400);
      }, duration);
    },
    /**
     * XSS-safe HTML-to-text converter using DOMParser (never executes inline scripts or onerror handlers).
     */
    cleanText: (html) => {
      if (!html) return "";
      const raw = String(html);
      if (typeof DOMParser === "undefined") {
        return globalThis.MentariAiClient?.parseHtmlSafely
          ? globalThis.MentariAiClient.parseHtmlSafely(raw).trim()
          : raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const body = doc.body;
      if (!body) return "";

      body.querySelectorAll("script, style, iframe, object, embed").forEach((n) => n.remove());

      body.querySelectorAll("table").forEach((tbl) => {
        let txt = "\n==TABLE==\n";
        tbl.querySelectorAll("tr").forEach((tr, rowIdx) => {
          const line = Array.from(tr.querySelectorAll("td, th"))
            .map((c) => c.textContent.replace(/\s+/g, " ").trim())
            .join(" | ");
          txt += `${line}\n`;
          if (rowIdx === 0 && tr.querySelectorAll("th").length > 0) {
            txt += `${"-".repeat(Math.min(60, line.length))}\n`;
          }
        });
        txt += "==END TABLE==\n";
        tbl.replaceWith(doc.createTextNode(txt));
      });

      body.querySelectorAll("img").forEach((img) => {
        const alt = (img.getAttribute("alt") || "").trim();
        img.replaceWith(doc.createTextNode(alt ? `[IMG: ${alt}]` : "[IMG]"));
      });

      body.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
      body.querySelectorAll("li").forEach((li) => {
        li.prepend(doc.createTextNode("• "));
        li.append(doc.createTextNode("\n"));
      });
      body.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
        h.prepend(doc.createTextNode("\n=== "));
        h.append(doc.createTextNode(" ===\n\n"));
      });
      body.querySelectorAll("p, div").forEach((block) => {
        block.append(doc.createTextNode("\n"));
      });

      return (body.textContent || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },
    async copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        ta.remove();
        return ok;
      }
    },
  };

  let last429ToastAt = 0;

  async function fetchQuizData(token, quizId, externalSignal) {
    const cooldownMs = globalThis.MentariFetchGuard?.getCooldownRemainingMs?.() || 0;
    if (cooldownMs > 0) {
      return { status: 429, data: null, cooldownMs };
    }

    if (externalSignal?.aborted) {
      return { status: 0, data: null, aborted: true };
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const onExternalAbort = () => controller?.abort();
    if (controller && externalSignal) {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;

    try {
      const res = await fetch(`https://mentari.unpam.ac.id/api/quiz/soal/${encodeURIComponent(quizId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      });

      if (res.status === 429) {
        const nowMs = Date.now();
        if (nowMs - last429ToastAt > 15000) {
          last429ToastAt = nowMs;
          Utils.showToast("Server MENTARI sedang membatasi permintaan (429). Menunggu cooldown...", "error", 4500);
        }
        return {
          status: 429,
          data: null,
          cooldownMs: globalThis.MentariFetchGuard?.getCooldownRemainingMs?.() || 15000,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return { status: res.status, data: null };
      }

      if (!res.ok) return { status: res.status, data: null };

      const raw = await res.text();
      if (/^\s*(?:<!doctype|<html)\b/i.test(raw)) return { status: 502, data: null };
      const solver = globalThis.MentariQuizSolver;
      if (solver) {
        const parsed = solver.parseJsonObjects(raw).find((o) => o && o.data) || null;
        return { status: 200, data: parsed };
      }
      try {
        const parsed = JSON.parse(raw);
        return { status: 200, data: parsed && parsed.data ? parsed : null };
      } catch {
        return { status: 500, data: null };
      }
    } catch {
      return { status: 0, data: null, aborted: Boolean(externalSignal?.aborted) };
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }

  const groupIdMap = new WeakMap();
  let nextGroupId = 0;

  const DomFiller = {
    isOurs: (node) => Boolean(node?.closest(OWN_UI_SEL)),
    isChecked: (radio) =>
      Boolean((typeof radio?.checked === "boolean" && radio.checked) || radio?.getAttribute?.("aria-checked") === "true"),
    isDisabled: (radio) =>
      Boolean(radio?.disabled || radio?.getAttribute?.("aria-disabled") === "true"),
    isVisible(el) {
      if (!el || !el.isConnected) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse") return false;
      if (parseFloat(st.opacity) === 0) return false;
      if (el.offsetParent !== null) return true;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0 || st.position === "fixed";
    },
    isRadioVisible(radio) {
      const wrapper = radio.closest(".MuiFormControlLabel-root, label, [role='radio'], [role='radiogroup']") || radio;
      return this.isVisible(wrapper);
    },
    collectPageRadios() {
      const out = [];
      const seen = new Set();
      for (const input of document.querySelectorAll('input[type="radio"]')) {
        if (this.isOurs(input) || this.isDisabled(input) || !this.isRadioVisible(input)) continue;
        seen.add(input);
        out.push(input);
      }
      for (const ariaRadio of document.querySelectorAll('[role="radio"]')) {
        if (this.isOurs(ariaRadio) || this.isDisabled(ariaRadio) || !this.isRadioVisible(ariaRadio)) continue;
        const inner = ariaRadio.querySelector('input[type="radio"]');
        if (inner && seen.has(inner)) continue;
        out.push(ariaRadio);
      }
      return out;
    },
    radioGroupsOnPage() {
      const radios = this.collectPageRadios();
      const items = radios.map((el) => {
        const name = el.getAttribute("name") || el.name || "";
        let groupKey = "";
        if (!name) {
          const grp = el.closest('[role="radiogroup"], .MuiFormGroup-root, fieldset');
          if (grp) {
            let gid = groupIdMap.get(grp);
            if (!gid) {
              gid = String(++nextGroupId);
              groupIdMap.set(grp, gid);
            }
            groupKey = gid;
          }
        }
        return { el, name, groupKey };
      });
      const solver = globalThis.MentariQuizSolver;
      const groups = solver ? solver.groupRadioItems(items) : [radios];
      return { radios, groups };
    },
    groupAllVisible(optionCounts) {
      const { radios, groups } = this.radioGroupsOnPage();
      const solver = globalThis.MentariQuizSolver;
      if (solver) {
        return solver.resolveVisibleGroups(radios, groups, optionCounts);
      }
      if (groups.length === optionCounts.length && groups.every((g, idx) => g.length === optionCounts[idx])) {
        return groups;
      }
      return null;
    },
    extractRadioLabel(radio) {
      const muiLabel = radio.closest(".MuiFormControlLabel-root")?.querySelector(".MuiFormControlLabel-label");
      const raw =
        muiLabel?.textContent ||
        radio.closest("label")?.textContent ||
        (radio.id && typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)?.textContent
          : "") ||
        radio.getAttribute("aria-label") ||
        radio.parentElement?.textContent ||
        "";
      return String(raw)
        .replace(/^\s*[A-Za-z]\s*[.):]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
    },
    waitForRadios(timeoutMs = 1200) {
      return new Promise((resolve) => {
        const existing = this.collectPageRadios();
        if (existing.length > 0) {
          resolve(existing);
          return;
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(this.collectPageRadios());
        };
        const observer = new MutationObserver(() => {
          if (this.collectPageRadios().length > 0) finish();
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        const timer = setTimeout(finish, timeoutMs);
      });
    },
    check(radio) {
      if (!radio || this.isDisabled(radio)) return false;
      if (this.isChecked(radio)) return true;

      try {
        radio.scrollIntoView({ block: "nearest" });
      } catch {
        // ignore
      }

      radio.click();
      if (this.isChecked(radio)) return true;

      const label = radio.closest(".MuiFormControlLabel-root") || radio.closest("label");
      if (label) {
        label.click();
        if (this.isChecked(radio)) return true;
      }

      if (radio.tagName === "INPUT") {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
        if (setter) setter.call(radio, true);
        else radio.checked = true;
        radio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        radio.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      } else {
        radio.setAttribute("aria-checked", "true");
        radio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }

      return this.isChecked(radio);
    },
    fillByGroups(entries, groups) {
      const solver = globalThis.MentariQuizSolver;
      const stats = { filled: 0, skipped: 0, failed: 0, skippedFallback: 0 };
      entries.forEach((entry, idx) => {
        if (entry.status !== "done" || !entry.letter) return;
        if (entry.fallback) {
          stats.skippedFallback++;
          return;
        }
        const grp = groups[idx] || [];
        if (!grp.length) {
          stats.failed++;
          return;
        }
        const labels = grp.map((r) => this.extractRadioLabel(r));
        const target = solver
          ? solver.pickTargetRadioInGroup(grp, labels, entry)
          : grp[entry.letter.charCodeAt(0) - 97];
        if (!target) {
          stats.failed++;
          return;
        }
        if (grp.some((r) => this.isChecked(r))) {
          stats.skipped++;
        } else if (this.check(target)) {
          stats.filled++;
        } else {
          stats.failed++;
        }
      });
      return stats;
    },
    pageFingerprint() {
      const radios = this.collectPageRadios();
      const first = radios[0];
      const container =
        first?.closest(".MuiPaper-root, .MuiCard-root, form, main") || document.body;
      const textSample = (container?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140);
      return `${radios.length}|${first?.name || ""}|${first?.value || ""}|${textSample}`;
    },
    visibleTextNormalized() {
      const solver = globalThis.MentariQuizSolver;
      const raw = [...(document.body?.children || [])]
        .filter((c) => !c.matches(`${OWN_UI_SEL}, style, script`))
        .map((c) => c.textContent || "")
        .join(" ");
      return solver ? solver.normalize(raw) : raw.toLowerCase();
    },
    matchesPage(entry, normPageText, radioLabels = []) {
      const solver = globalThis.MentariQuizSolver;
      const normQ = solver ? solver.normalize(entry.question) : String(entry.question || "").toLowerCase();
      const sample = normQ.slice(0, 40);
      if (sample.length >= 6 && normPageText.includes(sample)) return true;
      if (normQ.length > 0 && normQ.length < 6 && normPageText.includes(normQ)) return true;

      if (radioLabels.length && Array.isArray(entry.options) && entry.options.length === radioLabels.length) {
        const normLabels = radioLabels.map((l) => (solver ? solver.normalize(l) : l.toLowerCase()));
        const overlap = entry.options.filter((opt) => {
          const n = solver ? solver.normalize(opt) : String(opt).toLowerCase();
          return n.length >= 3 && normLabels.includes(n);
        }).length;
        if (overlap >= Math.max(2, Math.ceil(radioLabels.length * 0.6))) return true;
      }
      return false;
    },
    findNextButton() {
      const submitRe = /selesai|submit|kirim|finish|akhiri/i;
      const nextRe = /next|selanjutnya|berikutnya|lanjut/i;
      const btns = [...document.querySelectorAll('button, [role="button"]')].filter(
        (b) =>
          !this.isOurs(b) &&
          !this.isDisabled(b) &&
          this.isVisible(b) &&
          !submitRe.test(b.textContent || "")
      );
      return (
        btns.find((b) => nextRe.test(b.textContent || "")) ||
        btns.find((b) => b.querySelector('svg[data-testid="KeyboardTabIcon"]')) ||
        null
      );
    },
    waitForQuestionAdvance(prevFingerprint, maxWaitMs = 900) {
      return new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve();
        };

        const observer = new MutationObserver(() => {
          if (this.collectPageRadios().length > 0 && this.pageFingerprint() !== prevFingerprint) {
            setTimeout(done, 45);
          }
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        const timer = setTimeout(done, maxWaitMs);
      });
    },
    async fillSequentially(entries, gen) {
      const solver = globalThis.MentariQuizSolver;
      const stats = { filled: 0, skipped: 0, failed: 0, skippedFallback: 0 };
      const visited = new Set();

      for (let step = 0; step < entries.length + 2 && gen === QuizApp.generation; step++) {
        const { groups } = this.radioGroupsOnPage();
        if (!groups.length) break;

        const grp = groups[0];
        const labels = grp.map((r) => this.extractRadioLabel(r));
        const pageText = this.visibleTextNormalized();
        const doneUnvisited = entries.filter((e) => !visited.has(e.id) && e.status === "done" && e.letter);

        const match =
          doneUnvisited.find((e) => e.options.length === grp.length && this.matchesPage(e, pageText, labels)) ||
          doneUnvisited.find((e) => this.matchesPage(e, pageText, labels)) ||
          (doneUnvisited.length === 1 && doneUnvisited[0].options.length === grp.length ? doneUnvisited[0] : null);

        if (match) {
          visited.add(match.id);
          if (match.fallback) {
            stats.skippedFallback++;
          } else {
            const target = solver
              ? solver.pickTargetRadioInGroup(grp, labels, match)
              : grp[match.letter.charCodeAt(0) - 97];
            if (!target) {
              stats.failed++;
            } else if (grp.some((r) => this.isChecked(r))) {
              stats.skipped++;
            } else if (this.check(target)) {
              stats.filled++;
            } else {
              stats.failed++;
            }
          }
        }

        const nextBtn = this.findNextButton();
        if (!nextBtn) break;
        const fp = this.pageFingerprint();
        nextBtn.click();
        await this.waitForQuestionAdvance(fp, 900);
      }

      return stats;
    },
  };

  const UI = {
    createPanel() {
      injectStyles();
      let minimized = false;
      let currentHeight = Utils.getSavedPanelHeight() ?? Utils.getDefaultPanelHeight();
      const subtitle = el("div", { class: "qh-sub" }, "Menunggu soal");
      const content = el("div", { class: "qh-content" });
      const minBtn = el("button", { class: "qh-icon-btn", title: "Perkecil" }, ico("minus", 14));
      const hideBtn = el("button", { class: "qh-icon-btn", title: "Sembunyikan" }, ico("x", 14));
      const header = el(
        "div",
        { class: "qh-header" },
        el(
          "div",
          { class: "qh-brand" },
          el("div", { class: "qh-logo" }, ico("sparkles", 15)),
          el("div", { style: "min-width:0;" }, el("div", { class: "qh-title" }, "Quiz Helper"), subtitle)
        ),
        el("div", { class: "qh-header-actions" }, minBtn, hideBtn)
      );
      const creditBar = el(
        "div",
        {
          class: "qh-credit",
          role: "separator",
          "aria-orientation": "horizontal",
          "aria-label": "Atur tinggi panel Quiz Helper",
          tabindex: "0",
          title: "Tarik ke atas/bawah untuk atur tinggi \u2022 Klik 2x untuk reset",
        },
        el("span", { class: "qh-credit-label" }, "v3.0 Revised \u2022 Tuning by Rixz"),
        el("span", { class: "qh-resize-grip", "aria-hidden": "true" })
      );
      const panel = el("div", { id: "qh-panel" }, header, content, creditBar);
      const launcher = el(
        "button",
        { id: "qh-launcher", title: "Buka Quiz Helper" },
        ico("sparkles", 14),
        el("span", {}, "Quiz Helper")
      );
      launcher.style.display = "none";

      const applyHeight = (px, persist = false) => {
        const topPx = panel.isConnected && panel.style.display !== "none" ? panel.getBoundingClientRect().top || 20 : 20;
        const clamped = Utils.clampPanelHeight(px, topPx);
        currentHeight = clamped;
        if (!minimized) {
          panel.style.height = `${clamped}px`;
        }
        creditBar.setAttribute("aria-valuemin", String(MIN_PANEL_HEIGHT));
        creditBar.setAttribute("aria-valuemax", String(Utils.getMaxPanelHeight(topPx)));
        creditBar.setAttribute("aria-valuenow", String(clamped));
        if (persist) {
          Utils.setSavedPanelHeight(clamped);
        }
      };

      const clampToViewport = () => {
        if (!panel.isConnected || minimized || panel.style.display === "none") return;
        const rect = panel.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        if (panel.style.left) {
          const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
          const maxTop = Math.max(8, window.innerHeight - 64);
          panel.style.left = `${Math.min(maxLeft, Math.max(8, rect.left))}px`;
          panel.style.top = `${Math.min(maxTop, Math.max(8, rect.top))}px`;
        }
        applyHeight(currentHeight, false);
      };

      const show = () => {
        panel.style.display = "flex";
        launcher.style.display = "none";
        clampToViewport();
      };
      const hide = () => {
        panel.style.display = "none";
        launcher.style.display = "inline-flex";
      };

      minBtn.addEventListener("click", () => {
        minimized = !minimized;
        panel.classList.toggle("minimized", minimized);
        content.style.display = minimized ? "none" : "";
        if (minimized) {
          panel.style.height = "";
        } else {
          applyHeight(currentHeight, false);
        }
        minBtn.title = minimized ? "Perbesar" : "Perkecil";
        minBtn.replaceChildren(ico(minimized ? "plus" : "minus", 14));
      });
      hideBtn.addEventListener("click", hide);
      launcher.addEventListener("click", show);
      (document.body || document.documentElement).append(panel, launcher);
      applyHeight(currentHeight, false);

      const stopDrag = this.makeDraggable(panel, header, () => clampToViewport());
      const stopResize = this.makeResizable(panel, creditBar, {
        isMinimized: () => minimized,
        getHeight: () => currentHeight,
        setHeight: (h, persist) => applyHeight(h, persist),
        resetHeight: () => {
          Utils.setSavedPanelHeight(null);
          applyHeight(Utils.getDefaultPanelHeight(), false);
        },
      });
      window.addEventListener("resize", clampToViewport);

      const destroy = () => {
        window.removeEventListener("resize", clampToViewport);
        stopDrag();
        stopResize();
      };

      return { element: panel, launcher, content, subtitle, show, hide, destroy };
    },
    makeDraggable(panel, handle, onMoved) {
      let offsetX = 0;
      let offsetY = 0;
      const onMove = (e) => {
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - 64);
        const left = Math.min(maxLeft, Math.max(8, e.clientX - offsetX));
        const top = Math.min(maxTop, Math.max(8, e.clientY - offsetY));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onMoved?.();
      };
      const onDown = (e) => {
        if (e.target.closest("button")) return;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
      };
      handle.addEventListener("mousedown", onDown);
      return () => {
        handle.removeEventListener("mousedown", onDown);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
    },
    makeResizable(panel, handle, opts) {
      let resizing = false;
      let startY = 0;
      let startHeight = 0;
      let rafId = 0;
      let pendingHeight = 0;

      const finish = (persist) => {
        if (!resizing) return;
        resizing = false;
        panel.classList.remove("qh-resizing");
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        if (persist) {
          opts.setHeight(pendingHeight || opts.getHeight(), true);
        }
      };

      const onMove = (e) => {
        if (!resizing) return;
        pendingHeight = startHeight + (e.clientY - startY);
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            opts.setHeight(pendingHeight, false);
          });
        }
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(true);

      const onPointerDown = (e) => {
        if (opts.isMinimized() || e.button > 0) return;
        resizing = true;
        startY = e.clientY;
        startHeight = panel.getBoundingClientRect().height || opts.getHeight();
        pendingHeight = startHeight;
        panel.classList.add("qh-resizing");
        try {
          handle.setPointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        e.preventDefault();
      };

      const onDblClick = () => {
        if (opts.isMinimized()) return;
        opts.resetHeight();
      };

      const onKeyDown = (e) => {
        if (opts.isMinimized()) return;
        const step = e.shiftKey ? 80 : 32;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          opts.setHeight(opts.getHeight() + step, true);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          opts.setHeight(opts.getHeight() - step, true);
        } else if (e.key === "Home") {
          e.preventDefault();
          opts.resetHeight();
        }
      };

      handle.addEventListener("pointerdown", onPointerDown);
      handle.addEventListener("dblclick", onDblClick);
      handle.addEventListener("keydown", onKeyDown);

      return () => {
        finish(false);
        handle.removeEventListener("pointerdown", onPointerDown);
        handle.removeEventListener("dblclick", onDblClick);
        handle.removeEventListener("keydown", onKeyDown);
      };
    },
    status(container, title, message, loading = false, actionBtn = null) {
      if (!container) return;
      container.replaceChildren(
        el(
          "div",
          { class: "qh-state" },
          loading ? el("div", { class: "qh-ring" }) : el("div", { class: "qh-state-icon" }, ico("info", 18)),
          el("div", { class: "qh-state-title" }, title),
          el("div", { class: "qh-state-msg" }, message),
          actionBtn || null,
          loading
            ? el(
                "div",
                { class: "qh-skel-list" },
                el("div", { class: "qh-card" }, ...skelLines(["35%", "92%", "70%"])),
                el("div", { class: "qh-card" }, ...skelLines(["40%", "88%", "60%"]))
              )
            : null
        )
      );
    },
    flash(btn, label, ms = 1500) {
      const lbl = btn?.querySelector(".qh-lbl");
      if (!lbl) return;
      const base = lbl.dataset.base || lbl.textContent;
      lbl.dataset.base = base;
      lbl.textContent = label;
      clearTimeout(btn._flashTimer);
      btn._flashTimer = setTimeout(() => {
        lbl.textContent = base;
      }, ms);
    },
  };

  const QuizApp = {
    popup: null,
    token: null,
    routeConfig: null,
    quizId: null,
    generation: 0,
    abortController: null,
    fetchController: null,
    questionData: new Map(),
    open: new Set(),
    viewMode: VIEW_MODE.STANDAR,
    processing: false,
    filling: false,
    startedFor: null,
    ticking: false,
    pollTimer: null,
    pollAttempt: 0,
    startObserver: null,
    startRaf: 0,
    solveStartedAt: 0,
    elapsedLabel: "",
    lastAiError: null,
    lastRawPayload: null,

    isExamPage() {
      return EXAM_PATH_RE.test(location.pathname);
    },

    stopStartObserver() {
      if (this.startRaf) {
        cancelAnimationFrame(this.startRaf);
        this.startRaf = 0;
      }
      if (this.startObserver) {
        this.startObserver.disconnect();
        this.startObserver = null;
      }
    },

    stopPolling() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    },

    stopBackgroundWork() {
      this.stopPolling();
      this.stopStartObserver();
      if (this.fetchController) {
        this.fetchController.abort();
        this.fetchController = null;
      }
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    },

    teardownOutsideExam() {
      this.stopBackgroundWork();
      this.generation++;
      this.ticking = false;
      this.quizId = null;
      this.questionData = new Map();
      this.open = new Set();
      this.processing = false;
      this.filling = false;
      this.startedFor = null;
      this.elapsedLabel = "";
      this.lastAiError = null;
      this.lastRawPayload = null;
      this.pollAttempt = 0;
      if (this.popup) {
        this.popup.destroy?.();
        this.popup.element.remove();
        this.popup.launcher.remove();
        this.popup = null;
      }
    },

    ensurePanel() {
      if (!this.popup) {
        this.popup = UI.createPanel();
      } else if (!this.popup.element.isConnected) {
        (document.body || document.documentElement).append(this.popup.element, this.popup.launcher);
      }
    },

    async readContext() {
      const solver = globalThis.MentariQuizSolver;
      if (!solver) {
        return { error: "Modul QuizSolver belum dimuat. Muat ulang halaman.", kind: "fatal" };
      }
      const routeConfig = solver.readRouteConfigAsync
        ? await solver.readRouteConfigAsync()
        : solver.readRouteConfig();
      const token = Utils.readToken();
      if (!routeConfig?.hasApiKey && !routeConfig?.apiKey) {
        return {
          error: "API Key belum diatur. Atur di menu Pengaturan API Mentari.",
          kind: "no-key",
        };
      }
      if (!token) {
        return {
          error: "Token login belum tersedia atau kedaluwarsa. Muat ulang halaman dan pastikan sudah login di Mentari.",
          kind: "no-token",
        };
      }
      return { quizId: Utils.getQuizId(), routeConfig, token };
    },

    switchQuiz(quizId) {
      this.stopBackgroundWork();
      this.generation++;
      this.ticking = false;
      this.abortController = typeof AbortController === "function" ? new AbortController() : null;
      this.quizId = quizId;
      this.questionData = new Map();
      this.open = new Set();
      this.processing = false;
      this.filling = false;
      this.startedFor = null;
      this.elapsedLabel = "";
      this.lastAiError = null;
      this.lastRawPayload = null;
      this.pollAttempt = 0;
      this.ensurePanel();
      this.popup.show();
      this.popup.subtitle.textContent = "Menunggu soal";
      UI.status(this.popup.content, "Memuat Quiz", "Mohon tunggu sebentar, soal sedang disiapkan.", true);
      this.observeAutoStart();
      this.scheduleNextPoll(0);
    },

    observeAutoStart() {
      this.autoStartQuiz();
      this.stopStartObserver();
      if (this.questionData.size > 0 || this.startedFor === this.quizId) return;

      this.startObserver = new MutationObserver(() => {
        if (this.startedFor === this.quizId || this.questionData.size > 0) {
          this.stopStartObserver();
          return;
        }
        if (this.startRaf) return;
        this.startRaf = requestAnimationFrame(() => {
          this.startRaf = 0;
          if (this.startedFor !== this.quizId && this.questionData.size === 0) {
            this.autoStartQuiz();
          }
        });
      });
      this.startObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    },

    autoStartQuiz() {
      if (this.startedFor === this.quizId || this.questionData.size > 0) return;
      const btns = [...document.querySelectorAll("button")].filter(
        (b) => !DomFiller.isOurs(b) && !DomFiller.isDisabled(b) && DomFiller.isVisible(b)
      );
      const btn = btns.find((b) => /mulai\s*(quiz|kuis|ujian)/i.test(b.textContent || ""));
      if (btn) {
        this.startedFor = this.quizId;
        this.stopStartObserver();
        btn.click();
      }
    },

    scheduleNextPoll(delayMs) {
      this.stopPolling();
      if (!this.isExamPage() || this.questionData.size > 0) return;
      const waitMs =
        typeof delayMs === "number"
          ? Math.max(0, delayMs)
          : POLL_BACKOFF_MS[Math.min(this.pollAttempt, POLL_BACKOFF_MS.length - 1)];
      const gen = this.generation;
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        if (gen !== this.generation || !this.isExamPage()) return;
        if (this.questionData.size > 0) return;
        this.tick();
      }, waitMs);
    },

    async tick() {
      if (this.ticking || !this.isExamPage()) return;
      this.ticking = true;
      const startGen = this.generation;
      try {
        this.ensurePanel();
        const ctx = await this.readContext();
        if (startGen !== this.generation || !this.isExamPage() || !this.popup) return;

        if (ctx.error) {
          if (this.questionData.size === 0) {
            const actionBtn =
              ctx.kind === "no-key"
                ? el(
                    "button",
                    {
                      class: "qh-btn primary",
                      style: "flex:0 0 auto;margin-top:4px;",
                      on: { click: () => globalThis.MentariAiClient?.openSettings?.().catch(() => {}) },
                    },
                    "Atur API Key"
                  )
                : null;
            UI.status(this.popup.content, "Menunggu...", ctx.error, ctx.kind !== "no-key" && ctx.kind !== "fatal", actionBtn);
          }
          if (ctx.kind === "no-token") {
            this.pollAttempt++;
            this.scheduleNextPoll();
          }
          return;
        }

        this.routeConfig = ctx.routeConfig;
        this.token = ctx.token;

        if (ctx.quizId && ctx.quizId !== this.quizId) {
          this.switchQuiz(ctx.quizId);
          return;
        }

        this.autoStartQuiz();
        if (this.questionData.size === 0 && !this.processing) {
          await this.fetchAndProcess();
        }
      } catch {
        // ignore transient tick errors
      } finally {
        if (this.generation === startGen || !this.isExamPage()) {
          this.ticking = false;
        }
      }
    },

    async fetchAndProcess() {
      if (this.processing || !this.quizId || !this.token) return;
      const gen = this.generation;
      const expectedQuizId = this.quizId;
      this.fetchController?.abort();
      this.fetchController = typeof AbortController === "function" ? new AbortController() : null;
      const res = await fetchQuizData(this.token, expectedQuizId, this.fetchController?.signal);
      this.fetchController = null;
      if (res.aborted || gen !== this.generation || !this.isExamPage() || !this.popup) return;
      if (Utils.getQuizId() !== expectedQuizId) return;

      if (res.status === 401 || res.status === 403) {
        this.stopPolling();
        UI.status(
          this.popup.content,
          "Sesi login kedaluwarsa",
          "Token MENTARI ditolak server (401/403). Muat ulang halaman lalu login kembali."
        );
        return;
      }

      if (res.status === 429) {
        this.pollAttempt++;
        this.scheduleNextPoll((res.cooldownMs || 15000) + 500);
        return;
      }

      if (res.data) {
        this.stopPolling();
        this.stopStartObserver();
        this.lastRawPayload = res.data;
        // Launch processQuiz without holding this.ticking so SPA switches remain instant
        this.processQuiz(res.data, gen).catch(() => {});
      } else if (this.questionData.size === 0) {
        UI.status(
          this.popup.content,
          "Memeriksa Quiz...",
          'Menunggu soal muncul. Klik "Mulai Quiz" di halaman Mentari jika belum dimulai.',
          true
        );
        this.pollAttempt++;
        this.scheduleNextPoll();
      }
    },

    async retryAnalysis(force = false) {
      if ((this.processing && !force) || !this.quizId) return;
      this.stopBackgroundWork();
      this.processing = true;
      const gen = ++this.generation;
      this.abortController = typeof AbortController === "function" ? new AbortController() : null;

      let handedOff = false;
      try {
        const solver = globalThis.MentariQuizSolver;
        if (solver?.clearQuizCache) {
          solver.clearQuizCache(sessionStorage, this.quizId, getTokenScope(this.token));
        }
        const ctx = await this.readContext();
        if (gen !== this.generation || !this.isExamPage()) return;
        if (ctx.error) {
          this.lastAiError = ctx.error;
          this.processing = false;
          Utils.showToast(ctx.error, "error", 3500);
          if (this.questionData.size > 0) this.render();
          return;
        }
        this.lastAiError = null;
        this.routeConfig = ctx.routeConfig;
        this.token = ctx.token;
        if (solver?.clearQuizCache && ctx.token) {
          solver.clearQuizCache(sessionStorage, this.quizId, getTokenScope(ctx.token));
        }

        if (this.lastRawPayload) {
          this.questionData = new Map();
          this.open = new Set();
          this.elapsedLabel = "";
          handedOff = true;
          this.processing = false;
          this.processQuiz(this.lastRawPayload, gen).catch(() => {});
        } else {
          handedOff = true;
          this.processing = false;
          this.switchQuiz(this.quizId);
        }
      } finally {
        if (!handedOff && gen === this.generation) {
          this.processing = false;
        }
      }
    },

    async processQuiz(payload, expectedGen = this.generation) {
      const gen = expectedGen;
      if (gen !== this.generation || !this.popup) return;

      const list = Array.isArray(payload?.data) ? payload.data : [];
      if (!list.length) {
        if (this.questionData.size === 0 && this.popup) {
          UI.status(this.popup.content, "Belum ada soal", "Quiz ini tidak memiliki soal.");
        }
        return;
      }

      const solver = globalThis.MentariQuizSolver;
      if (!solver) {
        UI.status(this.popup.content, "Error", "Modul solver quiz tidak ditemukan.");
        return;
      }

      const scope = getTokenScope(this.token);
      const cachedMap = solver.loadQuizCache(sessionStorage, this.quizId, scope);
      const pending = [];
      let changed = false;

      list.forEach((item, idx) => {
        if (this.questionData.has(item.id)) return;
        changed = true;
        const options = (item.list_jawaban || []).map((o) => Utils.cleanText(o.jawaban));
        const title = Utils.cleanText(item.judul || "");
        const desc = Utils.cleanText(item.deskripsi || "");
        const cached = cachedMap[String(item.id)];
        const optHash = solver.hashOptions ? solver.hashOptions(options) : "";
        const optIdx = cached?.letter ? cached.letter.charCodeAt(0) - 97 : -1;
        const hasValidCache =
          Boolean(cached && !cached.fallback) &&
          optIdx >= 0 &&
          optIdx < options.length &&
          (!cached.optHash || !optHash || cached.optHash === optHash);

        const entry = {
          id: item.id,
          index: idx,
          number: idx + 1,
          question: [title, desc].filter(Boolean).join("\n\n"),
          options,
          status: options.length ? (hasValidCache ? "done" : "pending") : "empty",
          letter: hasValidCache ? cached.letter : null,
          reasoning: hasValidCache ? cached.reasoning || "Dimuat dari cache sesi." : "",
          fallback: false,
        };
        if (hasValidCache && this.viewMode === VIEW_MODE.DETAIL) {
          this.open.add(entry.id);
        }
        this.questionData.set(item.id, entry);
        if (options.length && !hasValidCache) {
          pending.push(entry);
        }
      });

      if (!changed) return;

      if (!pending.length) {
        this.elapsedLabel = "Cache instan";
        this.processing = false;
        this.render();
        if (Utils.isAutoFillEnabled()) {
          this.tryProgressiveAutoFill(gen, true);
        }
        return;
      }

      this.solveStartedAt = performance.now();
      this.processing = true;
      this.lastAiError = null;
      this.render();

      let reportedErrorToast = false;

      try {
        await solver.solveAllParallel(this.routeConfig, pending, {
          signal: this.abortController?.signal,
          isCancelled: () => gen !== this.generation,
          onChunkError: (_chunk, err) => {
            if (gen !== this.generation) return;
            this.lastAiError = err?.message || "Gagal menghubungi server AI";
            if (!reportedErrorToast) {
              reportedErrorToast = true;
              Utils.showToast(`AI gagal: ${this.lastAiError}`, "error", 5000);
            }
          },
          onChunkDone: (chunk, results) => {
            if (gen !== this.generation) return;
            chunk.forEach((entry, idx) => {
              const res = results[idx];
              if (!res) return;
              entry.status = "done";
              entry.letter = res.letter;
              entry.reasoning = res.reasoning;
              entry.fallback = Boolean(res.fallback);
              if (res.error && !this.lastAiError) {
                this.lastAiError = res.error;
              }
              if (this.viewMode === VIEW_MODE.DETAIL) {
                this.open.add(entry.id);
              }
            });
            solver.saveQuizCache(sessionStorage, this.quizId, chunk, scope);
            this.render();
            if (Utils.isAutoFillEnabled()) {
              this.tryProgressiveAutoFill(gen, false);
            }
          },
        });
      } catch (err) {
        if (gen === this.generation && err?.name !== "AbortError") {
          this.lastAiError = err?.message || "Gagal memproses soal";
          Utils.showToast(`Gagal memproses soal: ${this.lastAiError}`, "error", 5000);
        }
      } finally {
        if (gen === this.generation) {
          const sec = ((performance.now() - this.solveStartedAt) / 1000).toFixed(1);
          this.elapsedLabel = `${sec}d`;
          this.processing = false;
          this.render();
          if (Utils.isAutoFillEnabled()) {
            this.tryProgressiveAutoFill(gen, true);
          }
        }
      }
    },

    tryProgressiveAutoFill(gen, allDone) {
      if (gen !== this.generation || this.filling) return;
      const entries = this.sortedEntries().filter((e) => e.options.length > 0);
      const hasNonFallback = entries.some((e) => e.status === "done" && e.letter && !e.fallback);
      if (!hasNonFallback) return;

      const groups = DomFiller.groupAllVisible(entries.map((e) => e.options.length));
      if (groups) {
        DomFiller.fillByGroups(entries, groups);
      } else if (allDone) {
        this.fillAll(true);
      }
    },

    async fillAll(silentIfAlreadyFilled = false) {
      if (this.filling) return;
      const gen = this.generation;
      const entries = this.sortedEntries().filter((e) => e.options.length > 0);
      const ready = entries.filter((e) => e.status === "done" && e.letter && !e.fallback);

      if (!ready.length) {
        if (!silentIfAlreadyFilled) {
          const hasFallbackOnly = entries.some((e) => e.status === "done" && e.fallback);
          Utils.showToast(
            hasFallbackOnly
              ? "Jawaban AI gagal dimuat (hanya perkiraan lokal). Klik Ulangi Analisis atau cek API Key."
              : "Jawaban AI belum siap. Tunggu analisis selesai dulu.",
            hasFallbackOnly ? "error" : "info",
            3600
          );
        }
        return;
      }

      this.filling = true;
      this.render();
      let stats = null;

      try {
        const radios = await DomFiller.waitForRadios(1200);
        if (gen !== this.generation) return;
        if (!radios.length) {
          if (!silentIfAlreadyFilled) {
            Utils.showToast("Belum ada pilihan jawaban di halaman. Pastikan Quiz sudah dimulai.", "info", 3500);
          }
          return;
        }
        const groups = DomFiller.groupAllVisible(entries.map((e) => e.options.length));
        stats = groups
          ? DomFiller.fillByGroups(entries, groups)
          : await DomFiller.fillSequentially(entries, gen);
      } catch {
        if (gen === this.generation) {
          Utils.showToast("Gagal mengisi jawaban. Coba isi manual.", "error", 3500);
        }
      } finally {
        if (gen === this.generation) {
          this.filling = false;
          this.render();
        }
      }

      if (!stats || gen !== this.generation) return;
      if (silentIfAlreadyFilled && stats.filled === 0) return;

      if (stats.filled === 0 && stats.skipped > 0 && stats.failed === 0 && !stats.skippedFallback) {
        Utils.showToast(`Semua ${stats.skipped} soal sudah terisi. Quiz belum disubmit.`, "success", 4000);
        return;
      }

      const pendingCount = entries.filter((e) => e.status !== "done").length;
      const parts = [`Terisi ${stats.filled} soal`];
      if (stats.skipped) parts.push(`${stats.skipped} dilewati (sudah dipilih)`);
      if (stats.skippedFallback) parts.push(`${stats.skippedFallback} dilewati (AI gagal/cek manual)`);
      if (stats.failed) parts.push(`${stats.failed} gagal`);
      if (pendingCount) parts.push(`${pendingCount} belum selesai dianalisis`);

      Utils.showToast(
        `${parts.join(", ")}. Quiz belum disubmit.`,
        stats.filled && !stats.failed && !stats.skippedFallback ? "success" : "info",
        4500
      );
    },

    sortedEntries() {
      return [...this.questionData.values()].sort((a, b) => a.index - b.index);
    },

    render() {
      const container = this.popup?.content;
      if (!container) return;

      const entries = this.sortedEntries();
      const total = entries.length;
      const doneCount = entries.filter((e) => e.status !== "pending").length;
      const hasValidAi = entries.some((e) => e.status === "done" && e.letter && !e.fallback);
      const hasFallback = entries.some((e) => e.status === "done" && e.fallback);
      const pct = total ? Math.round((doneCount / total) * 100) : 0;
      const scrollTop = container.scrollTop;

      this.popup.subtitle.textContent = this.processing
        ? `Menganalisis ${doneCount} dari ${total} soal`
        : `Selesai ${total} soal${this.elapsedLabel ? ` (${this.elapsedLabel})` : ""}`;

      const errorBanner = this.lastAiError
        ? el(
            "div",
            { class: "qh-notice err" },
            ico("info", 14),
            el(
              "span",
              {},
              `Sebagian/semua analisis AI gagal (${this.lastAiError}). Soal yang gagal tidak diisi otomatis.`
            )
          )
        : null;

      container.replaceChildren(
        el(
          "div",
          { class: "qh-progress" },
          el(
            "div",
            { class: "qh-progress-top" },
            el(
              "span",
              {},
              this.processing
                ? `Menganalisis ${doneCount} dari ${total} soal`
                : `${doneCount} dari ${total} soal selesai`
            ),
            el("b", {}, `${pct}%`)
          ),
          el("div", { class: "qh-track" }, el("div", { class: "qh-bar", style: `width:${pct}%;` }))
        ),
        errorBanner,
        el(
          "div",
          { class: "qh-notice" },
          ico("info", 14),
          el(
            "span",
            {},
            "Jawaban AI bisa keliru. Quiz tidak disubmit otomatis, jadi cek dulu lalu selesaikan sendiri di Mentari."
          )
        ),
        el(
          "div",
          { class: "qh-toolbar" },
          el(
            "div",
            { class: "qh-row" },
            el(
              "button",
              {
                class: "qh-btn primary",
                disabled: this.filling || !hasValidAi,
                title: "Pilih jawaban AI di semua soal. Quiz tidak diselesaikan.",
                on: { click: () => this.fillAll(false) },
              },
              ico("sparkles", 13),
              el("span", { class: "qh-lbl" }, this.filling ? "Mengisi..." : "Isi semua jawaban")
            ),
            el(
              "button",
              { class: "qh-btn", on: { click: (e) => this.copyAll(e.currentTarget) } },
              ico("copy", 13),
              el("span", { class: "qh-lbl" }, "Salin semua")
            )
          ),
          hasFallback || this.lastAiError
            ? el(
                "div",
                { class: "qh-row" },
                el(
                  "button",
                  {
                    class: "qh-btn",
                    disabled: this.processing,
                    on: { click: () => this.retryAnalysis() },
                  },
                  ico("refresh", 13),
                  el("span", { class: "qh-lbl" }, "Ulangi Analisis AI")
                ),
                el(
                  "button",
                  {
                    class: "qh-btn",
                    on: { click: () => globalThis.MentariAiClient?.openSettings?.().catch(() => {}) },
                  },
                  el("span", { class: "qh-lbl" }, "Pengaturan API")
                )
              )
            : null,
          el(
            "label",
            { class: "qh-autofill-row" },
            el("span", {}, "Auto-isi cepat saat jawaban siap"),
            el("input", {
              type: "checkbox",
              checked: Utils.isAutoFillEnabled(),
              on: {
                change: (e) => {
                  Utils.setAutoFillEnabled(e.target.checked);
                  if (e.target.checked) this.tryProgressiveAutoFill(this.generation, !this.processing);
                },
              },
            })
          ),
          el("div", { class: "qh-seg" }, ...this.modeButtons())
        ),
        ...entries.map((entry) => this.renderCard(entry))
      );

      container.scrollTop = scrollTop;
    },

    modeButtons() {
      return [
        { mode: VIEW_MODE.RINGKAS, label: "Ringkas", title: "Hanya jawaban" },
        { mode: VIEW_MODE.STANDAR, label: "Standar", title: "Soal dan pilihan" },
        { mode: VIEW_MODE.DETAIL, label: "Detail", title: "Soal, pilihan, dan alasan terbuka" },
      ].map(({ mode, label, title }) =>
        el(
          "button",
          {
            class: mode === this.viewMode ? "active" : "",
            title,
            on: { click: () => this.setMode(mode) },
          },
          label
        )
      );
    },

    setMode(mode) {
      if (this.viewMode === mode) return;
      this.viewMode = mode;
      if (mode === VIEW_MODE.DETAIL) {
        this.sortedEntries()
          .filter((e) => e.status === "done")
          .forEach((e) => this.open.add(e.id));
      }
      this.render();
    },

    toggleReason(id) {
      if (this.open.has(id)) this.open.delete(id);
      else this.open.add(id);
      this.render();
    },

    renderChip(entry) {
      if (entry.status === "pending") {
        return el("span", { class: "qh-chip wait" }, el("span", { class: "qh-spin" }), "Menganalisis");
      }
      if (entry.status === "empty" || !entry.letter) {
        return el("span", { class: "qh-chip empty" }, "Tidak ada pilihan");
      }
      return el(
        "span",
        { class: `qh-chip ok${entry.fallback ? " fb" : ""}` },
        ico(entry.fallback ? "info" : "check", 11),
        entry.fallback ? `Perkiraan ${entry.letter.toUpperCase()}` : `Jawaban ${entry.letter.toUpperCase()}`
      );
    },

    renderCard(entry) {
      const done = entry.status === "done" && Boolean(entry.letter);
      const ansIdx = done ? entry.letter.charCodeAt(0) - 97 : -1;
      const isRingkas = this.viewMode === VIEW_MODE.RINGKAS;
      const isOpen = done && this.open.has(entry.id);
      const body = [];

      if (entry.status === "pending") {
        body.push(...skelLines(["92%", "70%", "80%"]));
      } else if (isRingkas) {
        if (done) {
          body.push(el("div", { class: "qh-short" }, ico("check", 14), el("span", {}, entry.options[ansIdx] || "")));
        }
      } else {
        body.push(el("div", { class: "qh-question" }, entry.question));
        entry.options.forEach((optText, idx) => {
          const isAns = idx === ansIdx;
          body.push(
            el(
              "div",
              { class: `qh-opt${isAns ? " ans" : ""}` },
              el("span", { class: "qh-opt-letter" }, String.fromCharCode(65 + idx)),
              el("span", { class: "qh-opt-text" }, optText),
              isAns ? ico("check", 14) : null
            )
          );
        });
      }

      const foot = done
        ? el(
            "div",
            { class: "qh-foot" },
            el(
              "button",
              { class: "qh-link", on: { click: () => this.toggleReason(entry.id) } },
              isOpen ? "Sembunyikan alasan" : "Lihat alasan",
              el("span", { class: `qh-chev${isOpen ? " up" : ""}` }, ico("chevron", 12))
            ),
            el(
              "button",
              { class: "qh-btn", on: { click: (e) => this.copyOne(entry, e.currentTarget) } },
              ico("copy", 12),
              el("span", { class: "qh-lbl" }, "Salin")
            )
          )
        : null;

      const reason = isOpen
        ? el(
            "div",
            { class: "qh-reason" },
            el("div", { class: "qh-reason-title" }, entry.fallback ? "Perkiraan otomatis (tidak diisi)" : "Alasan AI"),
            entry.reasoning
          )
        : null;

      return el(
        "div",
        { class: `qh-card${done ? " done" : ""}`, "data-question-id": String(entry.id) },
        el(
          "div",
          { class: "qh-card-head" },
          el("span", { class: "qh-num" }, `Soal ${entry.number}`),
          this.renderChip(entry)
        ),
        ...body,
        foot,
        reason
      );
    },

    formatEntry(entry) {
      const hasLetter = Boolean(entry.letter);
      const ansIdx = hasLetter ? entry.letter.charCodeAt(0) - 97 : -1;
      const opts = entry.options
        .map((opt, idx) => `${String.fromCharCode(97 + idx)}. ${opt}${idx === ansIdx ? " ✓" : ""}`)
        .join("\n");
      return [
        `Soal ${entry.number}:`,
        entry.question,
        "",
        opts,
        "",
        `Jawaban AI: ${hasLetter ? entry.letter.toUpperCase() : "-"}${entry.fallback ? " (perkiraan)" : ""}`,
        `Alasan: ${entry.reasoning || "-"}`,
      ].join("\n");
    },

    async copyOne(entry, btn) {
      const ok = await Utils.copyText(this.formatEntry(entry));
      UI.flash(btn, ok ? "Tersalin" : "Gagal");
    },

    async copyAll(btn) {
      const done = this.sortedEntries().filter((e) => e.status === "done" && e.letter);
      if (!done.length) {
        Utils.showToast("Belum ada soal yang selesai dianalisis.", "info", 2500);
        return;
      }
      const txt = `${done.map((e) => this.formatEntry(e)).join("\n\n────────────────────\n\n")}\n\n⚠️ Jawaban dari AI bisa keliru. Cek ulang sebelum memilih.`;
      const ok = await Utils.copyText(txt);
      if (btn) UI.flash(btn, ok ? "Tersalin" : "Gagal");
      if (!ok) Utils.showToast("Gagal menyalin ke clipboard", "error", 2500);
    },
  };

  function onRouteMaybeChanged() {
    if (!QuizApp.isExamPage()) {
      if (QuizApp.quizId || QuizApp.popup || QuizApp.ticking || QuizApp.fetchController) {
        QuizApp.teardownOutsideExam();
      }
      return;
    }
    const currentQuizId = Utils.getQuizId();
    if (currentQuizId && QuizApp.quizId && currentQuizId !== QuizApp.quizId) {
      QuizApp.switchQuiz(currentQuizId);
      return;
    }
    QuizApp.tick();
  }

  const onAiConfigUpdated = () => {
    if (!QuizApp.isExamPage()) return;
    if (QuizApp.questionData.size === 0) {
      QuizApp.tick();
    } else if (QuizApp.lastAiError || QuizApp.sortedEntries().some((e) => e.fallback)) {
      QuizApp.retryAnalysis(true);
    }
  };

  globalThis.MentariAiClient?.onConfigChange?.(onAiConfigUpdated);
  window.addEventListener("popstate", onRouteMaybeChanged);
  window.addEventListener("hashchange", onRouteMaybeChanged);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onRouteMaybeChanged();
  });

  window.navigation?.addEventListener?.("navigatesuccess", onRouteMaybeChanged);
  window.navigation?.addEventListener?.("currententrychange", onRouteMaybeChanged);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onRouteMaybeChanged, { once: true });
  } else {
    onRouteMaybeChanged();
  }
})();
