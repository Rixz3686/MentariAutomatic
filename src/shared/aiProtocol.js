((root) => {
  "use strict";

  if (root.MentariAiProtocol && typeof root.MentariAiProtocol.parseJsonObjects === "function") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = root.MentariAiProtocol;
    }
    return;
  }

  const DEFAULT_BASE_URL = "https://route.bogorcreativa.co.id/v1";
  const DEFAULT_MODEL = "mentari";
  const CONFIG_STORAGE_KEY = "mentari_ai_config";
  const PENDING_PERM_STORAGE_KEY = "mentari_pending_host_origin";

  const PROVIDERS = [
    { id: "route", label: "Mentari Route (default)", baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
    { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
    { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
    { id: "custom", label: "Custom (OpenAI-compatible)", baseUrl: null, model: null },
  ];

  const KNOWN_PROVIDER_BASES = new Set(PROVIDERS.map((p) => p.baseUrl).filter(Boolean));

  const LOGIN_PATH_RE = /^\/login(?:\/|$)/i;
  const KUESIONER_PATH_RE = /\/(kuesioner|kuisioner|quesioner|questionnaire|survey)(\/|$|\?)/i;
  const MY_UNPAM_SURVEY_RE = /\/(kuesioner|kuisioner|quesioner|questionnaire|survey|data-akademik\/khs)(\/|$|\?)/i;

  function isLoopbackHost(hostname) {
    const clean = String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    return clean === "localhost" || clean === "127.0.0.1" || clean === "::1";
  }

  function normalizeBaseUrl(raw) {
    const trimmed = String(raw || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/(?:chat\/completions|models)$/i, "")
      .replace(/\/+$/, "");
    return trimmed || DEFAULT_BASE_URL;
  }

  function isValidBaseUrl(raw) {
    try {
      const parsed = new URL(String(raw || "").trim());
      if (parsed.username || parsed.password || !parsed.hostname) return false;
      if (parsed.protocol === "https:") return true;
      if (parsed.protocol === "http:") return isLoopbackHost(parsed.hostname);
      return false;
    } catch {
      return false;
    }
  }

  function getOriginPattern(raw) {
    try {
      const parsed = new URL(String(raw || "").trim());
      if (parsed.username || parsed.password || !parsed.hostname) return null;
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
        return null;
      }
      const host =
        parsed.hostname.includes(":") && !parsed.hostname.startsWith("[")
          ? `[${parsed.hostname}]`
          : parsed.hostname;
      return `${parsed.protocol}//${host}/*`;
    } catch {
      return null;
    }
  }

  function getProvider(id) {
    return PROVIDERS.find((p) => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
  }

  function detectProviderId(baseUrl) {
    const norm = normalizeBaseUrl(baseUrl);
    const found = PROVIDERS.find((p) => p.baseUrl && p.baseUrl === norm);
    return found ? found.id : "custom";
  }

  function isLoginPath(pathname) {
    return LOGIN_PATH_RE.test(String(pathname || ""));
  }

  function getRouteString(parsed) {
    if (!parsed) return "";
    return `${parsed.pathname || ""}${parsed.hash ? `/${parsed.hash.replace(/^#\/?/, "")}` : ""}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseHtmlSafely(html) {
    const raw = String(html ?? "");
    if (!raw) return "";
    if (typeof DOMParser !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(raw, "text/html");
        return doc?.body?.textContent || "";
      } catch {
        // fallback below
      }
    }
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
  }

  function readPartText(part) {
    if (typeof part === "string") return part;
    if (Array.isArray(part)) return part.map(readPartText).filter(Boolean).join("\n");
    if (!part || typeof part !== "object") return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
    if (typeof part.value === "string") return part.value;
    if (part.text && typeof part.text === "object") return readPartText(part.text);
    if (Array.isArray(part.parts)) return readPartText(part.parts);
    return "";
  }

  function scanConcatenatedJsonObjects(text) {
    const out = [];
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"' && depth > 0) inStr = true;
        else if (ch === "{") {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === "}" && depth > 0) {
          depth--;
          if (depth === 0 && start !== -1) {
            try {
              out.push(JSON.parse(text.slice(start, i + 1)));
            } catch {
              // Ignore malformed chunk
            }
            start = -1;
          }
        }
      }
    }
    return out;
  }

  function parseJsonObjects(raw) {
    const text = String(raw || "").trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fall through to SSE / JSONL / concatenated JSON parsing
    }
    const objects = [];
    for (const line of text.split(/\r?\n/)) {
      const cleaned = line.trim().replace(/^data:\s*/i, "");
      if (!cleaned || cleaned === "[DONE]") continue;
      if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) continue;
      try {
        objects.push(JSON.parse(cleaned));
      } catch {
        // Ignore malformed chunks
      }
    }
    if (objects.length > 0) return objects;
    return scanConcatenatedJsonObjects(text);
  }

  function extractPayloadError(parsedObjects) {
    const list = Array.isArray(parsedObjects) ? parsedObjects : [parsedObjects];
    for (const obj of list) {
      const err = obj && typeof obj === "object" ? obj.error : null;
      if (!err) continue;
      if (typeof err === "string" && err.trim()) return err.trim();
      if (typeof err === "object") {
        const msg = err.message || err.detail || err.code;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
        return "Server AI mengembalikan error";
      }
      return "Server AI mengembalikan error";
    }
    return null;
  }

  function extractFinishReason(parsedObjects) {
    const list = Array.isArray(parsedObjects) ? parsedObjects : [parsedObjects];
    for (const obj of list) {
      if (!obj || typeof obj !== "object") continue;
      const fr =
        obj.choices?.[0]?.finish_reason ||
        obj.candidates?.[0]?.finishReason ||
        obj.finish_reason ||
        obj.finishReason ||
        "";
      if (fr) return String(fr);
    }
    return "";
  }

  function extractChatContent(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (Array.isArray(payload)) {
      return payload.map(extractChatContent).filter(Boolean).join("");
    }
    if (typeof payload !== "object") return "";

    if (Array.isArray(payload.choices) && payload.choices.length) {
      const parts = [];
      for (const ch of payload.choices) {
        if (!ch || typeof ch !== "object") continue;
        const msg = readPartText(ch.message?.content);
        const delta = readPartText(ch.delta?.content);
        const txt = typeof ch.text === "string" ? ch.text : "";
        const val = msg || delta || txt;
        if (val) parts.push(val);
      }
      if (parts.length) return parts.join("");
    }

    if (typeof payload.output_text === "string" && payload.output_text.trim()) {
      return payload.output_text;
    }

    if (Array.isArray(payload.output)) {
      const parts = payload.output
        .map((item) => readPartText(item?.content) || readPartText(item))
        .filter(Boolean);
      if (parts.length) return parts.join("\n");
    }

    if (Array.isArray(payload.candidates) && payload.candidates.length) {
      const cand = payload.candidates[0];
      const text = readPartText(cand?.content?.parts) || readPartText(cand?.content);
      if (text) return text;
    }

    const direct =
      readPartText(payload.message?.content) ||
      readPartText(payload.response?.text) ||
      readPartText(payload.content) ||
      (typeof payload.text === "string" ? payload.text : "");
    return direct || "";
  }

  /**
   * Balanced JSON scanner that extracts valid JSON array/object candidates
   * without being broken by stray brackets/braces in surrounding prose.
   */
  function scanBalancedJson(source) {
    const found = [];
    const len = source.length;
    for (let i = 0; i < len; i++) {
      const startCh = source[i];
      if (startCh !== "[" && startCh !== "{") continue;
      const stack = [startCh === "[" ? "]" : "}"];
      let inString = false;
      let escaped = false;
      for (let j = i + 1; j < len; j++) {
        const ch = source[j];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "[") {
          stack.push("]");
        } else if (ch === "{") {
          stack.push("}");
        } else if (ch === "]" || ch === "}") {
          if (stack[stack.length - 1] !== ch) break;
          stack.pop();
          if (stack.length === 0) {
            const slice = source.slice(i, j + 1);
            try {
              JSON.parse(slice);
              found.push(slice);
              i = j;
            } catch {
              // Not valid JSON, keep scanning
            }
            break;
          }
        }
      }
    }
    return found;
  }

  function extractJsonCandidates(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const seen = new Set();
    const out = [];
    const push = (str) => {
      const s = String(str || "").trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    };

    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    push(stripped);

    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = fenceRe.exec(raw)) !== null) {
      push(match[1]);
    }

    for (const candidate of scanBalancedJson(stripped)) {
      push(candidate);
    }

    return out;
  }

  function errorDetail(status, raw) {
    const text = String(raw || "").trim();
    if (!text) return `HTTP ${status}`;
    if (/^\s*(?:<!doctype|<html)\b/i.test(text)) {
      return `HTTP ${status} (HTML error page)`;
    }
    try {
      const parsed = JSON.parse(text);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const msg =
        first?.error?.message ||
        (typeof first?.error === "string" ? first.error : "") ||
        first?.message ||
        first?.detail ||
        "";
      if (msg) return `HTTP ${status}: ${String(msg).slice(0, 220)}`;
    } catch {
      // Plain text
    }
    return `HTTP ${status}: ${text.replace(/\s+/g, " ").slice(0, 180)}`;
  }

  function isGeminiThinkingModel(model) {
    return /gemini-2\.5/i.test(String(model || ""));
  }

  function parseRetryAfterMs(headerVal) {
    const raw = String(headerVal || "").trim();
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const secs = Number(raw);
      if (Number.isFinite(secs) && secs >= 0) {
        return Math.min(15000, Math.round(secs * 1000));
      }
      return null;
    }
    const ts = Date.parse(raw);
    if (Number.isFinite(ts)) {
      return Math.min(15000, Math.max(0, Math.round(ts - Date.now())));
    }
    return null;
  }

  function isMaxCompletionTokensError(raw) {
    return Boolean(raw && /max_completion_tokens|unsupported parameter[^"]*max_tokens/i.test(String(raw)));
  }

  function extractModelIds(parsed) {
    const rawList = Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.models)
          ? parsed.models
          : [];
    const seen = new Set();
    const out = [];
    for (const item of rawList) {
      const rawId = typeof item === "string" ? item : item?.id || item?.name;
      const clean = String(rawId || "").trim().replace(/^models\//, "");
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
    return out;
  }

  const protocol = {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    CONFIG_STORAGE_KEY,
    PENDING_PERM_STORAGE_KEY,
    PROVIDERS,
    KNOWN_PROVIDER_BASES,
    LOGIN_PATH_RE,
    KUESIONER_PATH_RE,
    MY_UNPAM_SURVEY_RE,
    isLoopbackHost,
    normalizeBaseUrl,
    isValidBaseUrl,
    getOriginPattern,
    getProvider,
    detectProviderId,
    isLoginPath,
    getRouteString,
    escapeHtml,
    parseHtmlSafely,
    readPartText,
    parseJsonObjects,
    extractPayloadError,
    extractFinishReason,
    extractChatContent,
    scanBalancedJson,
    extractJsonCandidates,
    errorDetail,
    isGeminiThinkingModel,
    parseRetryAfterMs,
    isMaxCompletionTokensError,
    extractModelIds,
  };

  root.MentariAiProtocol = protocol;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = protocol;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
