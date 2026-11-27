(() => {
  "use strict";

  const protocol = globalThis.MentariAiProtocol;
  if (!protocol) return;

  const {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    PROVIDERS,
    normalizeBaseUrl,
    isValidBaseUrl,
    getOriginPattern,
    getProvider,
    detectProviderId,
  } = protocol;

  const providerSelect = document.getElementById("providerSelect");
  const baseUrlInput = document.getElementById("baseUrlInput");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const toggleVisBtn = document.getElementById("toggleVisBtn");
  const modelSelect = document.getElementById("modelSelect");
  const modelInput = document.getElementById("modelInput");
  const loadModelsBtn = document.getElementById("loadModelsBtn");
  const modelHint = document.getElementById("modelHint");
  const resetBtn = document.getElementById("resetBtn");
  const validationMessage = document.getElementById("validationMessage");
  const grantPermBtn = document.getElementById("grantPermBtn");
  const saveBtn = document.getElementById("saveBtn");

  let modelLoadSeq = 0;
  let pendingPermOrigin = "";
  let pendingPermHost = "";
  let lastVerified = null;

  function sendRuntimeOnce(message) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error("API ekstensi tidak tersedia."));
        return;
      }
      chrome.runtime.sendMessage(message, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Gagal berkomunikasi dengan service worker."));
          return;
        }
        resolve(res);
      });
    });
  }

  async function sendRuntime(message) {
    try {
      return await sendRuntimeOnce(message);
    } catch (err) {
      if (!/receiving end does not exist|could not establish connection|message port closed/i.test(String(err?.message || ""))) {
        throw err;
      }
      if (typeof setTimeout === "function") {
        await new Promise((r) => setTimeout(r, 120));
      }
      return sendRuntimeOnce(message);
    }
  }

  function showMessage(text, kind = "error", focusEl = null) {
    if (!validationMessage) return;
    validationMessage.textContent = text;
    validationMessage.className = `msg ${kind}`;
    validationMessage.classList.remove("hidden");
    if (focusEl && kind === "error") {
      focusEl.focus?.();
    }
  }

  function clearMessage() {
    if (!validationMessage) return;
    validationMessage.textContent = "";
    validationMessage.className = "msg hidden";
  }

  function hidePermissionPrompt() {
    pendingPermOrigin = "";
    pendingPermHost = "";
    grantPermBtn?.classList.add("hidden");
  }

  function showPermissionPrompt(originPattern, baseUrl) {
    if (!grantPermBtn || !originPattern) return;
    let host = originPattern;
    try {
      host = new URL(baseUrl).host;
    } catch {
      host = String(originPattern).replace(/\/\*$/, "");
    }
    pendingPermOrigin = originPattern;
    pendingPermHost = host;
    grantPermBtn.textContent = `Izinkan Akses ${host}`;
    grantPermBtn.disabled = false;
    grantPermBtn.classList.remove("hidden");
  }

  function validateRawBaseUrl(rawValue) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) {
      return { ok: false, message: "Base URL tidak boleh kosong. Contoh: https://api.openai.com/v1" };
    }
    if (!isValidBaseUrl(trimmed)) {
      if (/^http:\/\//i.test(trimmed)) {
        return {
          ok: false,
          message: "URL HTTP hanya diizinkan untuk localhost / 127.0.0.1 / [::1]. Gunakan HTTPS.",
        };
      }
      return { ok: false, message: "Base URL tidak valid. Contoh: https://api.openai.com/v1" };
    }
    return { ok: true, baseUrl: normalizeBaseUrl(trimmed) };
  }

  function setModelOptions(models, selectedModel) {
    if (!modelSelect || !modelInput) return;
    if (!Array.isArray(models) || !models.length) {
      modelSelect.classList.add("hidden");
      modelInput.classList.remove("hidden");
      modelInput.value = selectedModel || DEFAULT_MODEL;
      if (modelHint) modelHint.textContent = "Daftar model tidak tersedia. Isi nama model secara manual.";
      return;
    }
    const unique = [...new Set([selectedModel, ...models].filter(Boolean))];
    modelSelect.replaceChildren();
    for (const name of unique) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = selectedModel && unique.includes(selectedModel) ? selectedModel : unique[0];
    modelSelect.classList.remove("hidden");
    modelInput.classList.add("hidden");
    if (modelHint) modelHint.textContent = `${models.length} model tersedia dari server.`;
  }

  function getSelectedModel() {
    if (modelSelect && !modelSelect.classList.contains("hidden") && modelSelect.value) {
      return String(modelSelect.value).trim();
    }
    return String(modelInput?.value || "").trim();
  }

  async function loadModelList(apiKey, rawBaseUrl, selectedModel, provider) {
    const seq = ++modelLoadSeq;
    hidePermissionPrompt();

    if (!apiKey) {
      if (loadModelsBtn) loadModelsBtn.disabled = false;
      setModelOptions([], selectedModel);
      if (modelHint) modelHint.textContent = "Isi API key lalu klik refresh untuk memuat daftar model.";
      return;
    }

    const urlCheck = validateRawBaseUrl(rawBaseUrl);
    if (!urlCheck.ok) {
      if (loadModelsBtn) loadModelsBtn.disabled = false;
      setModelOptions([], selectedModel);
      if (modelHint) modelHint.textContent = urlCheck.message;
      return;
    }

    if (modelHint) modelHint.textContent = "Mengambil daftar model...";
    if (loadModelsBtn) loadModelsBtn.disabled = true;

    try {
      const prov = provider || detectProviderId(urlCheck.baseUrl);
      const res = await sendRuntime({
        type: "mentari:ai-verify",
        payload: {
          apiKey,
          baseUrl: urlCheck.baseUrl,
          provider: prov,
        },
      });
      if (seq !== modelLoadSeq) return;
      if (res?.needsPermission && res.originPattern) {
        showPermissionPrompt(res.originPattern, urlCheck.baseUrl);
      }
      if (!res?.valid) {
        setModelOptions([], selectedModel);
        if (modelHint) modelHint.textContent = res?.message || "Gagal memuat daftar model.";
        return;
      }
      lastVerified = { key: `${apiKey}\0${urlCheck.baseUrl}\0${prov}`, res, ts: Date.now() };
      setModelOptions(res.models || [], selectedModel);
      if (res.warning && modelHint) {
        modelHint.textContent = res.warning;
      }
    } catch (err) {
      if (seq !== modelLoadSeq) return;
      setModelOptions([], selectedModel);
      if (modelHint) modelHint.textContent = err?.message || "Gagal memuat daftar model.";
    } finally {
      if (seq === modelLoadSeq && loadModelsBtn) {
        loadModelsBtn.disabled = false;
      }
    }
  }

  function resetStaleModelLoad(nextHint) {
    modelLoadSeq++;
    lastVerified = null;
    if (loadModelsBtn) loadModelsBtn.disabled = false;
    hidePermissionPrompt();
    clearMessage();
    if (modelHint && nextHint) modelHint.textContent = nextHint;
  }

  async function saveConfiguration() {
    clearMessage();
    hidePermissionPrompt();

    const apiKey = String(apiKeyInput?.value || "").trim();
    const urlCheck = validateRawBaseUrl(baseUrlInput?.value);
    const model = getSelectedModel();
    const provider = String(providerSelect?.value || "").trim() || detectProviderId(urlCheck.baseUrl || "");

    if (!apiKey) {
      showMessage("API key tidak boleh kosong.", "error", apiKeyInput);
      return;
    }
    if (!urlCheck.ok) {
      showMessage(urlCheck.message, "error", baseUrlInput);
      return;
    }
    if (!model) {
      showMessage("Nama model tidak boleh kosong.", "error", modelInput);
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Memeriksa...";
    }

    try {
      const verifyKey = `${apiKey}\0${urlCheck.baseUrl}\0${provider}`;
      const cachedValid = lastVerified && lastVerified.key === verifyKey && Date.now() - lastVerified.ts < 60000;
      const check = cachedValid
        ? lastVerified.res
        : await sendRuntime({
            type: "mentari:ai-verify",
            payload: { apiKey, baseUrl: urlCheck.baseUrl, provider },
          });

      if (!check?.valid) {
        if (check?.needsPermission && check.originPattern) {
          showPermissionPrompt(check.originPattern, urlCheck.baseUrl);
        }
        showMessage(check?.message || "Verifikasi API key gagal.", "error", apiKeyInput);
        return;
      }
      if (!cachedValid) {
        lastVerified = { key: verifyKey, res: check, ts: Date.now() };
      }

      const saved = await sendRuntime({
        type: "mentari:ai-set-config",
        config: { apiKey, baseUrl: urlCheck.baseUrl, model, provider },
      });
      if (!saved?.ok) {
        showMessage(saved?.error || "Gagal menyimpan konfigurasi.", "error");
        return;
      }
      if (baseUrlInput && baseUrlInput.value.trim() !== urlCheck.baseUrl) {
        baseUrlInput.value = urlCheck.baseUrl;
      }

      if (check.warning) {
        showMessage(`Tersimpan! ${check.warning}`, "warn");
      } else {
        showMessage("Konfigurasi valid dan berhasil disimpan!", "ok");
      }
    } catch (err) {
      showMessage(err?.message || "Gagal menyimpan konfigurasi.", "error");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Simpan Konfigurasi";
      }
    }
  }

  function populateProviders() {
    if (!providerSelect) return;
    providerSelect.replaceChildren();
    for (const p of PROVIDERS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      providerSelect.appendChild(opt);
    }
  }

  if (toggleVisBtn && apiKeyInput) {
    toggleVisBtn.addEventListener("click", () => {
      const show = apiKeyInput.type === "password";
      apiKeyInput.type = show ? "text" : "password";
      toggleVisBtn.textContent = show ? "Tutup" : "Lihat";
      toggleVisBtn.setAttribute("aria-label", show ? "Sembunyikan API Key" : "Tampilkan API Key");
      toggleVisBtn.title = show ? "Sembunyikan API Key" : "Tampilkan API Key";
    });
  }

  if (providerSelect) {
    providerSelect.addEventListener("change", () => {
      const prov = getProvider(providerSelect.value);
      resetStaleModelLoad(
        prov.baseUrl
          ? "Provider berubah. Pastikan API key sesuai lalu klik refresh."
          : "Masukkan Base URL endpoint HTTPS atau localhost lalu klik refresh."
      );
      if (prov.baseUrl) {
        if (baseUrlInput) baseUrlInput.value = prov.baseUrl;
        setModelOptions([], prov.model);
      } else {
        if (baseUrlInput) {
          baseUrlInput.value = "";
          baseUrlInput.focus();
        }
        setModelOptions([], getSelectedModel() || DEFAULT_MODEL);
      }
    });
  }

  if (baseUrlInput) {
    baseUrlInput.addEventListener("change", () => {
      if (providerSelect) providerSelect.value = detectProviderId(baseUrlInput.value);
      resetStaleModelLoad("Base URL berubah. Klik refresh untuk memuat ulang daftar model.");
      setModelOptions([], getSelectedModel() || DEFAULT_MODEL);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (providerSelect) providerSelect.value = "route";
      if (baseUrlInput) baseUrlInput.value = DEFAULT_BASE_URL;
      resetStaleModelLoad("Dikembalikan ke default. Pastikan API key sesuai lalu klik refresh.");
      setModelOptions([], DEFAULT_MODEL);
    });
  }

  if (loadModelsBtn) {
    loadModelsBtn.addEventListener("click", () => {
      loadModelList(
        String(apiKeyInput?.value || "").trim(),
        baseUrlInput?.value,
        getSelectedModel() || DEFAULT_MODEL,
        providerSelect?.value
      );
    });
  }

  if (grantPermBtn) {
    grantPermBtn.addEventListener("click", async () => {
      const originPattern = pendingPermOrigin || getOriginPattern(baseUrlInput?.value);
      if (!originPattern || !chrome?.permissions?.request) return;
      grantPermBtn.disabled = true;
      try {
        const granted = await chrome.permissions.request({ origins: [originPattern] });
        if (granted) {
          const hostLabel = pendingPermHost || originPattern;
          lastVerified = null;
          hidePermissionPrompt();
          showMessage(`Izin akses ${hostLabel} diberikan. Memeriksa ulang konfigurasi...`, "ok");
          await saveConfiguration();
        } else {
          showMessage(`Izin akses ${pendingPermHost || originPattern} ditolak.`, "error");
        }
      } catch (err) {
        showMessage(err?.message || "Gagal meminta izin akses host.", "error");
      } finally {
        grantPermBtn.disabled = false;
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveConfiguration();
    });
  }

  async function init() {
    populateProviders();
    try {
      const res = await sendRuntime({ type: "mentari:ai-get-config" });
      const cfg = res?.config || {
        apiKey: "",
        baseUrl: DEFAULT_BASE_URL,
        model: DEFAULT_MODEL,
        provider: "route",
      };
      if (baseUrlInput) baseUrlInput.value = cfg.baseUrl || DEFAULT_BASE_URL;
      if (providerSelect) providerSelect.value = cfg.provider || detectProviderId(cfg.baseUrl);
      if (apiKeyInput) apiKeyInput.value = cfg.apiKey || "";
      setModelOptions([], cfg.model || DEFAULT_MODEL);
      if (cfg.apiKey) {
        await loadModelList(cfg.apiKey, cfg.baseUrl, cfg.model, providerSelect?.value);
      }
    } catch (err) {
      showMessage(err?.message || "Gagal memuat konfigurasi tersimpan.", "error");
    }
  }

  init();
})();
