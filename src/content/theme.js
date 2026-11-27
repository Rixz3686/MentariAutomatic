(() => {
  "use strict";
  if (window.__MENTARI_THEME_LOADED__) return;
  window.__MENTARI_THEME_LOADED__ = true;


  const STYLE_ID = "mentari-deep-space-theme";
  const BRAND_LABEL = "v3.0 Revised \u2022 Tuning by Rixz";

  const STARRY_HEADER_BG = [
    "radial-gradient(1px 1px at 14% 24%, rgba(243, 240, 255, 0.78) 50%, transparent 100%)",
    "radial-gradient(1.5px 1.5px at 78% 18%, rgba(221, 214, 254, 0.68) 50%, transparent 100%)",
    "radial-gradient(1px 1px at 42% 68%, rgba(243, 240, 255, 0.52) 50%, transparent 100%)",
    "radial-gradient(1px 1px at 88% 72%, rgba(196, 181, 253, 0.62) 50%, transparent 100%)",
    "radial-gradient(1.5px 1.5px at 26% 82%, rgba(243, 240, 255, 0.48) 50%, transparent 100%)",
    "radial-gradient(ellipse at 85% 0%, rgba(124, 58, 237, 0.34) 0%, transparent 58%)",
    "linear-gradient(135deg, #0B071C 0%, #1F1247 52%, #3B187A 100%)",
  ].join(", ");

  const THEME_CSS = `
    #token-runner-popup,
    #token-runner-popup .mt-pane,
    #qh-panel .qh-content,
    #discus-modal,
    #discus-modal .dm-body,
    #discus-modal .dm-answer,
    #discus-modal .dm-answerbox,
    #discus-modal .dm-editor,
    #discus-modal .dm-html,
    #discus-modal .dm-chat,
    #discus-modal .dm-qlist,
    #mentari-presensi-popup .popup-body,
    #mentari-presensi-popup .presensi-scroll-area,
    .MuiDrawer-paperAnchorRight.MuiDrawer-paper,
    #quick-survey-popup-root .qs-card,
    #route_apiKeyOverlay .route_api-key-popup {
      color-scheme: dark;
      scrollbar-width: thin;
      scrollbar-color: rgba(167, 139, 250, 0.42) #0D091F;
    }
    #discus-modal ::-webkit-scrollbar,
    #mentari-presensi-popup ::-webkit-scrollbar {
      width: 7px;
      height: 7px;
    }
    #discus-modal ::-webkit-scrollbar-track,
    #mentari-presensi-popup ::-webkit-scrollbar-track {
      background: #0D091F;
      border-radius: 99px;
    }
    #discus-modal ::-webkit-scrollbar-thumb,
    #mentari-presensi-popup ::-webkit-scrollbar-thumb {
      background: rgba(167, 139, 250, 0.42);
      border-radius: 99px;
    }
    #discus-modal ::-webkit-scrollbar-thumb:hover,
    #mentari-presensi-popup ::-webkit-scrollbar-thumb:hover {
      background: #A78BFA;
    }
    #token-runner-popup .mt-pane,
    #qh-panel .qh-content {
      scrollbar-gutter: stable;
    }
    #token-runner-popup :is(button, a, input, select, textarea, [tabindex]):focus-visible {
      outline: none !important;
      box-shadow: 0 0 0 2px #A78BFA !important;
    }
    #token-runner-popup .mt-tab:focus-visible {
      outline: none !important;
      box-shadow: inset 0 0 0 1.5px #DDD6FE !important;
    }
    #mentari-kuesioner-hud :is(button, a, input):focus-visible,
    #qh-panel :is(button, a, input, [tabindex]):focus-visible,
    #quick-survey-popup-root :is(button, a, input):focus-visible,
    #discus-modal :is(button, a, input, textarea):focus-visible,
    #route_apiKeyOverlay :is(button, input, select):focus-visible,
    #mentari-presensi-popup :is(button, a, input):focus-visible {
      outline: 2px solid #A78BFA !important;
      outline-offset: 2px !important;
    }
    @media (prefers-reduced-motion: reduce) {
      #mentari-kuesioner-hud,
      #mentari-kuesioner-hud *,
      #token-runner-popup,
      #token-runner-popup *,
      #qh-panel,
      #qh-panel * {
        transition: none !important;
        animation: none !important;
      }
    }

    /* Full-dark Deep Starry Galaxy Space Purple + Unified Pixel Grid */
    #token-runner-popup,
    .mt-toast {
      --mt-sun-1: #8B5CF6 !important;
      --mt-sun-2: #7C3AED !important;
      --mt-sun-3: #C4B5FD !important;
      --mt-grad: linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%) !important;
      --mt-grad-sun: linear-gradient(135deg, #1F1247 0%, #5B21B6 55%, #7C3AED 100%) !important;
      --mt-ok: #4ADE80 !important;
      --mt-ok-soft: rgba(34, 197, 94, 0.14) !important;
      --mt-info: #93C5FD !important;
      --mt-info-soft: rgba(59, 130, 246, 0.14) !important;
      --mt-warn: #FCD34D !important;
      --mt-warn-soft: rgba(245, 158, 11, 0.14) !important;
      --mt-err: #FCA5A5 !important;
      --mt-err-soft: rgba(239, 68, 68, 0.16) !important;
      --mt-text: #F3F0FF !important;
      --mt-text-2: #C4B5FD !important;
      --mt-text-3: #8B80B8 !important;
      --mt-paper: #0D091F !important;
      --mt-surface: #15102E !important;
      --mt-surface-2: #1E1742 !important;
      --mt-line: rgba(167, 139, 250, 0.16) !important;
      --mt-line-2: rgba(167, 139, 250, 0.28) !important;
      --mt-ring: 0 0 0 2px #A78BFA !important;
      --mt-shadow: 0 4px 16px rgba(4, 2, 12, 0.45) !important;
    }
    #token-runner-popup {
      width: 424px !important;
      max-width: calc(100vw - 32px) !important;
      background: #0D091F !important;
      color: #F3F0FF !important;
      box-shadow: 0 24px 64px rgba(4, 2, 12, 0.65), 0 0 0 1px rgba(167, 139, 250, 0.28) !important;
    }
    @media (max-width: 520px) {
      #token-runner-popup {
        width: 100% !important;
        max-width: 100% !important;
      }
    }
    #token-runner-popup ::-webkit-scrollbar-thumb {
      background: rgba(167, 139, 250, 0.42) !important;
    }
    #token-runner-popup .mt-loading,
    #token-runner-popup .mt-loading-bar,
    #token-runner-popup .mt-bar {
      background: linear-gradient(90deg, #5B21B6, #8B5CF6, #C4B5FD) !important;
    }
    #token-runner-popup .mt-loading.active {
      height: 3px !important;
      opacity: 1 !important;
    }
    @keyframes mtGalaxyPulse {
      0%, 100% { opacity: 0.68; }
      50% { opacity: 1; }
    }
    #token-runner-popup .mt-pane.active:empty {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 148px !important;
      color: #C4B5FD !important;
      font-size: 12.5px !important;
      font-weight: 600 !important;
      text-align: center !important;
    }
    #token-runner-popup .mt-pane.active:empty::before {
      content: "Memuat data kelas Mentari...";
      animation: mtGalaxyPulse 1.4s ease-in-out infinite;
    }
    #token-runner-popup .mt-header {
      padding: 16px 16px 14px !important;
      background: ${STARRY_HEADER_BG} !important;
      border-bottom: 1px solid rgba(167, 139, 250, 0.22) !important;
    }
    #token-runner-popup .mt-header::before {
      background: radial-gradient(circle, rgba(167, 139, 250, 0.16), transparent 70%) !important;
    }
    #token-runner-popup .mt-row-between {
      gap: 10px !important;
      align-items: center !important;
    }
    #token-runner-popup .mt-brand {
      gap: 12px !important;
      align-items: center !important;
      min-width: 0 !important;
    }
    #token-runner-popup .mt-logo {
      width: 36px !important;
      height: 36px !important;
      background: #15102E !important;
      color: #C4B5FD !important;
      border: 1px solid rgba(167, 139, 250, 0.35) !important;
      box-shadow: 0 6px 16px rgba(4, 2, 12, 0.45) !important;
    }
    #token-runner-popup .mt-title {
      font-size: 15.5px !important;
      line-height: 1.2 !important;
    }
    #token-runner-popup .mt-sub {
      color: #DDD6FE !important;
      font-size: 11px !important;
      line-height: 1.3 !important;
      margin-top: 2px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      text-shadow: 0 1px 2px rgba(4, 2, 12, 0.4) !important;
    }
    #token-runner-popup .mt-actions {
      gap: 6px !important;
    }
    #token-runner-popup .mt-ibtn {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #EDE9FE !important;
    }
    #token-runner-popup .mt-ibtn:hover {
      background: rgba(167, 139, 250, 0.24) !important;
    }
    #token-runner-popup .mt-tabs {
      display: flex !important;
      align-items: stretch !important;
      gap: 4px !important;
      margin-top: 14px !important;
      padding: 4px !important;
      border-radius: 12px !important;
      background: rgba(8, 6, 20, 0.55) !important;
      border: 1px solid rgba(167, 139, 250, 0.16) !important;
    }
    #token-runner-popup .mt-tab {
      flex: 1 1 auto !important;
      min-width: max-content !important;
      padding: 7px 7px !important;
      gap: 4px !important;
      font-size: 11px !important;
      line-height: 1 !important;
      white-space: nowrap !important;
      border-radius: 9px !important;
      color: #C4B5FD !important;
    }
    #token-runner-popup .mt-tab svg {
      width: 13px !important;
      height: 13px !important;
      flex-shrink: 0 !important;
    }
    #token-runner-popup .mt-tab:hover {
      background: rgba(167, 139, 250, 0.14) !important;
    }
    #token-runner-popup .mt-tab.active {
      background: #7C3AED !important;
      color: #FFFFFF !important;
      box-shadow: 0 4px 12px rgba(4, 2, 12, 0.35) !important;
    }
    #token-runner-popup .mt-badge {
      min-width: 16px !important;
      height: 16px !important;
      padding: 0 4px !important;
      font-size: 9.5px !important;
      line-height: 1 !important;
      box-shadow: none !important;
      font-variant-numeric: tabular-nums !important;
    }
    #token-runner-popup .mt-pane {
      padding: 14px 16px 16px !important;
    }
    #token-runner-popup .mt-btn {
      background: #15102E !important;
      color: #EDE9FE !important;
      border-color: rgba(167, 139, 250, 0.28) !important;
    }
    #token-runner-popup .mt-btn:hover:not(:disabled) {
      background: #1E1742 !important;
      border-color: #A78BFA !important;
    }
    #token-runner-popup .mt-btn.primary {
      background: linear-gradient(135deg, #4C1D95, #7C3AED) !important;
      border-color: transparent !important;
      color: #FFFFFF !important;
      box-shadow: 0 6px 18px rgba(91, 33, 182, 0.42) !important;
    }
    #token-runner-popup .mt-chip,
    #token-runner-popup .mt-chip.muted {
      height: 22px !important;
      padding: 0 9px !important;
      line-height: 1 !important;
      display: inline-flex !important;
      align-items: center !important;
      background: #1E1742 !important;
      color: #C4B5FD !important;
    }
    #token-runner-popup .mt-chip.teal {
      background: rgba(45, 212, 191, 0.14) !important;
      color: #5EEAD4 !important;
    }
    #token-runner-popup .mt-link {
      padding: 12px 14px !important;
      margin-bottom: 12px !important;
      gap: 12px !important;
      border-radius: 14px !important;
      background: #15102E !important;
      color: #F3F0FF !important;
      border: 1px solid rgba(167, 139, 250, 0.22) !important;
    }
    #token-runner-popup .mt-link-ic {
      width: 34px !important;
      height: 34px !important;
      border-radius: 10px !important;
    }
    #token-runner-popup .mt-link > div {
      flex: 1 !important;
      min-width: 0 !important;
    }
    #token-runner-popup .mt-course,
    #token-runner-popup .mt-sec,
    #token-runner-popup .mt-item,
    #token-runner-popup .mt-form,
    #token-runner-popup .mt-student,
    #token-runner-popup .mt-model {
      background: #15102E !important;
      color: #F3F0FF !important;
      border: 1px solid rgba(167, 139, 250, 0.18) !important;
    }
    #token-runner-popup .mt-course {
      border-radius: 14px !important;
      margin-bottom: 12px !important;
    }
    #token-runner-popup .mt-course:last-child,
    #token-runner-popup .mt-sec:last-child,
    #token-runner-popup .mt-student:last-child {
      margin-bottom: 0 !important;
    }
    #token-runner-popup .mt-link:hover {
      background: #1E1742 !important;
      box-shadow: 0 8px 20px rgba(91, 33, 182, 0.28) !important;
    }
    #token-runner-popup .mt-course-head {
      padding: 14px !important;
      background: linear-gradient(180deg, #1A1338, #15102E) !important;
      border-bottom-color: rgba(167, 139, 250, 0.24) !important;
    }
    #token-runner-popup .mt-course-title {
      font-size: 13.5px !important;
      letter-spacing: 0.15px !important;
      line-height: 1.35 !important;
    }
    #token-runner-popup .mt-course-meta {
      gap: 6px !important;
      margin-top: 8px !important;
      align-items: center !important;
    }
    #token-runner-popup .mt-course-code {
      margin-top: 8px !important;
      font-variant-numeric: tabular-nums !important;
    }
    #token-runner-popup .mt-progress {
      margin-top: 12px !important;
      font-variant-numeric: tabular-nums !important;
    }
    #token-runner-popup .mt-progress b {
      color: #A78BFA !important;
      font-variant-numeric: tabular-nums !important;
    }
    #token-runner-popup .mt-track {
      height: 6px !important;
      margin-top: 7px !important;
      background: #241B4B !important;
    }
    #token-runner-popup .mt-course-body {
      padding: 12px 14px !important;
    }
    #token-runner-popup .mt-sec {
      border-radius: 11px !important;
      margin-bottom: 8px !important;
    }
    #token-runner-popup .mt-sec-head {
      padding: 10px 12px !important;
      min-height: 46px !important;
      gap: 10px !important;
    }
    #token-runner-popup .mt-sec-head:hover {
      background: #1E1742 !important;
    }
    #token-runner-popup .mt-sec-ic {
      width: 30px !important;
      height: 30px !important;
      border-radius: 8px !important;
    }
    #token-runner-popup .mt-chev {
      width: 26px !important;
      height: 26px !important;
      color: #C4B5FD !important;
    }
    #token-runner-popup .mt-sec-body {
      padding: 10px !important;
      gap: 8px !important;
    }
    #token-runner-popup .mt-item-wrap {
      margin-bottom: 0 !important;
    }
    #token-runner-popup .mt-item {
      padding: 10px 12px !important;
      gap: 10px !important;
      border-radius: 10px !important;
    }
    #token-runner-popup .mt-sec:hover,
    #token-runner-popup .mt-item:hover,
    #token-runner-popup .mt-student:hover {
      box-shadow: 0 6px 16px rgba(4, 2, 12, 0.36) !important;
    }
    #token-runner-popup .mt-sec:has(.mt-sec-body.active) {
      border-color: rgba(167, 139, 250, 0.45) !important;
      box-shadow: 0 6px 18px rgba(91, 33, 182, 0.24) !important;
    }
    #token-runner-popup .mt-item.done {
      background: #100C24 !important;
      opacity: 0.82;
    }
    #token-runner-popup .ic-quiz {
      background: rgba(124, 58, 237, 0.22) !important;
      color: #C4B5FD !important;
    }
    #token-runner-popup .ic-forum {
      background: rgba(59, 130, 246, 0.18) !important;
      color: #93C5FD !important;
    }
    #token-runner-popup .ic-material {
      background: rgba(245, 158, 11, 0.16) !important;
      color: #FCD34D !important;
    }
    #token-runner-popup .mt-act {
      box-shadow: 0 6px 14px rgba(91, 33, 182, 0.4) !important;
    }
    #token-runner-popup .mt-act.alt {
      background: linear-gradient(135deg, #4C1D95, #6D28D9) !important;
    }
    #token-runner-popup .mt-act:disabled,
    #token-runner-popup .mt-act.done {
      background: #1E1742 !important;
      color: #9E94C9 !important;
      box-shadow: none !important;
    }
    #token-runner-popup .mt-pill {
      background: #1E1742 !important;
      color: #C4B5FD !important;
      border-color: rgba(167, 139, 250, 0.25) !important;
    }
    #token-runner-popup .mt-pill:hover {
      border-color: #A78BFA !important;
      color: #FFFFFF !important;
    }
    #token-runner-popup .mt-pill.reply {
      background: rgba(124, 58, 237, 0.2) !important;
      border-color: rgba(167, 139, 250, 0.4) !important;
      color: #DDD6FE !important;
    }
    #token-runner-popup .mt-konten {
      background: #110D26 !important;
      color: #EDE9FE !important;
    }
    #token-runner-popup .mt-konten :is(p, div, span, li, strong, b, em, h1, h2, h3, h4) {
      color: #EDE9FE !important;
    }
    #token-runner-popup .mt-konten a {
      color: #93C5FD !important;
    }
    #token-runner-popup .mt-topic {
      background: rgba(59, 130, 246, 0.12) !important;
      border-color: rgba(147, 197, 253, 0.26) !important;
      color: #DBEAFE !important;
    }
    #token-runner-popup .mt-topic :is(p, div, span, strong, b) {
      color: #DBEAFE !important;
    }
    #token-runner-popup .mt-topic-title {
      color: #BFDBFE !important;
    }
    #token-runner-popup .mt-reply {
      background: rgba(34, 197, 94, 0.12) !important;
      border-left-color: #4ADE80 !important;
      color: #DCFCE7 !important;
    }
    #token-runner-popup .mt-reply :is(p, div, span, strong, b) {
      color: #DCFCE7 !important;
    }
    #token-runner-popup .mt-warn {
      background: rgba(245, 158, 11, 0.14) !important;
      border: 1px solid rgba(252, 211, 77, 0.28) !important;
      color: #FCD34D !important;
    }
    #token-runner-popup .mt-file {
      background: #1E1742 !important;
      border-color: rgba(147, 197, 253, 0.3) !important;
      color: #93C5FD !important;
    }
    #token-runner-popup .mt-select-btn,
    #token-runner-popup .custom-reply-select-btn,
    #token-runner-popup .mt-textarea,
    #token-runner-popup .mt-input {
      background: #0D091F !important;
      color: #F3F0FF !important;
      border-color: rgba(167, 139, 250, 0.28) !important;
    }
    #token-runner-popup .mt-input::placeholder,
    #token-runner-popup .mt-textarea::placeholder {
      color: #9E94C9 !important;
      opacity: 1 !important;
    }
    #token-runner-popup .mt-select-btn:hover,
    #token-runner-popup .custom-reply-select-btn:hover {
      border-color: #A78BFA !important;
    }
    #token-runner-popup .mt-select-menu,
    #token-runner-popup .mt-select-list,
    #token-runner-popup .custom-reply-options-list {
      background: #15102E !important;
      border-color: rgba(167, 139, 250, 0.3) !important;
      color: #F3F0FF !important;
      box-shadow: 0 16px 36px rgba(4, 2, 12, 0.5) !important;
    }
    #token-runner-popup .mt-select-opt:hover {
      background: #241B4B !important;
      color: #FFFFFF !important;
    }
    #token-runner-popup .mt-nim {
      color: #A78BFA !important;
      font-variant-numeric: tabular-nums !important;
    }
    #token-runner-popup .mt-rank,
    #token-runner-popup .mt-student-count {
      background: rgba(124, 58, 237, 0.22) !important;
      color: #DDD6FE !important;
    }
    #token-runner-popup .mt-profile {
      border-radius: 14px !important;
      padding: 14px !important;
      margin-bottom: 12px !important;
      background: ${STARRY_HEADER_BG} !important;
      border: 1px solid rgba(167, 139, 250, 0.22) !important;
      box-shadow: none !important;
    }
    #token-runner-popup .mt-profile-av {
      background: #15102E !important;
      color: #C4B5FD !important;
    }
    #token-runner-popup .mt-set-ava,
    #token-runner-popup .mt-empty-ic {
      color: #C4B5FD !important;
    }
    #token-runner-popup .mt-model.active {
      background: rgba(34, 197, 94, 0.14) !important;
      border-color: rgba(74, 222, 128, 0.45) !important;
    }
    #token-runner-popup .mt-dot {
      background: #4C4278 !important;
    }
    #token-runner-popup .mt-item-title[style*="#fcd34d"],
    #token-runner-popup .mt-item-title[style*="252, 211, 77"] {
      color: #DDD6FE !important;
    }
    #token-runner-popup .mt-foot {
      padding: 10px 2px 2px !important;
      margin-top: 10px !important;
      border-top: 1px solid rgba(167, 139, 250, 0.14) !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    #token-runner-popup .mt-foot a {
      color: #A78BFA !important;
      font-weight: 600 !important;
      text-decoration: none !important;
    }
    #token-runner-popup .mt-foot a:hover {
      text-decoration: underline !important;
    }
    .mt-toast {
      background: #0D091F !important;
      color: #F3F0FF !important;
      border: 1px solid rgba(167, 139, 250, 0.3) !important;
    }

    /* Forum discus modal (discus.js) */
    #discus-modal-overlay {
      background: rgba(8, 6, 20, 0.72) !important;
    }
    #discus-modal {
      background: #0D091F !important;
      color: #F3F0FF !important;
      border-color: rgba(167, 139, 250, 0.3) !important;
      box-shadow: 0 24px 64px rgba(4, 2, 12, 0.65) !important;
    }
    #discus-modal .dm-header {
      background: ${STARRY_HEADER_BG} !important;
      border-bottom-color: rgba(167, 139, 250, 0.22) !important;
      color: #FFFFFF !important;
    }
    #discus-modal .dm-close {
      color: #DDD6FE !important;
    }
    #discus-modal .dm-close:hover {
      color: #FFFFFF !important;
    }
    #discus-modal .dm-footer {
      background: #15102E !important;
      border-top-color: rgba(167, 139, 250, 0.18) !important;
    }
    #discus-modal .dm-btn,
    #discus-modal .dm-tbtn {
      background: #15102E !important;
      border-color: rgba(167, 139, 250, 0.28) !important;
      color: #EDE9FE !important;
    }
    #discus-modal .dm-btn:hover:not(:disabled),
    #discus-modal .dm-tbtn:hover {
      background: #1E1742 !important;
      border-color: #A78BFA !important;
      color: #FFFFFF !important;
    }
    #discus-modal .dm-btn.active {
      background: #7C3AED !important;
      border-color: #A78BFA !important;
      color: #FFFFFF !important;
    }
    #discus-modal .dm-card,
    #discus-modal .dm-answer,
    #discus-modal .dm-qitem {
      background: #15102E !important;
      border-color: rgba(167, 139, 250, 0.2) !important;
      border-left-color: #7C3AED !important;
      color: #F3F0FF !important;
    }
    #discus-modal .dm-label,
    #discus-modal .dm-subtitle,
    #discus-modal .dm-qnum {
      color: #A78BFA !important;
    }
    #discus-modal .dm-text,
    #discus-modal .dm-qtext {
      color: #F3F0FF !important;
    }
    #discus-modal .dm-qcount,
    #discus-modal .dm-hint {
      color: #8B80B8 !important;
    }
    #discus-modal .dm-warn {
      background: rgba(245, 158, 11, 0.14) !important;
      border-color: rgba(252, 211, 77, 0.3) !important;
      color: #FCD34D !important;
    }
    #discus-modal .dm-info {
      background: rgba(124, 58, 237, 0.16) !important;
      border-color: rgba(167, 139, 250, 0.32) !important;
      color: #DDD6FE !important;
    }
    #discus-modal .dm-error {
      background: rgba(239, 68, 68, 0.16) !important;
      border-color: rgba(252, 165, 165, 0.32) !important;
      color: #FCA5A5 !important;
    }
    #discus-modal .dm-progress {
      background: #1E1742 !important;
    }
    #discus-modal .dm-progress-bar {
      background: linear-gradient(90deg, #5B21B6, #8B5CF6, #C4B5FD) !important;
    }
    #discus-modal .dm-editor,
    #discus-modal .dm-html,
    #discus-modal .dm-chatinput {
      background: #110D26 !important;
      border-color: rgba(167, 139, 250, 0.28) !important;
      color: #F3F0FF !important;
    }
    #discus-modal .dm-html {
      color: #E2E8F0 !important;
    }
    #discus-modal .dm-editor:empty::before,
    #discus-modal .dm-html::placeholder,
    #discus-modal .dm-chatinput::placeholder {
      color: #9E94C9 !important;
      opacity: 1 !important;
    }
    #discus-modal .dm-md,
    #discus-modal .dm-editor,
    #discus-modal .dm-answer,
    #discus-modal .dm-answerbox {
      color: #F3F0FF !important;
    }
    #discus-modal .dm-md :is(p, li, span, div, em, ol, ul),
    #discus-modal .dm-editor :is(p, li, span, div, em, ol, ul) {
      color: #F3F0FF !important;
    }
    #discus-modal .dm-md :is(h1, h2, h3, h4, strong, b),
    #discus-modal .dm-editor :is(h1, h2, h3, h4, strong, b) {
      color: #FFFFFF !important;
    }
    #discus-modal .dm-md blockquote,
    #discus-modal .dm-editor blockquote {
      border-left: 3px solid #8B5CF6 !important;
      background: rgba(124, 58, 237, 0.14) !important;
      color: #DDD6FE !important;
    }
    #discus-modal .dm-md code,
    #discus-modal .dm-editor code {
      background: #1E1742 !important;
      color: #7DD3FC !important;
      border: 1px solid rgba(167, 139, 250, 0.22) !important;
    }
    #discus-modal .dm-md pre,
    #discus-modal .dm-editor pre,
    #discus-modal .dm-code {
      background: #080614 !important;
      color: #E2E8F0 !important;
    }
    #discus-modal .dm-md pre code,
    #discus-modal .dm-editor pre code {
      background: transparent !important;
      border: none !important;
      color: #E2E8F0 !important;
    }
    #discus-modal .dm-md a,
    #discus-modal .dm-editor a {
      color: #C4B5FD !important;
      text-decoration: underline !important;
    }
    #discus-modal .dm-md hr,
    #discus-modal .dm-editor hr {
      border-top-color: rgba(167, 139, 250, 0.24) !important;
    }
    #discus-modal .dm-md th,
    #discus-modal .dm-md td,
    #discus-modal .dm-editor th,
    #discus-modal .dm-editor td {
      border-color: rgba(167, 139, 250, 0.24) !important;
      color: #F3F0FF !important;
    }
    #discus-modal .dm-md th,
    #discus-modal .dm-editor th {
      background: #241B4B !important;
      color: #FFFFFF !important;
    }
    #discus-modal .dm-md tbody tr:nth-child(even) td,
    #discus-modal .dm-editor tbody tr:nth-child(even) td {
      background: rgba(124, 58, 237, 0.08) !important;
    }
    #discus-modal [style*="color:#c2410c"],
    #discus-modal [style*="color: #c2410c"] {
      color: #C4B5FD !important;
    }
    #discus-modal [style*="color:#78716c"],
    #discus-modal [style*="color: #78716c"] {
      color: #9E94C9 !important;
    }
    .salin-topik-btn {
      background: linear-gradient(135deg, #4C1D95, #7C3AED) !important;
      color: #FFFFFF !important;
    }
    .buat-pertanyaan-btn {
      background: linear-gradient(135deg, #3B187A, #6D28D9) !important;
      color: #FFFFFF !important;
    }
    .cari-jawaban-btn {
      background: linear-gradient(135deg, #5B21B6, #8B5CF6) !important;
      color: #FFFFFF !important;
    }
    #discus-modal .dm-editor:focus,
    #discus-modal .dm-chatinput:focus {
      border-color: #8B5CF6 !important;
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25) !important;
    }
    #discus-modal .dm-qitem input[type=checkbox] {
      accent-color: #7C3AED !important;
    }
    #discus-modal .dm-send {
      background: linear-gradient(135deg, #4C1D95, #7C3AED) !important;
      color: #FFFFFF !important;
      border-color: transparent !important;
    }
    #discus-modal .dm-b-user {
      background: rgba(124, 58, 237, 0.22) !important;
      border-color: rgba(167, 139, 250, 0.35) !important;
      color: #F3F0FF !important;
    }
    #discus-modal .dm-b-ai {
      background: #15102E !important;
      border-color: rgba(167, 139, 250, 0.18) !important;
      color: #F3F0FF !important;
    }
    #discus-modal .dm-b-error {
      background: rgba(239, 68, 68, 0.16) !important;
      color: #FCA5A5 !important;
    }
    #discus-modal .dm-codewrap {
      background: #080614 !important;
      border-color: rgba(167, 139, 250, 0.2) !important;
    }
    #discus-modal .dm-codehead {
      background: #15102E !important;
      color: #C4B5FD !important;
    }

    /* Presensi popup & launcher (presensi.js, including .light-theme) */
    #mentari-presensi-popup,
    #presensi-loading {
      background: rgba(8, 6, 20, 0.72) !important;
    }
    #mentari-presensi-popup .presensi-content-container,
    #mentari-presensi-popup.light-theme .presensi-content-container,
    #presensi-loading .loading-card {
      background: #0D091F !important;
      color: #F3F0FF !important;
      border-color: rgba(167, 139, 250, 0.3) !important;
      box-shadow: 0 24px 64px rgba(4, 2, 12, 0.65) !important;
    }
    #presensi-loading .spinner {
      border-color: rgba(167, 139, 250, 0.2) !important;
      border-top-color: #7C3AED !important;
    }
    #mentari-presensi-popup .popup-header,
    #mentari-presensi-popup.light-theme .popup-header {
      background: ${STARRY_HEADER_BG} !important;
      border-bottom-color: rgba(167, 139, 250, 0.22) !important;
    }
    #mentari-presensi-popup .popup-title,
    #mentari-presensi-popup.light-theme .popup-title,
    #mentari-presensi-popup .course-card-header h2,
    #mentari-presensi-popup.light-theme .course-card-header h2 {
      color: #EDE9FE !important;
    }
    #mentari-presensi-popup .course-card,
    #mentari-presensi-popup.light-theme .course-card,
    #mentari-presensi-popup .info-card {
      background: #15102E !important;
      border-color: rgba(167, 139, 250, 0.18) !important;
      color: #F3F0FF !important;
    }
    #mentari-presensi-popup .info-label {
      color: #9E94C9 !important;
      opacity: 1 !important;
    }
    #mentari-presensi-popup .info-value {
      color: #F3F0FF !important;
    }
    #mentari-presensi-popup .course-card-header,
    #mentari-presensi-popup.light-theme .course-card-header {
      background: #1A1338 !important;
    }
    #mentari-presensi-popup .item-row,
    #mentari-presensi-popup.light-theme .item-row {
      background: #1E1742 !important;
      border-color: rgba(167, 139, 250, 0.16) !important;
      color: #F3F0FF !important;
    }
    #mentari-presensi-popup .item-row:hover,
    #mentari-presensi-popup.light-theme .item-row:hover {
      background: #241B4B !important;
      border-color: rgba(167, 139, 250, 0.35) !important;
    }
    #mentari-presensi-popup .item-title,
    #mentari-presensi-popup.light-theme .item-title {
      color: #F3F0FF !important;
    }
    #mentari-presensi-popup .item-row:hover .item-title,
    #mentari-presensi-popup.light-theme .item-row:hover .item-title {
      color: #C4B5FD !important;
    }
    #mentari-presensi-popup .item-meta,
    #mentari-presensi-popup.light-theme .item-meta {
      color: #9E94C9 !important;
      opacity: 1 !important;
    }
    #mentari-presensi-popup .presensi-notice {
      background: rgba(124, 58, 237, 0.16) !important;
      border-color: rgba(167, 139, 250, 0.32) !important;
      color: #DDD6FE !important;
    }
    #mentari-presensi-popup .icon-hadir {
      background: rgba(34, 197, 94, 0.16) !important;
      color: #4ADE80 !important;
    }
    #mentari-presensi-popup .icon-tidak-hadir {
      background: rgba(239, 68, 68, 0.16) !important;
      color: #FCA5A5 !important;
    }
    .presensi-btn,
    #mentari-presensi-popup.light-theme .presensi-btn {
      background: linear-gradient(135deg, #2E1065, #7C3AED) !important;
      color: #FFFFFF !important;
      border: 1px solid rgba(167, 139, 250, 0.38) !important;
      box-shadow: 0 10px 26px rgba(4, 2, 12, 0.55) !important;
    }
    .presensi-btn:hover,
    #mentari-presensi-popup.light-theme .presensi-btn:hover {
      background: linear-gradient(135deg, #4C1D95, #8B5CF6) !important;
      box-shadow: 0 10px 28px rgba(124, 58, 237, 0.45) !important;
    }
    .presensi-btn::after {
      background: #0D091F !important;
      color: #F3F0FF !important;
      border: 1px solid rgba(167, 139, 250, 0.28) !important;
    }
    #mentari-presensi-popup .popup-footer,
    #mentari-presensi-popup.light-theme .popup-footer {
      background: #15102E !important;
      border-top-color: rgba(167, 139, 250, 0.18) !important;
      color: #C4B5FD !important;
    }
    #mentari-presensi-popup [style*="color:#1d4ed8"],
    #mentari-presensi-popup [style*="color: #1d4ed8"] {
      color: #A78BFA !important;
    }
    #mentari-presensi-popup [style*="color:#15803d"],
    #mentari-presensi-popup [style*="color: #15803d"] {
      color: #4ADE80 !important;
    }
    #mentari-presensi-popup [style*="color:#dc2626"],
    #mentari-presensi-popup [style*="color: #dc2626"],
    #mentari-presensi-popup [style*="color:#b91c1c"],
    #mentari-presensi-popup [style*="color: #b91c1c"] {
      color: #FCA5A5 !important;
    }
    #mentari-presensi-popup [style*="color:#92400e"],
    #mentari-presensi-popup [style*="color: #92400e"],
    #mentari-presensi-popup [style*="color:#b45309"],
    #mentari-presensi-popup [style*="color: #b45309"] {
      color: #FCD34D !important;
    }
  `;

  function injectThemeStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = THEME_CSS;
    target.appendChild(style);
  }

  let observedPopup = null;
  let popupObs = null;
  let creditRaf = false;

  function normalizeFooterElement(foot, brandLabel = BRAND_LABEL, doc = globalThis.document) {
    if (!foot) return;
    if (foot.textContent?.includes("Tuning by Rixz") && !foot.textContent?.includes("v1.0")) {
      return;
    }
    const labelSpan = foot.querySelector?.("span");
    if (labelSpan) {
      if (labelSpan.textContent !== brandLabel) {
        labelSpan.textContent = brandLabel;
      }
      return;
    }
    const btn = foot.querySelector?.("button");
    if (btn && doc?.createElement) {
      if (foot.textContent !== `${brandLabel}${btn.textContent || ""}`) {
        foot.textContent = "";
        const span = doc.createElement("span");
        span.textContent = brandLabel;
        foot.append(span, btn);
      }
      return;
    }
    if (foot.textContent !== brandLabel) {
      foot.textContent = brandLabel;
    }
  }

  function normalizePopupCredits() {
    const popup = document.getElementById("token-runner-popup");
    if (popup) {
      const sub = popup.querySelector(".mt-sub");
      if (sub && sub.textContent !== BRAND_LABEL) {
        sub.textContent = BRAND_LABEL;
      }
      popup.querySelectorAll(".mt-foot").forEach((foot) => normalizeFooterElement(foot, BRAND_LABEL));
      if (popup !== observedPopup) {
        observedPopup = popup;
        if (popupObs) popupObs.disconnect();
        popupObs = new MutationObserver(scheduleCreditCheck);
        popupObs.observe(popup, { childList: true, subtree: true });
      }
    }

    const presensiFoot = document.querySelector("#mentari-presensi-popup .popup-footer");
    if (presensiFoot) {
      const target = presensiFoot.firstElementChild || presensiFoot;
      if (target.textContent !== BRAND_LABEL) {
        target.textContent = BRAND_LABEL;
      }
    }
  }

  function scheduleCreditCheck() {
    if (creditRaf) return;
    creditRaf = true;
    requestAnimationFrame(() => {
      creditRaf = false;
      normalizePopupCredits();
    });
  }

  function init() {
    injectThemeStyles();
    normalizePopupCredits();
    if (document.body) {
      const bodyObs = new MutationObserver(scheduleCreditCheck);
      bodyObs.observe(document.body, { childList: true });
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { BRAND_LABEL, normalizeFooterElement };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
