import "./taskpane.css";

// ===== Gateway Config =====
const BACKOFF_BASE = 1200;
const BACKOFF_MAX = 20000;

// ===== State =====
let socket = null;
let isConnected = false;
let authToken = null;
let sessionKey = "agent:main:academic-email";
let activeEmailId = null;
let currentEmail = null;
// Tracks which email session we've already prepended the email-context prefix
// to, keyed by activeEmailId. activeEmailId is the stable Exchange itemId
// when Office.js exposes one (preferred) and falls back to a hash of
// subject|from|date — never the subject alone, which would collide for
// emails sharing a thread or auto-reply template.
let contextSentForEmail = null;
let streamBuffer = "";
let activeRunId = null;
let waitingForResponse = false;
let rpcSeq = 0;
let pendingRpc = new Map();
let historyFetching = false;
let lastShownMsgId = null;
// Content-based dedup. flushStream() and fetchLatestReply() both can render an
// assistant reply, and after a streamed run we still poll chat.history as a
// safety net — so we need a way to skip the second render when it carries the
// exact same text. Reset at the top of every sendMessage().
let lastShownContent = "";
let retryCount = 0;
let retryTimer = null;
let handshakeSent = false;
let fetchAttempts = 0;
let fetchTimer = null;
let historyLoadedFor = null;
let runProducedContent = false;
const MAX_FETCH_ATTEMPTS = 10;

// ===== DOM Helper =====
const $ = id => document.getElementById(id);

// ===== Boot =====

/**
 * Entry point called by Office.js when the add-in environment is ready.
 * Applies the theme, binds UI events, loads the auth token, reads the current
 * email, and registers an ItemChanged handler to update the panel when the
 * user selects a different email.
 */
Office.onReady(info => {
  if (info.host === Office.HostType.Outlook) {
    applyTheme();
    bindEvents();
    loadToken();
    readEmail();

    if (Office.context.mailbox.addHandlerAsync) {
      Office.context.mailbox.addHandlerAsync(
        Office.EventType.ItemChanged,
        () => readEmail(),
        () => {}
      );
    }
  }
});

// ===== Theme =====

/**
 * Detects whether Outlook is using a dark theme by sampling the background
 * colour from the Office theme object. Falls back to the OS-level
 * prefers-color-scheme media query if the Office theme is unavailable.
 */
function applyTheme() {
  let dark = false;
  try {
    const t = Office.context.officeTheme;
    if (t && t.bodyBackgroundColor) {
      const hex = t.bodyBackgroundColor.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      dark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
    }
  } catch (_) {}

  if (!dark && window.matchMedia) {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    });
  }
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// ===== Token =====

/**
 * Loads the gateway auth token from localStorage. Shows the settings panel
 * immediately on first launch so the user can enter their token.
 */
function loadToken() {
  try {
    authToken = localStorage.getItem("acad-gateway-token") || "";
  } catch (_) {
    authToken = "";
  }
  if (!authToken) {
    showTokenPrompt();
  } else {
    connectGateway();
  }
}

/** Escapes a string for safe embedding inside an HTML attribute or textarea. */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders an inline settings panel in the chat so the user can update their
 * gateway token and custom system instructions without leaving Outlook.
 *
 * Built entirely via the DOM API (createElement + .value / .textContent /
 * Object.assign for styles) — never via innerHTML — so that a hostile
 * authToken or persisted custom-instructions blob cannot inject script
 * even in the (already-mitigated) case where escapeHtml ever regresses.
 */
