"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const EXT_ROOT = WORKSPACE_ROOT;
const PROTOCOL_PATH = path.join(EXT_ROOT, "src", "shared", "aiProtocol.js");
const AI_CLIENT_PATH = path.join(EXT_ROOT, "src", "content", "aiClient.js");
const SW_PATH = path.join(EXT_ROOT, "src", "background", "serviceWorker.js");
const POPUP_SCRIPT_PATH = path.join(EXT_ROOT, "src", "popup", "script.js");
const OPTIONS_SCRIPT_PATH = path.join(EXT_ROOT, "src", "options", "options.js");
const DISCUS_PATH = path.join(EXT_ROOT, "src", "content", "discus.js");
const TOKEN_PATH = path.join(EXT_ROOT, "src", "content", "token.js");
const PRESENSI_PATH = path.join(EXT_ROOT, "src", "content", "presensi.js");
const CONTENT_PATH = path.join(EXT_ROOT, "src", "content", "content.js");
const FETCH_GUARD_PATH = path.join(EXT_ROOT, "src", "content", "mentariFetchGuard.js");
const KUISIONER_SOLVER_PATH = path.join(EXT_ROOT, "src", "content", "kuisionerSolver.js");
const QUIZ_SOLVER_PATH = path.join(EXT_ROOT, "src", "content", "quizSolver.js");

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    get length() {
      return store.size;
    },
    key(idx) {
      return [...store.keys()][idx] ?? null;
    },
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
  };
}

function loadFresh(modPath, globalsToClear = []) {
  for (const g of globalsToClear) {
    delete globalThis[g];
  }
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

const NodeConsts = { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8, DOCUMENT_FRAGMENT_NODE: 11 };
const VOID_TAGS = new Set(["IMG", "BR", "HR", "META", "LINK", "EMBED", "INPUT", "BASE"]);

function createDomMockNode(nodeType, tagName = "") {
  const attrs = new Map();
  const node = {
    nodeType,
    tagName,
    parentNode: null,
    childNodes: [],
    style: {},
    textContent: "",
    get firstChild() {
      return this.childNodes[0] || null;
    },
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    },
    get attributes() {
      return [...attrs.entries()].map(([name, value]) => ({ name, value }));
    },
    get innerHTML() {
      return this.childNodes.map(serializeDomMock).join("");
    },
    appendChild(child) {
      if (child.parentNode) {
        const i = child.parentNode.childNodes.indexOf(child);
        if (i >= 0) child.parentNode.childNodes.splice(i, 1);
      }
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) return;
      const i = this.parentNode.childNodes.indexOf(this);
      if (i >= 0) this.parentNode.childNodes.splice(i, 1);
      this.parentNode = null;
    },
    setAttribute(name, value) {
      attrs.set(String(name), String(value));
    },
    removeAttribute(name) {
      attrs.delete(String(name));
    },
    getAttribute(name) {
      return attrs.has(String(name)) ? attrs.get(String(name)) : null;
    },
    replaceWith(...replacements) {
      if (!this.parentNode) return;
      const siblings = this.parentNode.childNodes;
      const idx = siblings.indexOf(this);
      if (idx < 0) return;
      for (const r of replacements) {
        if (r.parentNode && r.parentNode !== this.parentNode) {
          const oldIdx = r.parentNode.childNodes.indexOf(r);
          if (oldIdx >= 0) r.parentNode.childNodes.splice(oldIdx, 1);
        }
        r.parentNode = this.parentNode;
      }
      siblings.splice(idx, 1, ...replacements);
      this.parentNode = null;
    },
  };
  return node;
}

function serializeDomMock(node) {
  if (node.nodeType === NodeConsts.TEXT_NODE) return node.textContent;
  if (node.nodeType === NodeConsts.COMMENT_NODE) return `<!--${node.textContent}-->`;
  const childrenHtml = node.childNodes.map(serializeDomMock).join("");
  if (node.nodeType === NodeConsts.DOCUMENT_FRAGMENT_NODE) return childrenHtml;
  const tag = node.tagName.toLowerCase();
  const attrStr = node.attributes.map((a) => ` ${a.name}="${a.value}"`).join("");
  if (VOID_TAGS.has(node.tagName)) return `<${tag}${attrStr}>`;
  return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
}

function parseHtmlDomMock(html) {
  const body = createDomMockNode(NodeConsts.ELEMENT_NODE, "BODY");
  const stack = [body];
  const tokenRe = /<!--([\s\S]*?)-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tokenRe.exec(html)) !== null) {
    const top = stack[stack.length - 1];
    if (match[1] !== undefined) {
      const c = createDomMockNode(NodeConsts.COMMENT_NODE);
      c.textContent = match[1];
      top.appendChild(c);
    } else if (match[2] !== undefined) {
      const closeTag = match[2].toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === closeTag) {
          stack.length = i;
          break;
        }
      }
    } else if (match[3] !== undefined) {
      const tag = match[3].toUpperCase();
      const rawAttrs = match[4] || "";
      const el = createDomMockNode(NodeConsts.ELEMENT_NODE, tag);
      const attrRe = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
      let am;
      while ((am = attrRe.exec(rawAttrs)) !== null) {
        el.setAttribute(am[1], am[2] ?? am[3] ?? am[4] ?? "");
      }
      top.appendChild(el);
      if (!VOID_TAGS.has(tag) && !rawAttrs.trim().endsWith("/")) {
        stack.push(el);
      }
    } else if (match[5]) {
      const t = createDomMockNode(NodeConsts.TEXT_NODE);
      t.textContent = match[5];
      top.appendChild(t);
    }
  }
  return { body };
}

function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, "ZIP End-of-Central-Directory record not found");
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let ptr = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    assert.equal(buf.readUInt32LE(ptr), 0x02014b50);
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    assert.equal(buf.readUInt32LE(localHeaderOffset), 0x04034b50);
    const lNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    entries.set(name, content);
  }
  return entries;
}

test("aiProtocol: URL validation, loopback HTTP policy, origin patterns, JSON/SSE parsing, embedded errors", () => {
  const protocol = loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);

  assert.equal(protocol.isLoopbackHost("localhost"), true);
  assert.equal(protocol.isLoopbackHost("127.0.0.1"), true);
  assert.equal(protocol.isLoopbackHost("::1"), true);
  assert.equal(protocol.isLoopbackHost("example.com"), false);

  assert.equal(protocol.isValidBaseUrl("https://api.openai.com/v1"), true);
  assert.equal(protocol.isValidBaseUrl("http://localhost:11434/v1"), true);
  assert.equal(protocol.isValidBaseUrl("http://127.0.0.1:8080/v1"), true);
  assert.equal(protocol.isValidBaseUrl("http://[::1]:11434/v1"), true);
  assert.equal(protocol.isValidBaseUrl("http://example.com/v1"), false);
  assert.equal(protocol.isValidBaseUrl("javascript:alert(1)"), false);
  assert.equal(protocol.isValidBaseUrl("https://user:pass@example.com/v1"), false);

  assert.equal(protocol.getOriginPattern("https://custom.example.com:8443/v1/chat"), "https://custom.example.com/*");
  assert.equal(protocol.getOriginPattern("http://localhost:11434/v1"), "http://localhost/*");
  assert.equal(protocol.getOriginPattern("http://[::1]:11434/v1"), "http://[::1]/*");
  assert.equal(protocol.getOriginPattern("http://example.com/v1"), null);
  assert.equal(protocol.getOriginPattern("ftp://bad.example.com"), null);

  assert.equal(protocol.isLoginPath("/login"), true);
  assert.equal(protocol.isLoginPath("/login/otp"), true);
  assert.equal(protocol.isLoginPath("/home"), false);
  assert.equal(protocol.getRouteString(new URL("https://my.unpam.ac.id/#/survey")), "//survey");

  const sseRaw = [
    'data: {"choices":[{"delta":{"content":"Halo "}}]}',
    'data: {"choices":[{"delta":{"content":"Dunia"},"finish_reason":"stop"}]}',
    "data: [DONE]",
  ].join("\n");
  const objs = protocol.parseJsonObjects(sseRaw);
  assert.equal(objs.length, 2);
  assert.equal(protocol.extractChatContent(objs), "Halo Dunia");
  assert.equal(protocol.extractFinishReason(objs), "stop");

  const concatObjs = protocol.parseJsonObjects('{"choices":[{"delta":{"content":"A"}}]}{"choices":[{"delta":{"content":"B"},"finish_reason":"length"}]}');
  assert.equal(concatObjs.length, 2);
  assert.equal(protocol.extractChatContent(concatObjs), "AB");
  assert.equal(protocol.extractFinishReason(concatObjs), "length");

  const errObjs = protocol.parseJsonObjects(JSON.stringify({ error: { message: "Quota habis" } }));
  assert.equal(protocol.extractPayloadError(errObjs), "Quota habis");

  const candidates = protocol.extractJsonCandidates('Catatan [1]: jawabannya\n```json\n[{"n":1,"a":"b"}]\n```');
  assert.ok(candidates.some((c) => c === '[{"n":1,"a":"b"}]'));
  assert.equal(protocol.isGeminiThinkingModel("gemini-2.5-flash"), true);
  assert.equal(protocol.isGeminiThinkingModel("models/gemini-2.5-pro"), true);
  assert.equal(protocol.isGeminiThinkingModel("gpt-4o-mini"), false);
});

