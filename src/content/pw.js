(() => {
  "use strict";

  if (window.__MENTARI_PW_LOADED__) return;
  window.__MENTARI_PW_LOADED__ = true;

  let bgUrl = "";
  try {
    if (typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function") {
      bgUrl = chrome.runtime.getURL("src/assets/background.webp");
    }
  } catch {
    bgUrl = "";
  }

  let rafScheduled = false;
  let observer = null;

  function isLoginPath() {
    return /^\/login(?:\/|$)/i.test(String(location.pathname || ""));
  }

  function cleanupIfNotLogin() {
    if (isLoginPath()) return false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    return true;
  }

  function applyLoginBackground() {
    if (cleanupIfNotLogin()) return true;
    let appliedFullscreen = false;
    let appliedBg = false;

    if (bgUrl) {
      document.querySelectorAll(".fullscreen").forEach((el) => {
        el.style.background = `url("${bgUrl}") no-repeat 50%`;
        el.style.backgroundSize = "cover";
        appliedFullscreen = true;
      });
    }

    document.querySelectorAll(".bg-1").forEach((el) => {
      el.style.background = "rgba(13, 56, 247, 0)";
      appliedBg = true;
    });

    return (appliedFullscreen || !bgUrl) && appliedBg;
  }

  function scheduleApply() {
    if (cleanupIfNotLogin() || rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (applyLoginBackground() && observer) {
        observer.disconnect();
        observer = null;
      }
    });
  }

  function start() {
    if (cleanupIfNotLogin() || applyLoginBackground()) return;
    const root = document.body || document.documentElement;
    if (!root) return;
    observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }, 15000);
  }

  window.addEventListener("popstate", cleanupIfNotLogin);
  window.navigation?.addEventListener?.("navigatesuccess", cleanupIfNotLogin);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