function showTokenPrompt() {
  const saved = getSavedSystemPrompt();

  const div = document.createElement("div");
  div.className = "message sys-msg";
  div.id = "settings-panel";

  const body = document.createElement("div");
  body.className = "msg-body";
  body.style.textAlign = "left";

  const title = document.createElement("strong");
  title.textContent = "Setup";
  body.appendChild(title);
  body.appendChild(document.createElement("br"));
  body.appendChild(document.createElement("br"));

  const tokenLabel = document.createElement("label");
  tokenLabel.textContent = "Gateway Token";
  Object.assign(tokenLabel.style, { fontSize: "11px", color: "var(--text-secondary)" });
  body.appendChild(tokenLabel);

  const tokenInput = document.createElement("input");
  tokenInput.type = "password";
  tokenInput.id = "token-field";
  tokenInput.placeholder = "Paste your gateway token...";
  tokenInput.value = authToken || "";
  Object.assign(tokenInput.style, {
    width: "100%", padding: "5px 8px", border: "1px solid var(--border)",
    borderRadius: "4px", background: "var(--bg-input)", color: "var(--text-primary)",
    fontSize: "12px", marginBottom: "8px", fontFamily: "monospace",
  });
  body.appendChild(tokenInput);

  const promptLabel = document.createElement("label");
  promptLabel.textContent = "Custom Instructions (optional)";
  Object.assign(promptLabel.style, { fontSize: "11px", color: "var(--text-secondary)" });
  body.appendChild(promptLabel);

  const promptArea = document.createElement("textarea");
  promptArea.id = "prompt-field";
  promptArea.rows = 3;
  promptArea.placeholder = "e.g. Always reply formally. Never use bullet points.";
  promptArea.textContent = saved;
  Object.assign(promptArea.style, {
    width: "100%", padding: "5px 8px", border: "1px solid var(--border)",
    borderRadius: "4px", background: "var(--bg-input)", color: "var(--text-primary)",
    fontSize: "12px", marginBottom: "8px", fontFamily: "var(--font)", resize: "vertical",
  });
  body.appendChild(promptArea);

  const btn = document.createElement("button");
  btn.id = "save-settings-btn";
  btn.textContent = "Save & Connect";
  Object.assign(btn.style, {
    padding: "5px 12px", background: "var(--accent)", color: "#fff",
    border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px",
  });
  body.appendChild(btn);

  body.appendChild(document.createElement("br"));
  const hint = document.createElement("small");
  hint.style.color = "var(--text-muted)";
  hint.textContent = "Token location: ~/.openclaw/openclaw.json → gateway.auth.token";
  body.appendChild(hint);

  div.appendChild(body);
  $("chat-messages").appendChild(div);

  // Bind the click handler synchronously; the previous 80ms setTimeout was
  // both racy and unnecessary now that the element is already in the DOM.
  btn.addEventListener("click", () => {
    const t = tokenInput.value.trim();
    const p = promptArea.value.trim();
    if (t) {
      try { localStorage.setItem("acad-gateway-token", t); } catch (_) {}
      authToken = t;
    }
    try { localStorage.setItem("acad-custom-instructions", p); } catch (_) {}
    div.remove();
    addMessage("sys", "Settings saved. Connecting to gateway...");
    connectGateway();
  });
}

/** Returns any custom system instructions saved by the user in the settings panel. */
function getSavedSystemPrompt() {
  try { return localStorage.getItem("acad-custom-instructions") || ""; } catch (_) { return ""; }
}

// ===== Email Reader =====

/**
 * Reads the currently selected email using the Office.js Mailbox API.
 * Generates a unique session key per email so each conversation is stored
 * separately in OpenClaw. Clears the chat and reloads history when the
 * user switches to a different email.
 */
function readEmail() {
  const item = Office.context.mailbox.item;
  if (!item) { showNoEmail(); return; }

  try {
    const subject = item.subject || "(No subject)";
    const from    = item.from ? `${item.from.displayName} <${item.from.emailAddress}>` : "Unknown";
    const date    = item.dateTimeCreated ? new Date(item.dateTimeCreated).toLocaleString() : "";
    const to      = item.to ? item.to.map(r => `${r.displayName} <${r.emailAddress}>`).join(", ") : "";

    item.body.getAsync(Office.CoercionType.Text, result => {
      const body = result.status === Office.AsyncResultStatus.Succeeded ? result.value : "";
      currentEmail = { subject, from, to, date, body };

      const stableId = (typeof item.itemId === "string" && item.itemId) ? item.itemId : null;
      const newId = stableId ? hashString(stableId) : hashString(subject + "|" + from + "|" + date);
      if (newId !== activeEmailId) {
        activeEmailId = newId;
        sessionKey = `agent:main:academic-email-${newId}`;
        contextSentForEmail = null;
        lastShownMsgId = null;
        lastShownContent = "";
        historyLoadedFor = null;
        cancelFetchRetry();
        hideTyping();
        waitingForResponse = false;
        clearChatMessages();
        if (isConnected) loadHistory();
      }

      renderEmailHeader(subject, from, date);
    });
  } catch (_) {
    showNoEmail();
    addMessage("err", "Could not read email details.");
  }
}

/** Resets the email header to the placeholder state when no email is open. */
function showNoEmail() {
  $("email-placeholder").style.display = "flex";
  $("email-info").style.display = "none";
  $("label-row").style.display = "none";
  currentEmail = null;
}

/**
 * Populates the email header with the subject, sender, and date, then
 * refreshes the label buttons to reflect existing Outlook categories.
 */
function renderEmailHeader(subject, from, date) {
  $("email-placeholder").style.display = "none";
  $("email-info").style.display = "block";
  $("email-subject").textContent = subject;
  $("email-from").textContent = from;
  $("email-date").textContent = date;
  loadCategories();
}

// ===== Categories =====

/**
 * Reads the Outlook categories on the open email and highlights the
 * matching label buttons. Hides the label row on older Outlook versions
 * that do not support the categories API.
 */