test("serviceWorker + aiClient: topP, finishReason on empty HTTP 200, embedded error parity", async (t) => {
  const origChrome = globalThis.chrome;
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.chrome = origChrome;
    globalThis.fetch = origFetch;
    delete globalThis.MentariAiClient;
    delete globalThis.MentariAiProtocol;
  });

  const storeData = {
    mentari_ai_config: {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gemini-2.5-flash",
      provider: "openai",
    },
  };

  let lastFetchBody = null;
  let nextResponse = {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }),
  };

  globalThis.fetch = async (_url, init) => {
    lastFetchBody = JSON.parse(init.body);
    return nextResponse;
  };

  let sw = null;
  globalThis.chrome = {
    runtime: {
      id: "ext-test",
      lastError: null,
      sendMessage: (msg, cb) => {
        sw.handleMessage(msg, { id: "ext-test" }, cb);
      },
    },
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of keys) {
            if (k in storeData) out[k] = storeData[k];
          }
          return out;
        },
        set: async (items) => Object.assign(storeData, items),
        remove: async (keys) => {
          for (const k of keys) delete storeData[k];
        },
      },
    },
    permissions: {
      contains: async () => true,
    },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  sw = loadFresh(SW_PATH);
  const aiClient = loadFresh(AI_CLIENT_PATH, ["MentariAiClient"]);

  // 1. Empty HTTP 200 with finish_reason="length" + topP forwarding via SW
  const swLen = await aiClient.chatCompletion({
    messages: [{ role: "user", content: "hi" }],
    topP: 0.95,
  });
  assert.equal(lastFetchBody.top_p, 0.95);
  assert.equal(lastFetchBody.reasoning_effort, "low");
  assert.equal(swLen.ok, false);
  assert.equal(swLen.status, 200);
  assert.equal(swLen.finishReason, "length");
  assert.equal(swLen.retryable, true);

  // 2. Same scenario on direct path
  const directLen = await aiClient.chatCompletion({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "hi" }],
    topP: 0.95,
    fetchImpl: globalThis.fetch,
  });
  assert.equal(directLen.ok, false);
  assert.equal(directLen.status, 200);
  assert.equal(directLen.finishReason, "length");
  assert.equal(directLen.retryable, true);

  // 3. Content filter finishReason preserved and marked non-retryable on both paths
  nextResponse = {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }),
  };
  const swFilter = await aiClient.chatCompletion({
    messages: [{ role: "user", content: "hi" }],
  });
  const directFilter = await aiClient.chatCompletion({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl: globalThis.fetch,
  });
  assert.equal(swFilter.ok, false);
  assert.equal(swFilter.finishReason, "content_filter");
  assert.equal(swFilter.retryable, false);
  assert.equal(directFilter.finishReason, "content_filter");
  assert.equal(directFilter.retryable, false);

  // 4. Embedded HTTP 200 { error } surfaced on both SW and direct paths
  nextResponse = {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ error: { message: "Quota exceeded" } }),
  };
  const swErr = await aiClient.chatCompletion({ messages: [{ role: "user", content: "hi" }] });
  const directErr = await aiClient.chatCompletion({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl: globalThis.fetch,
  });
  assert.equal(swErr.ok, false);
  assert.equal(swErr.error, "Quota exceeded");
  assert.equal(swErr.retryable, false);
  assert.equal(directErr.ok, false);
  assert.equal(directErr.error, "Quota exceeded");
  assert.equal(directErr.retryable, false);
});

test("aiClient: deduplication, known-provider migration only, onConfigChange, chrome.storage.onChanged", async (t) => {
  const origChrome = globalThis.chrome;
  const origLocalStorage = globalThis.localStorage;
  const origWindow = globalThis.window;
  const origCustomEvent = globalThis.CustomEvent;

  t.after(() => {
    globalThis.chrome = origChrome;
    globalThis.localStorage = origLocalStorage;
    globalThis.window = origWindow;
    globalThis.CustomEvent = origCustomEvent;
    delete globalThis.MentariAiClient;
    delete globalThis.MentariAiProtocol;
  });

  const ls = makeStorage({
    routeApiKey: Buffer.from("sk-legacy-123", "utf8").toString("base64"),
    routeBaseUrl: "https://api.groq.com/openai/v1",
    routeModel: "llama-3.3-70b-versatile",
    routeProvider: "groq",
  });
  globalThis.localStorage = ls;

  const dispatched = [];
  globalThis.CustomEvent = function CustomEvent(type, init) {
    this.type = type;
    this.detail = init?.detail;
  };
  globalThis.window = {
    dispatchEvent: (ev) => dispatched.push(ev.type),
  };

  let getCount = 0;
  let setCount = 0;
  let migrateCount = 0;
  let storedConfig = null;
  const onChangedListeners = [];

  globalThis.chrome = {
    runtime: {
      id: "ext-test",
      lastError: null,
      sendMessage: (msg, cb) => {
        setTimeout(() => {
          if (msg.type === "mentari:ai-get-config") {
            getCount++;
            cb({
              ok: true,
              config: storedConfig || {
                hasApiKey: false,
                apiKey: null,
                baseUrl: "https://route.bogorcreativa.co.id/v1",
                model: "mentari",
                provider: "route",
              },
            });
          } else if (msg.type === "mentari:ai-migrate-legacy") {
            migrateCount++;
            storedConfig = {
              hasApiKey: Boolean(msg.config?.apiKey),
              apiKey: null,
              baseUrl: msg.config.baseUrl,
              model: msg.config.model,
              provider: msg.config.provider,
            };
            cb({ ok: true, config: storedConfig });
          } else if (msg.type === "mentari:ai-set-config") {
            setCount++;
            storedConfig = { ...msg.config, hasApiKey: true, apiKey: null };
            cb({ ok: true, config: storedConfig });
          } else {
            cb({ ok: false });
          }
        }, 15);
      },
    },
    storage: {
      onChanged: {
        addListener: (fn) => onChangedListeners.push(fn),
      },
    },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  const aiClient = loadFresh(AI_CLIENT_PATH, ["MentariAiClient"]);

  const listenerEvents = [];
  aiClient.onConfigChange((cfg) => listenerEvents.push(cfg));

  const [c1, c2, c3] = await Promise.all([
    aiClient.getConfig(),
    aiClient.getConfig(),
    aiClient.getConfig(),
  ]);

  assert.equal(getCount, 1);
  assert.equal(migrateCount, 1);
  assert.equal(setCount, 0);
  assert.equal(c1.hasApiKey, true);
  assert.equal(c1.apiKey, null);
  assert.equal(c2.apiKey, null);
  assert.equal(c3.apiKey, null);
  assert.equal(ls.getItem("routeApiKey"), null);
  assert.equal(ls.getItem("routeBaseUrl"), null);
  assert.equal(ls.getItem("routeModel"), null);
  assert.equal(ls.getItem("routeProvider"), null);
  assert.equal(listenerEvents.length, 1);
  assert.equal(dispatched.length, 0);

  // Unknown custom baseUrl in localStorage must NOT auto-migrate
  storedConfig = null;
  ls.setItem("routeApiKey", Buffer.from("sk-evil-legacy", "utf8").toString("base64"));
  ls.setItem("routeBaseUrl", "https://attacker.example/v1");
  ls.setItem("routeModel", "evil");
  ls.setItem("routeProvider", "custom");
  const afterBlockedMig = await aiClient.getConfig({ forceRefresh: true });
  assert.equal(migrateCount, 1);
  assert.equal(afterBlockedMig.hasApiKey, false);

  // Cross-tab chrome.storage.onChanged updates cache without exposing apiKey
  assert.equal(onChangedListeners.length, 1);
  onChangedListeners[0](
    {
      mentari_ai_config: {
        newValue: {
          apiKey: "sk-live-secret",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          provider: "openai",
        },
      },
    },
    "local"
  );
  const synced = aiClient.getCachedConfigSync();
  assert.equal(synced.hasApiKey, true);
  assert.equal(synced.apiKey, null);
  assert.equal(synced.baseUrl, "https://api.openai.com/v1");
  assert.equal(synced.model, "gpt-4o");
  assert.equal(listenerEvents.length, 2);
});

test("serviceWorker: custom host permission detection, pre-fetch gate, popup-only gate, and SPA injection gating", async (t) => {
  const origChrome = globalThis.chrome;
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.chrome = origChrome;
    globalThis.fetch = origFetch;
    delete globalThis.MentariAiProtocol;
  });

  const storeData = {};
  const injectedCalls = [];
  const grantedOrigins = new Set(["https://api.openai.com/*"]);
  let badgeCalls = 0;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new TypeError("Failed to fetch");
  };

  const containsArgs = [];
  let forceContainsError = false;
  globalThis.chrome = {
    runtime: { id: "ext-test" },
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of keys) {
            if (k in storeData) out[k] = storeData[k];
          }
          return out;
        },
        set: async (items) => Object.assign(storeData, items),
        remove: async (keys) => {
          for (const k of keys) delete storeData[k];
        },
      },
    },
    permissions: {
      contains: async ({ origins }) => {
        containsArgs.push(...origins);
        if (forceContainsError) throw new Error("Invalid match pattern");
        return origins.every((o) => grantedOrigins.has(o));
      },
    },
    action: {
      setBadgeText: async () => { badgeCalls++; },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },
    scripting: {
      executeScript: async (arg) => {
        injectedCalls.push(arg);
        if (arg.func) return [{ result: { core: false, discus: false } }];
        return [];
      },
    },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  const sw = loadFresh(SW_PATH);

  // 1. Custom ungranted host normalizes to portless MV3 pattern WITHOUT calling fetch()
  const verifyRes = await sw.handleAiVerify({
    apiKey: "sk-local",
    baseUrl: "http://localhost:11434/v1",
    provider: "custom",
  });
  assert.equal(verifyRes.valid, false);
  assert.equal(verifyRes.needsPermission, true);
  assert.equal(verifyRes.originPattern, "http://localhost/*");
  assert.equal(fetchCalls, 0);
  assert.equal(storeData.mentari_pending_host_origin.originPattern, "http://localhost/*");
  assert.equal(storeData.mentari_pending_host_origin.host, "localhost:11434");
  assert.ok(containsArgs.includes("http://localhost/*"));
  assert.equal(containsArgs.some((o) => o.includes(":11434")), false);

  const chatRes = await sw.handleAiChat("req1", {
    apiKey: "sk-local",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    messages: [{ role: "user", content: "test" }],
  });
  assert.equal(chatRes.ok, false);
  assert.equal(chatRes.needsPermission, true);
  assert.equal(chatRes.retryable, false);
  assert.equal(fetchCalls, 0);

  // hasOriginPermission fails closed when chrome.permissions.contains rejects
  forceContainsError = true;
  assert.equal(await sw.hasOriginPermission("http://localhost:11434/v1"), false);
  forceContainsError = false;

  // Switching to a different ungranted custom origin clears stale pending host
  await sw.writeStoredConfig({
    apiKey: "sk-other",
    baseUrl: "https://other.example.com/v1",
    model: "custom-model",
    provider: "custom",
  });
  assert.equal("mentari_pending_host_origin" in storeData, false);

  // Once origin is granted, successful chat clears lingering pending host
  grantedOrigins.add("https://other.example.com/*");
  storeData.mentari_pending_host_origin = { originPattern: "https://other.example.com/*", host: "other.example.com", ts: 1 };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }),
  });
  const okChat = await sw.handleAiChat("req2", {
    apiKey: "sk-other",
    baseUrl: "https://other.example.com/v1",
    model: "custom-model",
    messages: [{ role: "user", content: "ping" }],
  });
  assert.equal(okChat.ok, true);
  assert.equal("mentari_pending_host_origin" in storeData, false);

  // 2. popup-action gate rejects content-script sender (sender.tab set)
  let blockedResp = null;
  const asyncWait = sw.handleMessage(
    { type: "mentari:popup-action", tabId: 1, url: "https://mentari.unpam.ac.id/", action: "toggle-panel" },
    { id: "ext-test", tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } },
    (r) => { blockedResp = r; }
  );
  assert.equal(asyncWait, false);
  assert.equal(blockedResp.ok, false);
  assert.match(blockedResp.error, /hanya diizinkan/i);

  // 3. tabs.onUpdated defers SPA URL change during "loading" and injects when "complete" arrives
  sw.handleTabUpdated(7, { url: "https://mentari.unpam.ac.id/home", status: "loading" }, { status: "loading" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(injectedCalls.length, 0);
  assert.ok(badgeCalls >= 1);

  sw.handleTabUpdated(7, { status: "complete" }, { status: "complete", url: "https://mentari.unpam.ac.id/home" });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(injectedCalls.some((c) => c.target?.tabId === 7 && Array.isArray(c.files) && c.files.includes("src/shared/aiProtocol.js")));

  // 4. tabs.onUpdated injects immediately if SPA URL change occurs when tab.status is already "complete"
  sw.handleTabUpdated(8, { url: "https://mentari.unpam.ac.id/home" }, { status: "complete" });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(injectedCalls.some((c) => c.target?.tabId === 8 && Array.isArray(c.files) && c.files.includes("src/shared/aiProtocol.js")));
});