function loadCategories() {
  const item = Office.context.mailbox.item;
  if (!item || !item.categories) {
    $("label-row").style.display = "none";
    return;
  }
  $("label-row").style.display = "flex";
  item.categories.getAsync(result => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) return;
    const active = (result.value || []).map(c => (c.displayName || c).toLowerCase());
    document.querySelectorAll(".btn-label").forEach(btn => {
      const cat = btn.dataset.category.toLowerCase();
      btn.classList.toggle("active", active.includes(cat));
    });
  });
}

/**
 * Ensures a category exists in the Outlook master list before applying it to
 * an item. Office.js throws "Invalid categories" if addAsync is called with a
 * name that hasn't been registered in masterCategories first.
 *
 * @param {string} name - Category display name (e.g. "Urgent")
 * @param {Function} callback - Called once the category is confirmed to exist
 */
function ensureMasterCategory(name, callback) {
  const colorMap = {
    "Urgent": Office.MailboxEnums.CategoryColor.Preset0,
    "Medium": Office.MailboxEnums.CategoryColor.Preset3,
    "Minor":  Office.MailboxEnums.CategoryColor.Preset7,
  };
  Office.context.mailbox.masterCategories.getAsync(result => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) { callback(); return; }
    const exists = (result.value || []).some(c => c.displayName.toLowerCase() === name.toLowerCase());
    if (exists) { callback(); return; }
    const color = colorMap[name] || Office.MailboxEnums.CategoryColor.Preset0;
    Office.context.mailbox.masterCategories.addAsync([{ displayName: name, color }], () => callback());
  });
}

/**
 * Toggles an Outlook category on the current email. Removes it if already
 * applied, or adds it (creating it in the master list first if needed).
 *
 * @param {string} name - Category name matching one of the label buttons
 */
function toggleCategory(name) {
  const item = Office.context.mailbox.item;
  if (!item) { addMessage("err", "No email selected."); return; }
  if (!item.categories) { addMessage("err", "Categories not supported in this Outlook version."); return; }

  item.categories.getAsync(result => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      addMessage("err", "Could not read categories: " + (result.error?.message || "unknown error"));
      return;
    }
    const active = (result.value || []).map(c => (c.displayName || c).toLowerCase());
    if (active.includes(name.toLowerCase())) {
      item.categories.removeAsync([name], r => {
        if (r.status !== Office.AsyncResultStatus.Succeeded)
          addMessage("err", "Remove failed: " + (r.error?.message || "unknown error"));
        loadCategories();
      });
    } else {
      ensureMasterCategory(name, () => {
        item.categories.addAsync([name], r => {
          if (r.status !== Office.AsyncResultStatus.Succeeded)
            addMessage("err", "Add failed: " + (r.error?.message || "unknown error"));
          loadCategories();
        });
      });
    }
  });
}

// ===== Gateway Connection =====

/**
 * Returns the WebSocket URL via the webpack-dev-server proxy.
 * The proxy upgrades the connection from WSS (HTTPS page) to WS (OpenClaw),
 * which avoids mixed-content errors that would occur connecting to WS directly.
 */
function getGatewayUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ai-gateway`;
}

/**
 * Opens a WebSocket connection to the OpenClaw Gateway via the webpack proxy.
 * Implements exponential backoff on disconnect.
 */
function connectGateway() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  setStatus("connecting");

  try {
    socket = new WebSocket(getGatewayUrl());
  } catch (_) {
    setStatus("disconnected");
    scheduleRetry();
    return;
  }

  socket.onopen = () => {
    // Reset the backoff counter the moment the TCP connection is up. Previously
    // we only reset inside sendHandshake().then(...) — if the gateway accepted
    // the socket but never replied to `connect` we'd keep ramping the retry
    // delay even though the network itself was healthy.
    retryCount = 0;
    setStatus("connecting");
    handshakeSent = false;
    // Give the server 2s to send connect.challenge; proceed anyway if it doesn't arrive.
    setTimeout(() => { if (!isConnected) sendHandshake(); }, 2000);
  };

  socket.onmessage = e => handleIncoming(String(e.data || ""));

  socket.onclose = () => {
    isConnected = false;
    handshakeSent = false;
    historyLoadedFor = null;
    pendingRpc.clear();
    setStatus("disconnected");
    scheduleRetry();
  };

  socket.onerror = (e) => {
    // Network-level errors arrive here; the WebSocket spec gives us no detail.
    // We still get an onclose right after, which handles reconnection.
    console.warn("[gateway] WebSocket error", e);
  };
}

/**
 * Schedules a reconnection attempt using exponential backoff.
 *
 * Previously a blanket `if (retryTimer) return;` guard would silently swallow
 * a fresh retry request whenever a stale timer existed — including timers left
 * behind after the socket closed but before its callback fired. That caused
 * the UI to stay "Disconnected" indefinitely with no further reconnect
 * attempts. We now only short-circuit when a connection attempt is already
 * actually in flight; otherwise we clear the stale timer and schedule a new
 * one with the current backoff.
 */
function scheduleRetry() {
  if (retryTimer) {
    if (socket && socket.readyState === WebSocket.CONNECTING) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const delay = Math.min(BACKOFF_BASE * Math.pow(1.7, retryCount), BACKOFF_MAX);
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectGateway();
  }, delay);
}

// ===== Handshake =====

/**
 * Sends the OpenClaw connect RPC to authenticate and negotiate protocol version.
 * On success, marks the connection as ready and loads chat history for the
 * current email.
 *
 * The handshakeSent flag prevents double-fire: both the 2s onopen timer and
 * the server-sent connect.challenge event can trigger this. Without the guard
 * we used to send two parallel connect RPCs and run loadHistory() twice.
 *
 * The auth field carries both `token` and `password` to handle either gateway
 * verification mode without re-onboarding (see SETUP.txt notes).
 */
function sendHandshake() {
  if (handshakeSent || isConnected) return;
  handshakeSent = true;

  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "openclaw-control-ui",
      version: "1.0.0",
      platform: navigator.platform || "web",
      mode: "webchat",
      instanceId: "acad-" + Date.now(),
    },
    role: "operator",
    scopes: ["operator.admin"],
    caps: ["tool-events"],
    auth: authToken ? { token: authToken, password: authToken } : {},
  };

  callRpc("connect", params)
    .then(result => {
      isConnected = true;
      retryCount = 0;
      setStatus("connected");
      // We deliberately do NOT adopt result.sessionKey here. readEmail()
      // manages sessionKey on a per-email basis; overriding it would cause
      // the next history load to use the gateway's default session and the
      // one after that to use the per-email key, resulting in two ~20s
      // chat.history RPCs (which we used to log on every connect).
      // Only load history if we already know which email we're on. If
      // readEmail() hasn't completed yet it will trigger loadHistory()
      // itself once the email body is parsed.
      if (activeEmailId) loadHistory();
    })
    .catch(() => {
      handshakeSent = false;
      setStatus("disconnected");
    });
}

// ===== RPC Layer =====

/**
 * Sends a JSON-RPC request over the WebSocket and returns a Promise that
 * resolves with the result or rejects on error.
 *
 * @param {string} method - RPC method name (e.g. "chat.send")
 * @param {object} params - Method parameters
 * @returns {Promise<any>}
 */
function callRpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected"));
      return;
    }
    const id = String(++rpcSeq);
    pendingRpc.set(id, { resolve, reject });
    socket.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// ===== Message Handler =====

/**
 * Routes incoming WebSocket messages to the RPC response handler or the
 * event handler depending on the message type.
 *
 * @param {string} raw - Raw JSON string received from the WebSocket
 */
function handleIncoming(raw) {
  let data;
  try { data = JSON.parse(raw); } catch (_) { return; }

  if (data.type === "res" && pendingRpc.has(String(data.id))) {
    const { resolve, reject } = pendingRpc.get(String(data.id));
    pendingRpc.delete(String(data.id));
    if (data.ok === false) {
      reject(new Error(data.error?.message || data.error?.code || "RPC error"));
    } else {
      resolve(data.result || data.payload || data);
    }
    return;
  }

  if (data.type === "event") {
    handleEvent(data);
  }
}

// ===== Event Handler =====

/**
 * Returns true if the text looks like a raw tool-call JSON object emitted by
 * the agent. These are internal operations and should not be shown to the user.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isRawToolCall(text) {
  const t = text.trim();
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj.name === "string" && obj.parameters !== undefined) return true;
  } catch (_) {}
  return /^\{"name"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:/.test(t);
}

/**
 * Flushes the accumulated stream buffer to the chat as a finalised AI message
 * and clears the buffer.
 */
function flushStream() {
  const text = streamBuffer.trim();
  if (text && !isRawToolCall(text)) {
    addMessage("ai", processAIText(text));
    // Record what we just rendered so a follow-up fetchLatestReply() poll
    // doesn't re-display the same content as a duplicate bubble.
    lastShownContent = text;
  }
  streamBuffer = "";
}

/**
 * Handles server-sent events from the OpenClaw Gateway.
 * Manages the typing indicator lifecycle, assembles streamed response chunks,
 * and displays finalised messages from the AI.
 *
 * @param {object} evt - Parsed event object from the gateway
 */
function handleEvent(evt) {
  const event   = evt.event || "";
  const payload = evt.payload || evt.data || {};

  switch (event) {

    case "connect.challenge":
      sendHandshake();
      break;

    case "agent.run": {
      const phase = payload.phase || payload.data?.phase || "";
      if (phase === "start") {
        activeRunId = payload.runId || null;
        runProducedContent = false;
        showTyping();
      } else if (phase === "end" || phase === "error") {
        activeRunId = null;
        // Capture whether the model actually produced any output BEFORE
        // flushStream clears the buffer. If both the buffer is empty AND
        // we never rendered an AI bubble during this run, the gateway just
        // surfaced a zero-payload "incomplete turn" and the user would
        // otherwise see a dead "Thinking…" dot forever.
        const hadContent = runProducedContent || streamBuffer.trim().length > 0;
        flushStream();
        hideTyping();
        if (!hadContent) {
          // Zero-payload run (the gateway logs "incomplete turn detected …
          // stopReason=stop payloads=0"). Surface a concrete error so the
          // user doesn't sit watching a dead typing indicator.
          waitingForResponse = false;
          cancelFetchRetry();
          const msg = payload.error?.message || payload.message ||
            "The model returned no output. Try a shorter question, switch to a different email, or check that Ollama is running (`ollama ps` should show qwen2.5:3b loaded).";
          addMessage("err", msg);
        } else if (waitingForResponse) {
          waitingForResponse = false;
          fetchLatestReply();
        }
        runProducedContent = false;
      }
      break;
    }

    case "chat": {
      const state = payload.state || "";
      if (state === "start" || state === "started") {
        flushStream();
        showTyping();
      } else if (state === "final" || state === "end" || state === "error") {
        flushStream();
        if (!activeRunId) {
          hideTyping();
          if (waitingForResponse) { waitingForResponse = false; fetchLatestReply(); }
        }
      }
      break;
    }

    case "agent.delta":
    case "chat.delta": {
      const chunk = payload.delta || payload.text || payload.content || "";
      if (chunk) {
        runProducedContent = true;
        streamBuffer += chunk;
        renderStreamingBubble(streamBuffer);
      }
      break;
    }

    case "agent.message":
    case "chat.message": {
      flushStream();
      const content = payload.content || payload.text || payload.message || "";
      if (content) {
        const text = typeof content === "string" ? content : JSON.stringify(content);
        if (!isRawToolCall(text)) {
          runProducedContent = true;
          addMessage("ai", processAIText(text));
        }
      }
      if (!activeRunId) hideTyping();
      break;
    }

    case "agent.tool_call":
    case "tool_call":
      flushStream();
      setTypingLabel(payload.name ? `Using ${payload.name}…` : "Working…");
      showTyping();
      break;

    case "agent.tool_result":
    case "tool_result":
      setTypingLabel("Processing…");
      break;

    default:
      if (payload.content || payload.text || payload.message) {
        const text = payload.content || payload.text || payload.message;
        if (typeof text === "string" && text.trim()) {
          flushStream();
          addMessage("ai", processAIText(text.trim()));
          if (!activeRunId) hideTyping();
        }
      }
      break;
  }
}

// ===== History Loader =====

/**
 * Fetches the stored conversation history for the current email session from
 * OpenClaw and renders it into the chat. User messages are stripped of the
 * email context prefix that was prepended before sending.
 */
function loadHistory() {
  // Dedupe: both sendHandshake().then(...) and readEmail() (once isConnected
  // is true) call loadHistory() for the same email. Each chat.history RPC
  // takes ~20s on a cold gateway, so running it twice is a meaningful waste.
  // We skip if we've already loaded history for the current sessionKey.
  if (historyLoadedFor === sessionKey) return;
  historyLoadedFor = sessionKey;

  // Snapshot the sessionKey at call time. If the user clicks through emails
  // quickly we don't want a late-arriving history RPC to paint stale messages
  // onto the currently active email's chat.
  const sessionAtCall = sessionKey;
  callRpc("chat.history", { sessionKey, limit: 50 })
    .then(result => {
      if (sessionAtCall !== sessionKey) return;
      const msgs = extractMessages(result);
      for (const msg of msgs) {
        const text = extractText(msg);
        if (!text) continue;
        if (msg.role === "user") {
          const m = text.match(/User question:\s*([\s\S]*)/);
          addMessage("user", m ? m[1].trim() : text.trim());
        } else if (msg.role === "assistant") {
          addMessage("ai", processAIText(text.trim(), false));
          lastShownMsgId = msg.__openclaw?.id || msg.responseId || msg.timestamp || null;
        }
      }
    })
    .catch(() => {
      // Allow a retry on transient failure (e.g. RPC error)
      if (sessionAtCall === sessionKey) historyLoadedFor = null;
    });
}

/**
 * Polls the chat history for the latest assistant reply after a message is sent.
 * Used as a fallback when the streamed response was not captured via delta events.
 *
 * Retries up to MAX_FETCH_ATTEMPTS times at 2-second intervals, then gives up
 * with a visible error. Any pending poll is cancelled when the user switches
 * emails (see readEmail()) so stale polls cannot land on a different session.
 */
function scheduleFetchRetry() {
  if (fetchTimer) return;
  if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
    historyFetching = false;
    hideTyping();
    waitingForResponse = false;
    addMessage("err", "No reply received. Check that the AI model is running and try again.");
    return;
  }
  fetchAttempts++;
  fetchTimer = setTimeout(() => {
    fetchTimer = null;
    fetchLatestReply();
  }, 2000);
}

function cancelFetchRetry() {
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  fetchAttempts = 0;
  historyFetching = false;
}

function fetchLatestReply() {
  if (historyFetching) return;
  historyFetching = true;
  const sessionAtCall = sessionKey;

  callRpc("chat.history", { sessionKey, limit: 10 })
    .then(result => {
      historyFetching = false;
      // If the user switched emails while the RPC was in flight, drop this result.
      if (sessionAtCall !== sessionKey) return;
      const msgs = extractMessages(result);
      if (!msgs.length) { scheduleFetchRetry(); return; }
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (msg.role !== "assistant") continue;
        const text = extractText(msg);
        const trimmed = text.trim();
        const msgId = msg.__openclaw?.id || msg.responseId || msg.timestamp || i;
        if (!trimmed || msgId === lastShownMsgId) {
          scheduleFetchRetry();
          return;
        }
        // Content-based dedup: when a streamed run already painted this reply
        // via flushStream(), the post-run safety poll lands on the same text.
        // Record the gateway id so we don't keep retrying, then return without
        // emitting a second bubble.
        if (trimmed === lastShownContent) {
          lastShownMsgId = msgId;
          cancelFetchRetry();
          return;
        }
        lastShownMsgId = msgId;
        lastShownContent = trimmed;
        cancelFetchRetry();
        addMessage("ai", processAIText(trimmed));
        return;
      }
      scheduleFetchRetry();
    })
    .catch(() => {
      historyFetching = false;
      scheduleFetchRetry();
    });
}

/**
 * Normalises the various response shapes that chat.history can return into a
 * flat array of message objects.
 *
 * @param {any} result - Raw RPC result
 * @returns {Array}
 */
function extractMessages(result) {
  if (!result) return [];
  if (Array.isArray(result.messages)) return result.messages;
  if (Array.isArray(result)) return result;
  if (result.history && Array.isArray(result.history)) return result.history;
  for (const k of Object.keys(result)) {
    if (Array.isArray(result[k])) return result[k];
  }
  return [];
}

/**
 * Extracts plain text from a message object, handling both string content
 * and the array-of-blocks format used by some models.
 *
 * @param {object} msg
 * @returns {string}
 */
function extractText(msg) {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(c => c.type === "text").map(c => c.text || "").join("\n");
  }
  return "";
}

// ===== Send Message =====

/**
 * Sends a user message to OpenClaw via the chat.send RPC.
 * Prepends the full email context on the first message of each email session
 * (tracked by email hash, not subject, to avoid collisions between emails
 * with the same subject line). An idempotency key prevents duplicate messages.
 *
 * @param {string} text - The message text to send
 */
// Label-mode opt-in: only autoLabel() sets this to true for the next send,
// so the [LABEL:X] directive is included exactly when it's relevant. Adding
// it to every first message of an email session caused small models (e.g.
// qwen2.5:3b) to over-refuse — they would emit stop with zero payload tokens
// because the directive didn't fit the user's actual question. The error in
// the gateway log was "incomplete turn detected ... stopReason=stop
// payloads=0 — surfacing error to user".
let nextSendIsLabelRequest = false;

function sendMessage(text) {
  if (!isConnected) {
    hideTyping();
    waitingForResponse = false;
    addMessage("err", "Not connected to gateway. Reconnecting…");
    connectGateway();
    return;
  }

  cancelFetchRetry();
  // Each new send starts a fresh dedup window. Without this reset, a follow-up
  // send whose reply happens to start with the same text as the previous reply
  // would be silently swallowed by the dedup check in fetchLatestReply().
  lastShownContent = "";

  // Arm the "waiting for reply" UI synchronously here, so every caller
  // (handleSend, draftReply, autoLabel) gets the typing indicator without
  // having to duplicate the bookkeeping. We deliberately do NOT set these
  // inside the callRpc .then() — the stream can finish (and reset both)
  // before chat.send resolves, which would leave the UI stuck "thinking".
  showTyping();
  waitingForResponse = true;

  const labelMode = nextSendIsLabelRequest;
  nextSendIsLabelRequest = false;

  let fullText = text;

  if (currentEmail && contextSentForEmail !== activeEmailId) {
    const body = (currentEmail.body || "").slice(0, 3000);
    const custom = getSavedSystemPrompt();
    let prefix = "";
    if (custom) prefix += `[System instructions]\n${custom}\n\n`;
    prefix += `[Instructions: You are an email assistant. Answer the user's question directly using the email below as context. Keep replies concise. Do not invent details not present in the email.]\n\n`;
    if (labelMode) {
      prefix += `[Label directive: Decide one priority for this email — Urgent (needs immediate action or time-sensitive), Medium (needs attention but not critical), or Minor (low priority or informational). Write a one-sentence reason, then end your reply with exactly one of [LABEL:Urgent], [LABEL:Medium], or [LABEL:Minor] on its own line.]\n\n`;
    }
    prefix += `[Current email context]\nSubject: ${currentEmail.subject}\nFrom: ${currentEmail.from}\nTo: ${currentEmail.to}\nDate: ${currentEmail.date}\n\nBody:\n${body}\n\n---\n\n`;
    fullText = prefix + `User question: ${text}`;
    contextSentForEmail = activeEmailId;
  } else if (labelMode) {
    // Subsequent label requests on the same email don't re-send the body
    // (the agent already has it in chat history), but we still need to
    // include the label directive so the [LABEL:X] tag is produced.
    fullText = `[Label directive: Reply with a one-sentence reason for the priority of this email, then end with exactly one of [LABEL:Urgent], [LABEL:Medium], or [LABEL:Minor] on its own line.]\n\n${text}`;
  }

  // waitingForResponse and the typing indicator are set synchronously above,
  // not in .then() — see the comment block at the top of this function.
  callRpc("chat.send", {
    sessionKey,
    message: fullText,
    deliver: false,
    idempotencyKey: crypto.randomUUID(),
  })
    .catch(err => {
      hideTyping();
      waitingForResponse = false;
      addMessage("err", "Send failed: " + err.message);
    });
}