test("serviceWorker: sender isolation, key boundary, abort races, Gemini 422 retry, live tab check, permissions.onAdded", async (t) => {
  const origChrome = globalThis.chrome;
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.chrome = origChrome;
    globalThis.fetch = origFetch;
    delete globalThis.MentariAiProtocol;
  });

  const storeData = {
    mentari_ai_config: {
      apiKey: "sk-stored-secret",
      baseUrl: "https://api.openai.com/v1",
      model: "gemini-2.5-flash",
      provider: "openai",
    },
    mentari_pending_host_origin: {
      originPattern: "https://custom.example.com/*",
      host: "custom.example.com",
      ts: 1,
    },
  };

  let delayStorageGetMs = 0;
  let liveTabUrl = "http://mentari.unpam.ac.id/home";
  const permAddedListeners = [];
  const tabsSendCalls = [];
  const fetchRequests = [];
  let fetchHandler = async (url, init) => {
    fetchRequests.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }),
    };
  };

  globalThis.fetch = (url, init) => fetchHandler(url, init);

  globalThis.chrome = {
    runtime: { id: "ext-test" },
    storage: {
      local: {
        get: async (keys) => {
          if (delayStorageGetMs > 0) {
            await new Promise((r) => setTimeout(r, delayStorageGetMs));
          }
          const out = {};
          for (const k of keys) {
            if (k in storeData) out[k] = storeData[k];
          }
          return out;
        },
        set: async (items) => Object.assign(storeData, items),
        remove: async (keys) => {
          for (const k of keys) delete storeData[k];
        },
      },
    },
    permissions: {
      contains: async () => true,
      onAdded: {
        addListener: (fn) => permAddedListeners.push(fn),
      },
    },
    tabs: {
      get: async (id) => ({ id, url: liveTabUrl }),
      sendMessage: async (tabId, msg) => {
        tabsSendCalls.push({ tabId, msg });
        return { ok: true };
      },
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  const sw = loadFresh(SW_PATH);

  const sendMsgAsync = (msg, sender) =>
    new Promise((resolve) => {
      let settled = false;
      const keepOpen = sw.handleMessage(msg, sender, (res) => {
        settled = true;
        resolve({ called: true, res });
      });
      if (!keepOpen && !settled) {
        resolve({ called: false, res: undefined });
      }
    });

  // Fail-closed sender.id check
  assert.equal((await sendMsgAsync({ type: "mentari:ai-get-config" }, {})).called, false);
  assert.equal((await sendMsgAsync({ type: "mentari:ai-get-config" }, { id: "other-ext" })).called, false);

  // Content sender receives sanitized config (no plaintext apiKey), while extension page receives apiKey
  const contentCfg = await sendMsgAsync(
    { type: "mentari:ai-get-config" },
    { id: "ext-test", frameId: 0, tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } }
  );
  assert.equal(contentCfg.res.ok, true);
  assert.equal(contentCfg.res.config.hasApiKey, true);
  assert.equal(contentCfg.res.config.apiKey, null);

  const myUnpamCfg = await sendMsgAsync(
    { type: "mentari:ai-get-config" },
    { id: "ext-test", frameId: 0, tab: { id: 1, url: "https://my.unpam.ac.id/survey" } }
  );
  assert.equal(myUnpamCfg.res.ok, true);
  assert.equal(myUnpamCfg.res.config.apiKey, null);

  // HTTP / login / iframe / foreign origins are blocked for content senders
  for (const badUrl of [
    "http://mentari.unpam.ac.id/home",
    "https://mentari.unpam.ac.id/login",
    "http://my.unpam.ac.id/survey",
    "https://evil.example/phish",
  ]) {
    const blocked = await sendMsgAsync(
      { type: "mentari:ai-get-config" },
      { id: "ext-test", frameId: 0, tab: { id: 1, url: badUrl } }
    );
    assert.equal(blocked.res.ok, false, `Expected sender rejection for ${badUrl}`);
  }

  const iframeCfg = await sendMsgAsync(
    { type: "mentari:ai-get-config" },
    { id: "ext-test", frameId: 2, tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } }
  );
  assert.equal(iframeCfg.res.ok, false);

  const extCfg = await sendMsgAsync({ type: "mentari:ai-get-config" }, { id: "ext-test" });
  assert.equal(extCfg.res.config.apiKey, "sk-stored-secret");

  // Content scripts cannot call ai-set-config or ai-verify
  const blockedSet = await sendMsgAsync(
    { type: "mentari:ai-set-config", config: { apiKey: "x", baseUrl: "https://api.openai.com/v1" } },
    { id: "ext-test", tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } }
  );
  assert.equal(blockedSet.res.ok, false);

  const blockedVerify = await sendMsgAsync(
    { type: "mentari:ai-verify", payload: { apiKey: "x", baseUrl: "https://api.openai.com/v1" } },
    { id: "ext-test", tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } }
  );
  assert.equal(blockedVerify.res.valid, false);

  // Content sender handleAiChat ignores spoofed payload.baseUrl & payload.apiKey
  fetchRequests.length = 0;
  const contentChat = await sw.handleAiChat(
    "req-tab-spoof",
    {
      baseUrl: "https://evil.example/v1",
      apiKey: "sk-evil",
      messages: [{ role: "user", content: "hi" }],
    },
    { id: "ext-test", tab: { id: 10, url: "https://mentari.unpam.ac.id/home" } }
  );
  assert.equal(contentChat.ok, true);
  assert.equal(fetchRequests.length, 1);
  assert.equal(fetchRequests[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(fetchRequests[0].auth, "Bearer sk-stored-secret");

  // Extension sender cannot exfiltrate stored key to a different baseUrl without explicit apiKey
  fetchRequests.length = 0;
  const mismatchChat = await sw.handleAiChat(
    "req-mismatch",
    { baseUrl: "https://evil.example/v1", messages: [{ role: "user", content: "hi" }] },
    { id: "ext-test" }
  );
  assert.equal(mismatchChat.ok, false);
  assert.equal(mismatchChat.status, 400);
  assert.equal(fetchRequests.length, 0);

  // Gemini 2.5 HTTP 422 triggers retry without reasoning_effort
  fetchRequests.length = 0;
  let attemptIdx = 0;
  fetchHandler = async (url, init) => {
    attemptIdx++;
    const body = JSON.parse(init.body);
    fetchRequests.push({ url, body });
    if (attemptIdx === 1) {
      return { ok: false, status: 422, text: async () => "Unprocessable: reasoning_effort unsupported" };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "OK after 422" }, finish_reason: "stop" }] }),
    };
  };
  const retryRes = await sw.handleAiChat(
    "req-422",
    { messages: [{ role: "user", content: "hi" }] },
    { id: "ext-test", tab: { id: 10 } }
  );
  assert.equal(retryRes.ok, true);
  assert.equal(retryRes.content, "OK after 422");
  assert.equal(fetchRequests.length, 2);
  assert.equal(fetchRequests[0].body.reasoning_effort, "low");
  assert.equal("reasoning_effort" in fetchRequests[1].body, false);

  // Pre-fetch synchronous abort race before readStoredConfig resolves -> 0 fetch calls
  fetchRequests.length = 0;
  delayStorageGetMs = 25;
  const pendingChat = sw.handleAiChat(
    "req-race",
    { messages: [{ role: "user", content: "hi" }] },
    { id: "ext-test", frameId: 0, tab: { id: 21, url: "https://mentari.unpam.ac.id/home" } }
  );
  await sendMsgAsync(
    { type: "mentari:ai-abort", requestId: "req-race" },
    { id: "ext-test", frameId: 0, tab: { id: 21, url: "https://mentari.unpam.ac.id/home" } }
  );
  const abortedRaceRes = await pendingChat;
  assert.equal(abortedRaceRes.aborted, true);
  assert.equal(fetchRequests.length, 0);
  delayStorageGetMs = 0;

  // Cross-tab abort isolation: tab 1 aborting "shared-id" does NOT abort tab 2's "shared-id"
  fetchRequests.length = 0;
  fetchHandler = async (url, init) => {
    fetchRequests.push({ url, body: JSON.parse(init.body) });
    await new Promise((r) => setTimeout(r, 30));
    if (init.signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "tab2 ok" }, finish_reason: "stop" }] }),
    };
  };
  const tab2Chat = sw.handleAiChat(
    "shared-id",
    { messages: [{ role: "user", content: "hi" }] },
    { id: "ext-test", frameId: 0, tab: { id: 2, url: "https://mentari.unpam.ac.id/home" } }
  );
  await sendMsgAsync(
    { type: "mentari:ai-abort", requestId: "shared-id" },
    { id: "ext-test", frameId: 0, tab: { id: 1, url: "https://mentari.unpam.ac.id/home" } }
  );
  const tab2Res = await tab2Chat;
  assert.equal(tab2Res.ok, true);
  assert.equal(tab2Res.content, "tab2 ok");

  // dispatchTabAction checks chrome.tabs.get(tabId).url and blocks HTTP/login even if passed https URL
  liveTabUrl = "http://mentari.unpam.ac.id/home";
  const httpBlocked = await sw.dispatchTabAction(5, "https://mentari.unpam.ac.id/home", "mentari:toggle-panel");
  assert.equal(httpBlocked.ok, false);
  assert.equal(tabsSendCalls.length, 0);

  liveTabUrl = "https://mentari.unpam.ac.id/login";
  const loginBlocked = await sw.dispatchTabAction(5, "https://mentari.unpam.ac.id/home", "mentari:toggle-panel");
  assert.equal(loginBlocked.ok, false);
  assert.equal(tabsSendCalls.length, 0);

  // permissions.onAdded clears matching pending host permission
  assert.equal(permAddedListeners.length, 1);
  await permAddedListeners[0]({ origins: ["https://custom.example.com/*"] });
  assert.equal("mentari_pending_host_origin" in storeData, false);
});