// ===== Actions =====

// Wire prompts for action buttons. We display the same string we send so
// that reloading conversation history shows the user exactly what they saw
// the first time. (Previously the chat bubble said "Draft a reply to this
// email" while the wire payload was a longer prompt, causing history to
// re-render different text after a refresh.)
const DRAFT_REPLY_PROMPT = "Please draft a professional reply to this email. Respond in the same language as the original email.";
const AUTO_LABEL_PROMPT  = "Read this email and assign a priority label (Urgent, Medium, or Minor) based on its urgency. Reply with a brief reason for your choice.";

/** Asks the AI to draft a professional reply to the current email. */
function draftReply() {
  if (!currentEmail) { addMessage("err", "No email selected."); return; }
  addMessage("user", DRAFT_REPLY_PROMPT);
  // sendMessage() arms showTyping() and waitingForResponse itself — no
  // duplication needed here (used to live in both places, which made the
  // "stuck thinking" diagnostic in B5 harder to trace).
  sendMessage(DRAFT_REPLY_PROMPT);
}

/**
 * Asks the AI to read the email and assign a priority label (Urgent / Medium / Minor).
 * Sets the per-send label flag so sendMessage() will inject the [LABEL:X]
 * directive into the wire prompt. processAIText() then parses the tag out
 * of the reply and applies the matching Outlook category.
 */