test("kuisionerSolver + quizSolver: heuristics, DB ID guard, a-z options, topP forwarding, AbortSignal", async (t) => {
  const origChrome = globalThis.chrome;
  t.after(() => {
    globalThis.chrome = origChrome;
    delete globalThis.MentariAiProtocol;
    delete globalThis.MentariAiClient;
    delete globalThis.MentariKuisionerSolver;
    delete globalThis.MentariQuizSolver;
  });

  delete globalThis.chrome;
  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  loadFresh(AI_CLIENT_PATH, ["MentariAiClient"]);
  const kSolver = loadFresh(KUISIONER_SOLVER_PATH, ["MentariKuisionerSolver"]);
  const qSolver = loadFresh(QUIZ_SOLVER_PATH, ["MentariQuizSolver"]);

  // Negative Yes/No question
  const negYesNo = kSolver.chooseHeuristicAnswer({
    index: 0,
    question: "Apakah ada kendala dalam pembelajaran daring?",
    options: [{ value: "1", label: "Ya" }, { value: "0", label: "Tidak" }],
  });
  assert.equal(negYesNo.label, "Tidak");
  assert.equal(negYesNo.source, "heuristic");

  // Double negative question
  assert.equal(kSolver.isNegativeQuestion("Dosen tidak pernah terlambat mengajar"), false);
  assert.equal(kSolver.isNegativeQuestion("Materi tidak sulit dipahami namun audio sering macet dan error"), false);

  // Option prefix stripping
  assert.equal(kSolver.stripOptionPrefix("A. Sangat Setuju"), "Sangat Setuju");
  assert.equal(kSolver.stripOptionPrefix("(b) Kurang Baik"), "Kurang Baik");

  // DB ID numeric guard
  const nonNumeric = kSolver.chooseHeuristicAnswer({
    index: 0,
    question: "Apa ibukota Indonesia?",
    options: [
      { value: "101", label: "Bandung" },
      { value: "102", label: "Jakarta" },
      { value: "103", label: "Surabaya" },
    ],
  });
  assert.equal(nonNumeric.source, "heuristic-fallback");

  // quizSolver >5 options (f) + prose brackets + topP 0.1 forwarding
  let capturedBody = null;
  const quizResults = await qSolver.solveAllParallel(
    { apiKey: "sk-q", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    [{ number: 1, question: "Pilih huruf ke-6", options: ["a", "b", "c", "d", "e", "f"] }],
    {
      fetchImpl: async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [{ message: { content: 'Catatan [1]:\n```json\n[{"n":1,"a":"f","r":"Opsi keenam"}]\n```' } }],
          }),
        };
      },
    }
  );
  assert.equal(capturedBody.top_p, 0.1);
  assert.equal(quizResults[0].letter, "f");
  assert.equal(quizResults[0].fallback, false);

  // quizSolver embedded error throws instead of silent empty
  assert.throws(
    () => qSolver.extractChatContent([{ error: { message: "Rate limit" } }]),
    /Rate limit/
  );

  // AbortSignal cancels solveChunk cleanly
  const controller = new AbortController();
  controller.abort();
  const abortedRes = await qSolver.solveChunk(
    { apiKey: "sk-q", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    [{ number: 1, question: "Q", options: ["A", "B"] }],
    { signal: controller.signal }
  );
  assert.equal(abortedRes, null);
});

test("static regression check: all audit fixes present across manifest, options, content scripts, popup, and legacy files", () => {
  const read = (rel) => fs.readFileSync(path.join(EXT_ROOT, rel), "utf8");

  const manifest = JSON.parse(read("manifest.json"));
  const mentariScripts = manifest.content_scripts[0].js;
  const myUnpamScripts = manifest.content_scripts[3].js;
  assert.ok(mentariScripts.includes("src/shared/aiProtocol.js"));
  assert.ok(mentariScripts.indexOf("src/shared/aiProtocol.js") < mentariScripts.indexOf("src/content/aiClient.js"));
  assert.ok(myUnpamScripts.includes("src/shared/aiProtocol.js"));
  assert.ok(myUnpamScripts.indexOf("src/shared/aiProtocol.js") < myUnpamScripts.indexOf("src/content/aiClient.js"));
  assert.equal(manifest.options_ui?.page, "src/options/options.html");
  assert.equal(manifest.optional_host_permissions.includes("http://*/*"), false);
  const petWar = manifest.web_accessible_resources.find((w) => w.resources.includes("pet.html"));
  assert.ok(petWar);
  assert.deepEqual(petWar.matches, ["https://mentari.unpam.ac.id/*"]);

  const aiClientSrc = read("src/content/aiClient.js");
  assert.equal(aiClientSrc.includes("route-api-key-updated"), false);
  assert.equal(aiClientSrc.includes("mentari:ai-config-updated"), false);

  const quizSrc = read("src/content/quiz.js");
  assert.equal(quizSrc.includes("route-api-key-updated"), false);
  assert.match(quizSrc, /const gen = \+\+this\.generation;/);

  const optionsSrc = read("src/options/options.js");
  assert.match(optionsSrc, /let modelLoadSeq = 0;/);
  assert.match(optionsSrc, /validateRawBaseUrl/);
  assert.match(optionsSrc, /chrome\.permissions\.request/);
  const optChangeBlock = optionsSrc.slice(optionsSrc.indexOf("providerSelect.addEventListener"), optionsSrc.indexOf("baseUrlInput"));
  const optResetBlock = optionsSrc.slice(optionsSrc.indexOf("resetBtn.addEventListener"), optionsSrc.indexOf("loadModelsBtn"));
  assert.equal(optChangeBlock.includes("loadModelList"), false);
  assert.equal(optResetBlock.includes("loadModelList"), false);

  const akmSrc = read("src/content/apiKeyManager.js");
  assert.equal(akmSrc.includes("route_apiKeyInput"), false);
  assert.equal(akmSrc.includes("mentari-update-api-key"), false);
  assert.match(akmSrc, /openSettings/);

  const kuisionerSrc = read("src/content/kuisioner.js");
  assert.equal(kuisionerSrc.includes(':not([type="radio"])'), false);
  assert.match(kuisionerSrc, /input\[type="text"\]\[required\]/);

  const qsSrc = read("src/content/QuickSurvey.js");
  assert.equal(qsSrc.includes(':not([type="radio"])'), false);
  assert.match(qsSrc, /input\[type="text"\]\[aria-required="true"\]/);
  assert.match(qsSrc, /characterData:\s*true/);

  const discusSrc = read("src/content/discus.js");
  assert.ok(discusSrc.includes("document.createDocumentFragment()"));

  const tokenSrc = read("src/content/token.js");
  assert.equal(tokenSrc.includes("fetchBypass"), false);
  assert.equal(/onclick\s*=/i.test(tokenSrc), false);
  assert.equal(tokenSrc.includes("route-api-key-updated"), false);
  assert.ok(tokenSrc.includes("this['sanitizeForumHtml'](_0x494248)"));
  assert.ok(tokenSrc.includes("/^https?:\\/\\//i.test(String(_0x526644['link']).trim())"));
  assert.ok(tokenSrc.includes("encodeURIComponent"));
  assert.ok(tokenSrc.includes("CSS.escape"));

  const presensiSrc = read("src/content/presensi.js");
  assert.equal(presensiSrc.includes("fonts.googleapis.com"), false);
  assert.equal(presensiSrc.includes("monitorNetworkRequests"), false);
  assert.ok(presensiSrc.includes("__escP"));
  assert.ok(presensiSrc.includes("__presensiBusy"));

  const homeSrc = read("src/content/home.js");
  const contentSrc = read("src/content/content.js");
  assert.match(homeSrc, /cleanupIfNotLogin/);
  assert.match(contentSrc, /cleanupLoginArtifacts/);

  const popupHtml = read("src/popup/popup.html");
  const popupJs = read("src/popup/script.js");
  assert.match(popupHtml, /id="grantHostPerm"/);
  assert.match(popupHtml, /\.\.\/shared\/aiProtocol\.js/);
  assert.match(popupJs, /chrome\.permissions\.request/);
});

test("discus.js behavioral: sanitize() strips XSS/SVG/MathML & callAI avoids false retries", async () => {
  const discusSrc = fs.readFileSync(DISCUS_PATH, "utf8");
  const mainStart = discusSrc.indexOf(",!(function(){'use strict';");
  const rotIife = discusSrc.slice(0, mainStart) + ");";
  const fnStart = discusSrc.indexOf("function _0x3012(");
  const decoderTail = discusSrc.slice(fnStart);
  const sanStart = discusSrc.indexOf("_0x32e85f={'sanitize'");
  const sanEnd = discusSrc.indexOf(",'rawHtml':", sanStart);
  const sanitizeObjExpr = "({" + discusSrc.slice(sanStart + "_0x32e85f={".length, sanEnd) + "})";

  const sandbox = {
    DOMParser: class {
      parseFromString(str) {
        return parseHtmlDomMock(str);
      }
    },
    document: {
      createDocumentFragment() {
        return createDomMockNode(NodeConsts.DOCUMENT_FRAGMENT_NODE);
      },
    },
    Node: NodeConsts,
    Set,
    Array,
    String,
    RegExp,
  };
  vm.runInNewContext(rotIife + "\n" + decoderTail, sandbox);
  const sanitizer = vm.runInNewContext(`const _0x31e5f9=_0x3012; ${sanitizeObjExpr}`, sandbox);

  const frag = sanitizer.sanitize(
    '<p onclick="alert(1)">Halo <b>dunia</b></p><script>evil()</script><svg onload=alert(1)><script>svgEvil()</script></svg><math><mtext>m</mtext></math><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a><!--secret-->'
  );
  assert.equal(frag.nodeType, NodeConsts.DOCUMENT_FRAGMENT_NODE);
  assert.ok(frag.childNodes.length > 0);
  assert.ok(frag.lastChild);

  const out = serializeDomMock(frag);
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("<svg"), false);
  assert.equal(out.includes("<math"), false);
  assert.equal(out.includes("svgEvil()"), false);
  assert.equal(out.includes("evil()"), false);
  assert.equal(out.includes("<img"), false);
  assert.equal(out.includes("onclick"), false);
  assert.equal(out.includes("javascript:"), false);
  assert.equal(out.includes("secret"), false);
  assert.ok(out.includes("<p>Halo <b>dunia</b></p>"));
  assert.ok(out.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>'));

  // callAI behavioral: embedded error (retryable: false) & content_filter do 1 call; finishReason "length" retries once
  const callAiStart = discusSrc.indexOf("async 'callAI'(");
  const callAiEnd = discusSrc.indexOf(",_0x32e85f=", callAiStart);
  assert.ok(callAiStart > 0 && callAiEnd > callAiStart);
  const callAiExpr = "({" + discusSrc.slice(callAiStart, callAiEnd - 1) + "})";

  const chatCalls = [];
  let responder = () => ({ ok: false, status: 200, retryable: false, error: "Quota exceeded" });

  const callSandbox = {
    AbortController,
    Error,
    String,
    RegExp,
    Boolean,
    Promise,
    MentariAiClient: {
      hasExtensionRuntime: () => true,
      getConfig: async () => ({ hasApiKey: true, apiKey: null, model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" }),
      chatCompletion: async (opts) => {
        chatCalls.push(opts);
        return responder(opts, chatCalls.length);
      },
    },
  };
  callSandbox.globalThis = callSandbox;
  vm.runInNewContext("let _dAbort = null; globalThis.__discusCallAiObj = " + callAiExpr + ";", callSandbox);
  const { callAI } = callSandbox.__discusCallAiObj;

  await assert.rejects(() => callAI("Halo"), /Quota exceeded/);
  assert.equal(chatCalls.length, 1);

  chatCalls.length = 0;
  responder = () => ({ ok: false, status: 200, finishReason: "content_filter", error: "Diblokir" });
  await assert.rejects(() => callAI("Halo"), /filter keamanan/i);
  assert.equal(chatCalls.length, 1);

  chatCalls.length = 0;
  responder = (_opts, attempt) =>
    attempt === 1
      ? { ok: false, status: 200, finishReason: "length", retryable: true, error: "Respons AI kosong." }
      : { ok: true, status: 200, finishReason: "stop", content: "Jawaban sukses" };
  const ans = await callAI("Halo");
  assert.equal(ans, "Jawaban sukses");
  assert.equal(chatCalls.length, 2);
  assert.equal(chatCalls[0].maxTokens, 4096);
  assert.equal(chatCalls[1].maxTokens, 8192);
});

test("token.js behavioral: fetchKuesioner goes through MentariFetchGuard (drop-kuesioner) & sanitizeForumHtml strips XSS", async () => {
  const tokenSrc = fs.readFileSync(TOKEN_PATH, "utf8");
  const guardSrc = fs.readFileSync(FETCH_GUARD_PATH, "utf8");

  const mainStart = tokenSrc.indexOf(",!(function(){'use strict';");
  const decoderPlusRot = tokenSrc.slice(0, mainStart) + "); const _0x59d291 = _0x2799;";

  const fetchStart = tokenSrc.indexOf("async 'fetch'(", 77000);
  const fetchEnd = tokenSrc.indexOf(",async 'fetchCourses'", fetchStart);
  const fkStart = tokenSrc.indexOf("async 'fetchKuesioner'(", 77000);
  const fkEnd = tokenSrc.indexOf(",async 'submitKuesioner'", fkStart);
  const tokenNetExpr = `({ ${tokenSrc.slice(fetchStart, fetchEnd)}, ${tokenSrc.slice(fkStart, fkEnd)} })`;

  let origFetchCalls = 0;
  const fgSandbox = {
    Headers,
    Response,
    URL,
    Buffer,
    TextEncoder,
    Promise,
    Error,
    Set,
    Map,
    Array,
    String,
    RegExp,
    JSON,
    Object,
    Number,
    Math,
    Date,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    document: {
      readyState: "complete",
      getElementById: () => ({ classList: { contains: () => false } }),
      addEventListener: () => {},
    },
    fetch: async () => {
      origFetchCalls++;
      return new Response("{}", { status: 200 });
    },
  };
  fgSandbox.window = fgSandbox;
  fgSandbox.globalThis = fgSandbox;

  vm.runInNewContext(guardSrc, fgSandbox);
  vm.runInNewContext(decoderPlusRot, fgSandbox);
  vm.runInNewContext(
    `const _0x1b8da9 = "https://mentari.unpam.ac.id/api"; const _0x6da2f4 = { authToken: "jwt-test", [_0x59d291(0x2fb)]: "jwt-test" }; globalThis.__tokenNet = ${tokenNetExpr};`,
    fgSandbox
  );

  const kuesRes = await fgSandbox.__tokenNet.fetchKuesioner("C/1", "S 2");
  assert.deepEqual(kuesRes, { kuesioner: [] });
  assert.equal(origFetchCalls, 0);

  // sanitizeForumHtml strict allowlist
  const sanStart = tokenSrc.indexOf("'sanitizeForumHtml'(");
  const sanEnd = tokenSrc.indexOf("},_0x18ab9f=", sanStart);
  const sanExpr = "({" + tokenSrc.slice(sanStart, sanEnd) + "})";

  const sanSandbox = {
    DOMParser: class {
      parseFromString(str) {
        return parseHtmlDomMock(str);
      }
    },
    Set,
    Array,
    String,
    RegExp,
  };
  const { sanitizeForumHtml } = vm.runInNewContext(sanExpr, sanSandbox);
  const cleaned = sanitizeForumHtml(
    '<p style="background:url(https://evil.invalid)">Hi <b>All</b></p><script>x()</script><svg onload=alert(1)><script>y()</script></svg><math><mtext>m</mtext></math><template>t</template><base href="https://evil.invalid"><meta charset=utf-8><form><input></form><a href="javascript:alert(1)">bad</a><a href="https://example.com/ok">good</a><img src="data:text/html,evil" onerror="alert(1)"><img src="data:image/png;base64,AAAA" alt="pic"><!--c-->'
  );
  assert.equal(cleaned.includes("<script"), false);
  assert.equal(cleaned.includes("<svg"), false);
  assert.equal(cleaned.includes("<math"), false);
  assert.equal(cleaned.includes("<template"), false);
  assert.equal(cleaned.includes("<base"), false);
  assert.equal(cleaned.includes("<meta"), false);
  assert.equal(cleaned.includes("<form"), false);
  assert.equal(cleaned.includes("javascript:"), false);
  assert.equal(cleaned.includes("data:text/html"), false);
  assert.equal(cleaned.includes("onerror"), false);
  assert.equal(cleaned.includes("evil.invalid"), false);
  assert.equal(cleaned.includes("<!--c-->"), false);
  assert.ok(cleaned.includes("<p>Hi <b>All</b></p>"));
  assert.ok(cleaned.includes('<a href="https://example.com/ok" target="_blank" rel="noopener noreferrer">good</a>'));
  assert.ok(cleaned.includes('<img src="data:image/png;base64,AAAA" alt="pic">'));
});

test("presensi.js, content.js & options.js behavioral checks", async () => {
  // 1. presensi.js: __escP & fetchPresensiPertemuan (URL-encoding + XSRF-TOKEN preserving '=')
  const preSrc = fs.readFileSync(PRESENSI_PATH, "utf8");
  const escSnippet = preSrc.slice(preSrc.indexOf("const __escP="), preSrc.indexOf(";const __fixPresIcons="));
  const escFn = vm.runInNewContext(`(() => { ${escSnippet}; return __escP; })()`, { globalThis: {} });
  assert.equal(escFn('<img src=x onerror="1">'), "&lt;img src=x onerror=&quot;1&quot;&gt;");

  const iRot = preSrc.indexOf("const _0xdf846d=_0xb426;");
  const iDec = preSrc.indexOf("function _0xb426(");
  const iDecEnd = preSrc.indexOf("const Config={", iDec);
  const iFetchP = preSrc.indexOf("async function fetchPresensiPertemuan(");
  const iFetchPEnd = preSrc.indexOf("const __syncPresensiRoute=", iFetchP);
  let capturedPresensiReq = null;
  const preSandbox = {
    document: { cookie: "a=1; XSRF-TOKEN=abc%3Dval%3D%3D; b=2" },
    encodeURIComponent,
    decodeURIComponent,
    Error,
    fetch: async (url, init) => {
      capturedPresensiReq = { url, init };
      return { ok: true, status: 200, json: async () => [{ status: "Hadir" }] };
    },
  };
  vm.runInNewContext(preSrc.slice(iRot, iDecEnd) + "\n" + preSrc.slice(iFetchP, iFetchPEnd), preSandbox);
  const presData = await preSandbox.fetchPresensiPertemuan("jwt123", "KLS/1", "MK 2");
  assert.deepEqual(presData, [{ status: "Hadir" }]);
  assert.ok(capturedPresensiReq.url.includes("KLS%2F1/MK%202"));
  assert.equal(capturedPresensiReq.init.headers["x-xsrf-token"], "abc=val==");

  // 2. content.js: rejects postMessage from foreign extension origin
  const contentSrc = fs.readFileSync(CONTENT_PATH, "utf8");
  const postedToPet = [];
  const winListeners = {};
  const headerParent = createDomMockNode(NodeConsts.ELEMENT_NODE, "DIV");
  const headerGrid = createDomMockNode(NodeConsts.ELEMENT_NODE, "DIV");
  const courseHeading = createDomMockNode(NodeConsts.ELEMENT_NODE, "H6");
  courseHeading.textContent = "Courses";
  courseHeading.closest = () => headerGrid;
  headerGrid.appendChild(courseHeading);
  headerGrid.closest = () => headerGrid;
  headerParent.appendChild(headerGrid);
  headerParent.insertBefore = (node) => headerParent.appendChild(node);

  const cSandbox = {
    URL,
    Set,
    Array,
    String,
    JSON,
    document: {
      readyState: "complete",
      head: createDomMockNode(NodeConsts.ELEMENT_NODE, "HEAD"),
      body: createDomMockNode(NodeConsts.ELEMENT_NODE, "BODY"),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [courseHeading],
      addEventListener: () => {},
      createElement: (tag) => {
        const el = createDomMockNode(NodeConsts.ELEMENT_NODE, String(tag).toUpperCase());
        el.addEventListener = () => {};
        el.contentWindow = { postMessage: (d, origin) => postedToPet.push({ d, origin }) };
        return el;
      },
    },
    location: { pathname: "/home" },
    chrome: { runtime: { getURL: (p) => `chrome-extension://my-ext/${p}` } },
    localStorage: makeStorage({ mentari_course_data: JSON.stringify([{ kode_course: "C1", nama_course: "AI" }]) }),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout,
    clearTimeout,
    window: {
      addEventListener: (ev, fn) => {
        if (!winListeners[ev]) winListeners[ev] = [];
        winListeners[ev].push(fn);
      },
    },
  };
  cSandbox.globalThis = cSandbox;
  vm.runInNewContext(contentSrc, cSandbox);
  assert.ok(winListeners.message?.length >= 1);
  // Attacker iframe origin tries to trigger mentari-pet-ready
  winListeners.message[0]({
    origin: "chrome-extension://evil-ext",
    source: { postMessage: (d, o) => postedToPet.push({ d, o }) },
    data: { type: "mentari-pet-ready" },
  });
  assert.equal(postedToPet.length, 0);

  // 3. options.js: stale /models cancellation (modelLoadSeq), raw empty & http non-loopback rejection, grantPermBtn
  const protocolSrc = fs.readFileSync(PROTOCOL_PATH, "utf8");
  const optionsSrc = fs.readFileSync(OPTIONS_SCRIPT_PATH, "utf8");

  function makeOptEl(id) {
    const classes = new Set(id === "modelSelect" || id === "grantPermBtn" || id === "validationMessage" ? ["hidden"] : []);
    const listeners = new Map();
    const el = {
      id,
      value: "",
      type: id === "apiKeyInput" ? "password" : "text",
      textContent: "",
      title: "",
      className: "",
      disabled: false,
      children: [],
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
      },
      setAttribute: () => {},
      focus: () => {},
      replaceChildren: (...nodes) => {
        el.children = nodes;
      },
      appendChild: (node) => {
        el.children.push(node);
        return node;
      },
      addEventListener: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      trigger: async (ev) => {
        for (const fn of listeners.get(ev) || []) {
          await fn();
        }
      },
    };
    return el;
  }

  const optIds = [
    "providerSelect", "baseUrlInput", "apiKeyInput", "toggleVisBtn",
    "modelSelect", "modelInput", "loadModelsBtn", "modelHint",
    "resetBtn", "validationMessage", "grantPermBtn", "saveBtn",
  ];
  const optEls = new Map(optIds.map((id) => [id, makeOptEl(id)]));
  let resolveSlowVerify = null;
  let verifyCount = 0;

  const optSandbox = {
    URL,
    Set,
    String,
    Promise,
    Error,
    document: {
      getElementById: (id) => optEls.get(id) || null,
      createElement: () => makeOptEl("opt"),
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          if (msg.type === "mentari:ai-get-config") {
            cb({ ok: true, config: { apiKey: "", baseUrl: "https://route.bogorcreativa.co.id/v1", model: "mentari", provider: "route" } });
            return;
          }
          if (msg.type === "mentari:ai-verify") {
            verifyCount++;
            if (msg.payload.baseUrl === "https://needs.perm.example/v1") {
              cb({ valid: false, needsPermission: true, originPattern: "https://needs.perm.example/*", message: "Izin diperlukan" });
              return;
            }
            new Promise((r) => { resolveSlowVerify = r; }).then((val) => cb(val));
            return;
          }
          cb({ ok: false });
        },
      },
      permissions: {
        request: async () => true,
      },
    },
  };
  optSandbox.globalThis = optSandbox;
  vm.runInNewContext(protocolSrc + "\n" + optionsSrc, optSandbox);
  await new Promise((r) => setTimeout(r, 15));

  // Empty custom URL must be rejected before calling SW
  optEls.get("apiKeyInput").value = "sk-test";
  optEls.get("baseUrlInput").value = "";
  optEls.get("modelInput").value = "gpt-4o";
  await optEls.get("saveBtn").trigger("click");
  assert.equal(verifyCount, 0);
  assert.match(optEls.get("validationMessage").textContent, /tidak boleh kosong/i);

  // Non-loopback http:// must be rejected before calling SW
  optEls.get("baseUrlInput").value = "http://example.com/v1";
  await optEls.get("saveBtn").trigger("click");
  assert.equal(verifyCount, 0);
  assert.match(optEls.get("validationMessage").textContent, /HTTP hanya diizinkan untuk localhost/i);

  // needsPermission reveals grantPermBtn
  optEls.get("baseUrlInput").value = "https://needs.perm.example/v1";
  await optEls.get("saveBtn").trigger("click");
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(verifyCount, 1);
  assert.equal(optEls.get("grantPermBtn").classList.contains("hidden"), false);

  // Stale /models load cancelled when providerSelect changes mid-flight
  optEls.get("baseUrlInput").value = "https://route.bogorcreativa.co.id/v1";
  optEls.get("loadModelsBtn").trigger("click");
  assert.equal(verifyCount, 2);
  optEls.get("providerSelect").value = "groq";
  await optEls.get("providerSelect").trigger("change");
  resolveSlowVerify({ valid: true, models: ["stale-model-should-not-apply"] });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(optEls.get("modelSelect").children.some((c) => c.value === "stale-model-should-not-apply"), false);
});