function autoLabel() {
  if (!currentEmail) { addMessage("err", "No email selected."); return; }
  addMessage("user", AUTO_LABEL_PROMPT);
  nextSendIsLabelRequest = true;
  sendMessage(AUTO_LABEL_PROMPT);
}

/**
 * Opens the last AI message as a reply draft in Outlook's native compose
 * window using the Office.js displayReplyForm API.
 */
function useDraft() {
  const aiMsgs = document.querySelectorAll(".ai-msg .msg-body");
  const last = aiMsgs[aiMsgs.length - 1];
  if (!last) { addMessage("err", "No draft available. Click Draft Reply first."); return; }

  const item = Office.context.mailbox.item;
  if (!item) { addMessage("err", "No email selected."); return; }

  try {
    item.displayReplyForm(last.textContent);
    addMessage("sys", "Draft opened in Outlook. Review and send when ready.");
  } catch (err) {
    addMessage("err", "Could not open draft: " + err.message);
  }
}

// ===== AI Label Action Parser =====

/**
 * Strips label tags and context echoes from text for display during streaming.
 * Does not apply any Outlook category — use processAIText for finalised messages.
 *
 * @param {string} text
 * @returns {string}
 */
function stripAITags(text) {
  let cleaned = text.replace(/\[Current email context\][\s\S]*?---\s*/g, "").trim();
  cleaned = cleaned.replace(/\n---+\s*$/g, "").trim();
  cleaned = cleaned.replace(/\s*\[LABEL:[^\]]+\]/gi, "").trim();
  return cleaned;
}