test("popup/script.js: hides custom host button without pending entry and normalizes legacy :port pending origin", async () => {
  const protocolSrc = fs.readFileSync(PROTOCOL_PATH, "utf8");
  const popupSrc = fs.readFileSync(POPUP_SCRIPT_PATH, "utf8");

  async function runPopupHarness({ storeData, permissionsGranted }) {
    const containsCalls = [];
    const requestCalls = [];
    const removedKeys = [];

    function makeEl(id) {
      const classes = new Set(id === "grantHostPerm" || id === "runKuesioner" || id === "quickLinks" ? ["hidden"] : []);
      const listeners = new Map();
      return {
        id,
        textContent: "",
        className: "",
        disabled: false,
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            if (force === undefined ? classes.has(c) : !force) classes.delete(c);
            else classes.add(c);
          },
          contains: (c) => classes.has(c),
        },
        addEventListener: (ev, fn) => {
          if (!listeners.has(ev)) listeners.set(ev, []);
          listeners.get(ev).push(fn);
        },
        clickAsync: async () => {
          for (const fn of listeners.get("click") || []) {
            await fn();
          }
        },
      };
    }

    const elements = new Map(
      ["runToken", "runKuesioner", "grantHostPerm", "openSettings", "quickLinks", "openMentari", "openMyUnpam", "pageBadge", "status"].map(
        (id) => [id, makeEl(id)]
      )
    );

    const sandbox = {
      URL,
      Set,
      String,
      Promise,
      Error,
      setTimeout,
      document: {
        getElementById: (id) => elements.get(id) || null,
      },
      window: {
        close: () => {},
      },
      chrome: {
        tabs: {
          query: async () => [{ id: 1, url: "https://mentari.unpam.ac.id/home" }],
          create: () => {},
        },
        storage: {
          local: {
            get: async (keys) => {
              const out = {};
              for (const k of keys) {
                if (k in storeData) out[k] = storeData[k];
              }
              return out;
            },
            remove: async (keys) => {
              removedKeys.push(...keys);
              for (const k of keys) delete storeData[k];
            },
          },
        },
        permissions: {
          contains: async ({ origins }) => {
            containsCalls.push(...origins);
            return permissionsGranted;
          },
          request: async ({ origins }) => {
            requestCalls.push(...origins);
            return true;
          },
        },
        runtime: {
          lastError: null,
          sendMessage: (_msg, cb) => cb?.({ ok: true }),
        },
      },
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(protocolSrc + "\n" + popupSrc, sandbox);
    await new Promise((r) => setTimeout(r, 20));
    return {
      grantBtn: elements.get("grantHostPerm"),
      containsCalls,
      requestCalls,
      removedKeys,
    };
  }

  // Case A: Custom CORS endpoint works without pending entry -> button stays hidden
  const caseA = await runPopupHarness({
    storeData: {
      mentari_ai_config: {
        apiKey: "sk-custom",
        baseUrl: "https://deepseek.example.com/v1",
        model: "deepseek-chat",
        provider: "custom",
      },
    },
    permissionsGranted: false,
  });
  assert.equal(caseA.grantBtn.classList.contains("hidden"), true);
  assert.equal(caseA.containsCalls.length, 0);

  // Case B: Legacy :port pending origin is stripped for permissions.contains & label derived strictly from normalized pattern
  const caseB = await runPopupHarness({
    storeData: {
      mentari_pending_host_origin: {
        originPattern: "http://localhost:11434/*",
        host: "spoofed-host.invalid",
        ts: Date.now(),
      },
    },
    permissionsGranted: false,
  });
  assert.deepEqual(caseB.containsCalls, ["http://localhost/*"]);
  assert.equal(caseB.grantBtn.classList.contains("hidden"), false);
  assert.equal(caseB.grantBtn.textContent, "Izinkan Akses localhost");
  await caseB.grantBtn.clickAsync();
  assert.deepEqual(caseB.requestCalls, ["http://localhost/*"]);
  assert.ok(caseB.removedKeys.includes("mentari_pending_host_origin"));

  // Case C: Pending entry already granted -> button stays hidden and storage key removed
  const caseCStore = {
    mentari_pending_host_origin: {
      originPattern: "http://localhost/*",
      host: "localhost:11434",
      ts: Date.now(),
    },
  };
  const caseC = await runPopupHarness({
    storeData: caseCStore,
    permissionsGranted: true,
  });
  assert.deepEqual(caseC.containsCalls, ["http://localhost/*"]);
  assert.equal(caseC.grantBtn.classList.contains("hidden"), true);
  assert.equal("mentari_pending_host_origin" in caseCStore, false);
});