/**
 * Post-processes finalised AI response text:
 * strips any echoed email context, removes trailing separators,
 * and (when applyLabel is true) detects a [LABEL:X] tag to automatically
 * apply the Outlook category.
 *
 * @param {string} text - Raw AI response text
 * @param {boolean} [applyLabel=true] - Apply [LABEL:X] tag to Outlook. Pass
 *   false when re-rendering stored history so we don't retroactively toggle
 *   categories every time the user reopens an email.
 * @returns {string} Cleaned text safe to display
 */
function processAIText(text, applyLabel = true) {
  let cleaned = text.replace(/\[Current email context\][\s\S]*?---\s*/g, "").trim();
  cleaned = cleaned.replace(/\n---+\s*$/g, "").trim();
  const match = cleaned.match(/\[LABEL:(Urgent|Medium|Minor)\]/i);
  if (match) {
    if (applyLabel) {
      const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      toggleCategory(label);
    }
    cleaned = cleaned.replace(/\s*\[LABEL:[^\]]+\]/gi, "").trim();
  }
  return cleaned;
}

// ===== Chat UI =====

/**
 * Appends a message bubble to the chat area.
 * Roles: "user" (right-aligned), "ai" (left-aligned), "sys" (centred info),
 * "err" (centred error). Enables the Use Draft button on any AI message.
 *
 * @param {"user"|"ai"|"sys"|"err"} role
 * @param {string} text
 */