test("serviceWorker: isExtensionPageSender enforces options.html, popup.html, and rejects pet.html", async () => {
  const storeData = {
    mentari_ai_config: {
      apiKey: "sk-stored-secret",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      provider: "openai",
    },
  };
  global.fetch = async (url) => {
    if (String(url).endsWith("/models")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }) };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }),
    };
  };
  global.chrome = {
    runtime: {
      id: "ext-test",
      getURL: (rel) => `chrome-extension://ext-test/${String(rel || "").replace(/^\/+/, "")}`,
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of keys || []) if (k in storeData) out[k] = storeData[k];
          return out;
        },
        set: async (obj) => Object.assign(storeData, obj),
        remove: async (keys) => {
          for (const k of keys || []) delete storeData[k];
        },
      },
    },
    permissions: { contains: async () => true, onAdded: { addListener: () => {} } },
    tabs: {
      get: async (id) => ({ id, url: "https://mentari.unpam.ac.id/home" }),
      sendMessage: async () => ({ ok: true }),
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  const sw = loadFresh(SW_PATH);

  const sendMsgAsync = (msg, sender) =>
    new Promise((resolve) => {
      let settled = false;
      const keepOpen = sw.handleMessage(msg, sender, (res) => {
        settled = true;
        resolve({ called: true, res });
      });
      if (!keepOpen && !settled) resolve({ called: false, res: undefined });
    });

  const optionsSender = {
    id: "ext-test",
    frameId: 0,
    url: "chrome-extension://ext-test/src/options/options.html",
    tab: { id: 99, url: "chrome-extension://ext-test/src/options/options.html" },
  };
  const optCfg = await sendMsgAsync({ type: "mentari:ai-get-config" }, optionsSender);
  assert.equal(optCfg.res.ok, true);
  assert.equal(optCfg.res.config.apiKey, "sk-stored-secret");

  const optVerify = await sendMsgAsync(
    { type: "mentari:ai-verify", payload: { apiKey: "sk-new", baseUrl: "https://api.openai.com/v1" } },
    optionsSender
  );
  assert.equal(optVerify.res.valid, true);

  const optSet = await sendMsgAsync(
    { type: "mentari:ai-set-config", config: { apiKey: "sk-updated", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" } },
    optionsSender
  );
  assert.equal(optSet.res.ok, true);

  const optPopupAction = await sendMsgAsync(
    { type: "mentari:popup-action", tabId: 1, url: "https://mentari.unpam.ac.id/home", action: "toggle-panel" },
    optionsSender
  );
  assert.equal(optPopupAction.res.ok, false);

  const popupSender = { id: "ext-test", url: "chrome-extension://ext-test/src/popup/popup.html" };
  const popCfg = await sendMsgAsync({ type: "mentari:ai-get-config" }, popupSender);
  assert.equal(popCfg.res.ok, true);
  assert.equal(popCfg.res.config.hasApiKey, true);
  assert.equal(popCfg.res.config.apiKey, null);

  const popSet = await sendMsgAsync(
    { type: "mentari:ai-set-config", config: { apiKey: "sk-hack", baseUrl: "https://api.openai.com/v1" } },
    popupSender
  );
  assert.equal(popSet.res.ok, false);

  const popAction = await sendMsgAsync(
    { type: "mentari:popup-action", tabId: 1, url: "https://mentari.unpam.ac.id/home", action: "toggle-panel" },
    popupSender
  );
  assert.equal(popAction.res.ok, true);

  for (const petSender of [
    { id: "ext-test", frameId: 0, url: "chrome-extension://ext-test/pet.html", tab: { id: 55, url: "chrome-extension://ext-test/pet.html" } },
    { id: "ext-test", url: "chrome-extension://ext-test/pet.html" },
  ]) {
    assert.equal((await sendMsgAsync({ type: "mentari:ai-get-config" }, petSender)).res.ok, false);
    assert.equal((await sendMsgAsync({ type: "mentari:ai-set-config", config: { apiKey: "x", baseUrl: "https://api.openai.com/v1" } }, petSender)).res.ok, false);
    assert.equal((await sendMsgAsync({ type: "mentari:ai-verify", payload: { apiKey: "x", baseUrl: "https://api.openai.com/v1" } }, petSender)).res.valid, false);
    assert.equal((await sendMsgAsync({ type: "mentari:popup-action", tabId: 1, url: "https://mentari.unpam.ac.id/home", action: "toggle-panel" }, petSender)).res.ok, false);
    assert.equal((await sendMsgAsync({ type: "mentari:ai-chat", requestId: "r-pet", payload: { messages: [{ role: "user", content: "hi" }] } }, petSender)).res.ok, false);
  }
});

test("build parity: root extension source matches ZIP archive without duplicate unpacked folder", () => {
  const legacyUnpackedDir = path.join(WORKSPACE_ROOT, "dist", "mentari-mod-edge-chrome");
  const srcManifest = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "manifest.json"), "utf8"));
  const version = String(srcManifest.version || "3.0").trim();
  const zipPath = path.join(WORKSPACE_ROOT, "dist", `mentari-mod-edge-chrome-v${version}.zip`);

  assert.equal(fs.existsSync(legacyUnpackedDir), false, "Duplicate unpacked dist folder must not exist");
  assert.ok(fs.existsSync(zipPath), "Dist ZIP archive must exist");

  const expectedFiles = ["LICENSE", "manifest.json", "pet.html", "pet.js"];
  function walkSrc(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "__pycache__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkSrc(full);
      else expectedFiles.push(path.relative(EXT_ROOT, full).replace(/\\/g, "/"));
    }
  }
  walkSrc(path.join(EXT_ROOT, "src"));
  expectedFiles.sort();

  const zipEntries = readZipEntries(zipPath);
  const zipFiles = [...zipEntries.keys()].sort();
  assert.deepEqual(zipFiles, expectedFiles);

  // Every manifest-referenced resource including options_ui must exist in ZIP
  assert.ok(zipEntries.has("src/options/options.html"));
  assert.ok(zipEntries.has("src/options/options.js"));

  for (const rel of expectedFiles) {
    const srcBuf = fs.readFileSync(path.join(EXT_ROOT, rel));
    const zipBuf = zipEntries.get(rel);
    assert.ok(Buffer.isBuffer(zipBuf));
    if (rel === "manifest.json") {
      assert.deepEqual(JSON.parse(zipBuf.toString("utf8")), srcManifest);
    } else {
      assert.equal(Buffer.compare(zipBuf, srcBuf), 0, `ZIP entry mismatch: ${rel}`);
    }
  }
});

test("adapter tuning: URL normalization, capability caching, max_completion_tokens recovery, Retry-After, verify retry, SW cold-start, options verify cache", async (t) => {
  const origChrome = globalThis.chrome;
  const origFetch = globalThis.fetch;
  t.after(() => {
    globalThis.chrome = origChrome;
    globalThis.fetch = origFetch;
    delete globalThis.MentariAiClient;
    delete globalThis.MentariAiProtocol;
  });

  const protocol = loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);

  // 1. normalizeBaseUrl strips accidental /chat/completions and /models suffixes
  assert.equal(protocol.normalizeBaseUrl("https://api.openai.com/v1/chat/completions/"), "https://api.openai.com/v1");
  assert.equal(protocol.normalizeBaseUrl("https://api.openai.com/v1/models"), "https://api.openai.com/v1");
  assert.equal(protocol.parseRetryAfterMs("3"), 3000);
  assert.equal(protocol.parseRetryAfterMs("99"), 15000);
  assert.equal(protocol.isMaxCompletionTokensError('{"error":{"message":"Unsupported parameter: max_tokens is not supported with this model. Use max_completion_tokens instead."}}'), true);
  assert.deepEqual(protocol.extractModelIds({ models: [{ name: "models/gemini-2.5-flash" }, { id: "gpt-4o" }] }), ["gemini-2.5-flash", "gpt-4o"]);

  // 2. Service Worker: capability caching, max_completion_tokens recovery, Retry-After, verify transient retry
  const storeData = {
    mentari_ai_config: {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "o3-mini",
      provider: "openai",
    },
  };

  const chatBodies = [];
  let verifyCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/models")) {
      verifyCalls++;
      if (verifyCalls === 1) {
        return { ok: false, status: 503, headers: new Headers(), text: async () => "Service Unavailable" };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ models: [{ name: "models/o3-mini" }] }),
      };
    }

    const body = JSON.parse(init.body);
    chatBodies.push(body);
    if (body.model === "o3-mini" && "max_tokens" in body) {
      return {
        ok: false,
        status: 400,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported. Use 'max_completion_tokens'. Unsupported value: 'temperature'." } }),
      };
    }
    if (body.model === "rate-limit") {
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "2" }),
        text: async () => JSON.stringify({ error: { message: "Rate limit" } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }),
    };
  };

  globalThis.chrome = {
    runtime: { id: "ext-test" },
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of keys) if (k in storeData) out[k] = storeData[k];
          return out;
        },
        set: async (items) => Object.assign(storeData, items),
        remove: async (keys) => { for (const k of keys) delete storeData[k]; },
      },
    },
    permissions: { contains: async () => true },
  };

  const sw = loadFresh(SW_PATH);

  const verifyRes = await sw.handleAiVerify({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });
  assert.equal(verifyRes.valid, true);
  assert.equal(verifyCalls, 2);
  assert.deepEqual(verifyRes.models, ["o3-mini"]);

  const firstChat = await sw.handleAiChat("c1", { model: "o3-mini", messages: [{ role: "user", content: "hi" }] });
  assert.equal(firstChat.ok, true);
  assert.equal(chatBodies.length, 2);
  assert.equal("max_tokens" in chatBodies[0], true);
  assert.equal("max_completion_tokens" in chatBodies[1], true);
  assert.equal("temperature" in chatBodies[1], false);

  // Second call for same endpoint+model uses cached max_completion_tokens on first try
  const secondChat = await sw.handleAiChat("c2", { model: "o3-mini", messages: [{ role: "user", content: "hi2" }] });
  assert.equal(secondChat.ok, true);
  assert.equal(chatBodies.length, 3);
  assert.equal("max_completion_tokens" in chatBodies[2], true);

  const rateLimited = await sw.handleAiChat("c3", { model: "rate-limit", messages: [{ role: "user", content: "hi" }] });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.retryAfterMs, 2000);

  // 3. aiClient: SW cold-start 1-retry on receiving-end error
  let swAttempts = 0;
  globalThis.chrome = {
    runtime: {
      id: "ext-test",
      lastError: null,
      sendMessage: (msg, cb) => {
        if (msg.type === "mentari:ai-get-config") {
          globalThis.chrome.runtime.lastError = null;
          cb({ ok: true, config: { hasApiKey: true, baseUrl: "https://api.openai.com/v1", model: "gpt-4o", provider: "openai" } });
          return;
        }
        if (msg.type === "mentari:ai-chat") {
          swAttempts++;
          if (swAttempts === 1) {
            globalThis.chrome.runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
            cb(undefined);
            return;
          }
          globalThis.chrome.runtime.lastError = null;
          cb({ ok: true, status: 200, content: "Recovered", finishReason: "stop" });
          return;
        }
        globalThis.chrome.runtime.lastError = null;
        cb({ ok: true });
      },
    },
  };

  loadFresh(PROTOCOL_PATH, ["MentariAiProtocol"]);
  const aiClient = loadFresh(AI_CLIENT_PATH, ["MentariAiClient"]);
  const coldRes = await aiClient.chatCompletion({ messages: [{ role: "user", content: "ping" }] });
  assert.equal(coldRes.ok, true);
  assert.equal(coldRes.content, "Recovered");
  assert.equal(swAttempts, 2);

  // 4. options.js: 60s verify cache avoids duplicate /models call on Save right after Load Models
  const protocolSrc = fs.readFileSync(PROTOCOL_PATH, "utf8");
  const optionsSrc = fs.readFileSync(OPTIONS_SCRIPT_PATH, "utf8");
  const makeEl = (id) => {
    const classes = new Set(id === "modelSelect" || id === "grantPermBtn" || id === "validationMessage" ? ["hidden"] : []);
    const listeners = new Map();
    const el = {
      id,
      value: "",
      type: "text",
      textContent: "",
      className: "",
      disabled: false,
      children: [],
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        contains: (c) => classes.has(c),
      },
      setAttribute: () => {},
      focus: () => {},
      replaceChildren: (...n) => { el.children = n; },
      appendChild: (n) => { el.children.push(n); return n; },
      addEventListener: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      trigger: async (ev) => {
        for (const fn of listeners.get(ev) || []) await fn();
      },
    };
    return el;
  };
  const optEls = new Map([
    "providerSelect", "baseUrlInput", "apiKeyInput", "toggleVisBtn",
    "modelSelect", "modelInput", "loadModelsBtn", "modelHint",
    "resetBtn", "validationMessage", "grantPermBtn", "saveBtn",
  ].map((id) => [id, makeEl(id)]));
  let optVerifyCalls = 0;
  let optSetCalls = 0;
  const optSandbox = {
    URL, Set, String, Promise, Error, Date, setTimeout,
    document: { getElementById: (id) => optEls.get(id) || null, createElement: () => makeEl("opt") },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
          if (msg.type === "mentari:ai-get-config") {
            cb({ ok: true, config: { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", provider: "openai" } });
          } else if (msg.type === "mentari:ai-verify") {
            optVerifyCalls++;
            cb({ valid: true, status: 200, models: ["gpt-4o-mini"] });
          } else if (msg.type === "mentari:ai-set-config") {
            optSetCalls++;
            cb({ ok: true });
          }
        },
      },
    },
  };
  optSandbox.globalThis = optSandbox;
  vm.runInNewContext(protocolSrc + "\n" + optionsSrc, optSandbox);
  await new Promise((r) => setTimeout(r, 15));

  optEls.get("apiKeyInput").value = "sk-cached";
  optEls.get("baseUrlInput").value = "https://api.openai.com/v1/chat/completions";
  await optEls.get("loadModelsBtn").trigger("click");
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(optVerifyCalls, 1);

  await optEls.get("saveBtn").trigger("click");
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(optVerifyCalls, 1);
  assert.equal(optSetCalls, 1);
  assert.equal(optEls.get("baseUrlInput").value, "https://api.openai.com/v1");
});