function addMessage(role, text) {
  const existing = document.querySelector(".streaming-bubble");
  if (existing) existing.remove();

  const container = $("chat-messages");
  const div = document.createElement("div");
  const classMap = { user: "message user-msg", ai: "message ai-msg", sys: "message sys-msg", err: "message err-msg" };
  div.className = classMap[role] || "message sys-msg";

  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = text;
  div.appendChild(body);
  container.appendChild(div);
  // User-sent bubbles always scroll into view; AI/system messages respect
  // the user's current scroll position so we don't yank them mid-read.
  scrollDown(role === "user");

  if (role === "ai") $("use-draft-btn").disabled = false;
}

/**
 * Updates the live streaming bubble with cleaned text as chunks arrive.
 * Label tags are stripped visually during streaming; they are only applied
 * to Outlook once the stream is finalised via flushStream → processAIText.
 *
 * @param {string} text - Full accumulated stream text so far
 */
function renderStreamingBubble(text) {
  hideTyping();
  let el = document.querySelector(".streaming-bubble");
  if (!el) {
    const container = $("chat-messages");
    el = document.createElement("div");
    el.className = "message ai-msg streaming-bubble";
    const body = document.createElement("div");
    body.className = "msg-body";
    el.appendChild(body);
    container.appendChild(el);
  }
  el.querySelector(".msg-body").textContent = stripAITags(text);
  scrollDown();
}

/** Removes all non-system messages from the chat and disables the Use Draft button. */
function clearChatMessages() {
  const container = $("chat-messages");
  container.querySelectorAll(".message:not(.sys-msg)").forEach(m => m.remove());
  $("use-draft-btn").disabled = true;
}

function showTyping() { $("typing-indicator").style.display = "flex"; scrollDown(); }
function hideTyping() { $("typing-indicator").style.display = "none"; }
function setTypingLabel(text) { const l = $("typing-label"); if (l) l.textContent = text; showTyping(); }
// Threshold (px) within which we consider the user "at the bottom" of the
// chat and therefore safe to auto-scroll on new content. If the user has
// scrolled up to re-read an earlier message we leave their viewport alone.
const SCROLL_STICK_THRESHOLD = 48;

function scrollDown(force = false) {
  const c = $("chat-messages");
  if (!c) return;
  const nearBottom =
    c.scrollHeight - c.scrollTop - c.clientHeight < SCROLL_STICK_THRESHOLD;
  if (!force && !nearBottom) return;
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

// ===== Status Bar =====

/**
 * Updates the status bar colour and label to reflect the connection state.
 *
 * @param {"connected"|"connecting"|"disconnected"} state
 */
function setStatus(state) {
  const bar = $("status-bar");
  bar.className = "status-bar " + state;
  const labels = { connected: "Academic AI Ready", connecting: "Connecting…", disconnected: "Disconnected" };
  $("status-text").textContent = labels[state] || state;
}

// ===== Utilities =====

/**
 * Produces a short alphanumeric hash of a string using a djb2-style algorithm.
 * Used to generate stable per-email session keys.
 *
 * @param {string} str
 * @returns {string} Base-36 encoded absolute hash value
 */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ===== Event Bindings =====

/** Wires up all button click handlers and textarea keyboard shortcuts. */
function bindEvents() {
  $("send-btn").addEventListener("click", handleSend);
  $("draft-btn").addEventListener("click", draftReply);
  $("use-draft-btn").addEventListener("click", useDraft);
  $("auto-label-btn").addEventListener("click", autoLabel);

  document.querySelectorAll(".btn-label").forEach(btn => {
    btn.addEventListener("click", () => toggleCategory(btn.dataset.category));
  });

  $("settings-btn").addEventListener("click", () => {
    const existing = document.getElementById("settings-panel");
    if (existing) { existing.remove(); return; }
    showTokenPrompt();
  });

  const input = $("msg-input");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });
}

/** Reads the input field, renders a user bubble, and sends the message. */
function handleSend() {
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text) return;
  addMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  // sendMessage() arms showTyping() and waitingForResponse itself.
  sendMessage(text);
}
