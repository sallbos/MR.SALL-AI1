/* ============================================
   MR.SALL AI — Tools Logic (tools.js)
   ============================================ */

/* ── Daily Usage & Quota Tracker ── */
const UsageTracker = (() => {
  const STORAGE_KEY = 'mrsall_usage_stats';

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDefaultLimit(tier) {
    return (tier === 'premium' || tier === 'pro') ? 500 : 50;
  }

  function getUsage() {
    const today = getTodayKey();
    const tier = (typeof AuthManager !== 'undefined' && typeof AuthManager.getTier === 'function')
      ? AuthManager.getTier()
      : (localStorage.getItem('mrsall_user_tier') || 'free');
    const defaultLimit = getDefaultLimit(tier);

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.date === today) {
          const limit = data.limit || defaultLimit;
          const used = Math.min(data.used || 0, limit);
          const remaining = Math.max(0, limit - used);
          const percent = Math.min(100, Math.round((used / limit) * 100));
          return { date: today, used, limit, remaining, tier, percent, resetSeconds: data.resetSeconds || 86400 };
        }
      }
    } catch (e) {
      console.warn('Error reading usage stats:', e);
    }

    return {
      date: today,
      used: 0,
      limit: defaultLimit,
      remaining: defaultLimit,
      tier,
      percent: 0,
      resetSeconds: 86400
    };
  }

  function saveUsage(stats) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch {}
    updateAllUI();
  }

  function syncWithHeaders(headers, payloadData = null) {
    const today = getTodayKey();
    const current = getUsage();

    let limit = current.limit;
    let remaining = current.remaining;
    let resetSeconds = current.resetSeconds;
    let tier = current.tier;

    if (headers) {
      const hLimit = headers.get('X-RateLimit-Limit');
      const hRemaining = headers.get('X-RateLimit-Remaining');
      const hReset = headers.get('X-RateLimit-Reset');
      const hTier = headers.get('X-User-Tier');

      if (hLimit) limit = parseInt(hLimit, 10);
      if (hRemaining !== null && hRemaining !== undefined && hRemaining !== '') remaining = parseInt(hRemaining, 10);
      if (hReset) resetSeconds = parseInt(hReset, 10);
      if (hTier) tier = hTier;
    }

    if (payloadData) {
      if (payloadData.limit !== undefined) limit = payloadData.limit;
      if (payloadData.remaining !== undefined) remaining = payloadData.remaining;
      if (payloadData.tier !== undefined) tier = payloadData.tier;
      if (payloadData.reset_seconds !== undefined) resetSeconds = payloadData.reset_seconds;
    }

    const used = Math.max(0, limit - remaining);
    const percent = Math.min(100, Math.round((used / limit) * 100));

    saveUsage({
      date: today,
      used,
      limit,
      remaining,
      tier,
      percent,
      resetSeconds,
      lastSync: Date.now()
    });
  }

  function notifyLimitReached(customMessage) {
    const msg = customMessage || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('usage_limit_reached') : 'Daily limit reached. Resets at midnight UTC.');
    if (typeof Toast !== 'undefined') {
      Toast.show(msg, 'error', 6000);
    }
    showLimitModal();
  }

  function showLimitModal() {
    let modal = document.getElementById('usage-limit-modal');
    if (!modal) {
      const current = getUsage();
      modal = document.createElement('div');
      modal.id = 'usage-limit-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width:440px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⏳</div>
          <h3 style="margin-bottom:8px;font-size:1.35rem;" class="gradient-text" data-i18n="usage_limit_modal_title">
            ${(typeof LanguageManager !== 'undefined' ? LanguageManager.t('usage_limit_modal_title') : 'Daily Limit Reached')}
          </h3>
          <p style="font-size:0.92rem;color:var(--text-secondary);line-height:1.6;margin-bottom:20px;" data-i18n="usage_limit_modal_desc">
            ${(typeof LanguageManager !== 'undefined' ? LanguageManager.t('usage_limit_modal_desc') : 'You have used all your messages for today. Your quota automatically resets at 00:00 UTC.')}
          </p>
          <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:14px;margin-bottom:20px;text-align:left;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
              <span style="color:var(--text-muted);" data-i18n="dashboard_plan">Account Plan</span>
              <strong style="color:var(--brand-blue);" class="current-plan-name">${current.tier === 'premium' ? 'Premium (500/day)' : 'Free (50/day)'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:var(--text-muted);" data-i18n="dashboard_resets_at">Daily Reset</span>
              <span style="color:var(--text-primary);">00:00 UTC</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-limit-modal">
              Close
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-upgrade-plan-modal">
              ⭐ <span data-i18n="dashboard_upgrade">Upgrade Plan</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-limit-modal')?.addEventListener('click', () => modal.remove());

      modal.querySelector('#btn-upgrade-plan-modal')?.addEventListener('click', () => {
        modal.remove();
        if (typeof AuthManager !== 'undefined' && typeof AuthManager.setTier === 'function') {
          AuthManager.setTier('premium');
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
    }
  }

  function updateAllUI() {
    const stats = getUsage();

    // Update remaining counters
    document.querySelectorAll('.usage-remaining').forEach(el => {
      el.textContent = stats.remaining;
    });

    // Update limit counters
    document.querySelectorAll('.usage-limit').forEach(el => {
      el.textContent = stats.limit;
    });

    // Update used counters
    document.querySelectorAll('.usage-used').forEach(el => {
      el.textContent = stats.used;
    });

    // Update progress bars
    document.querySelectorAll('.usage-progress-bar, #dashboard-usage-bar').forEach(el => {
      el.style.width = `${stats.percent}%`;
    });

    // Update dashboard elements
    const dashUsed = document.getElementById('dashboard-usage-used');
    if (dashUsed) dashUsed.textContent = stats.used;

    const dashRemaining = document.getElementById('dashboard-usage-remaining');
    if (dashRemaining) dashRemaining.textContent = stats.remaining;

    const dashLimit = document.getElementById('dashboard-usage-limit');
    if (dashLimit) dashLimit.textContent = stats.limit;

    const dashPercent = document.getElementById('dashboard-usage-percent');
    if (dashPercent) dashPercent.textContent = `${stats.percent}%`;

    const planBadge = document.getElementById('dashboard-plan-badge');
    if (planBadge) {
      planBadge.textContent = stats.tier === 'premium' ? 'Premium (500/day)' : 'Free (50/day)';
      planBadge.className = `dashboard-badge ${stats.tier === 'premium' ? 'badge-premium' : 'badge-free'}`;
    }

    // Update navbar badge if present
    const navBadge = document.getElementById('nav-usage-badge');
    if (navBadge) {
      navBadge.innerHTML = `⚡ <span class="usage-remaining">${stats.remaining}</span>/${stats.limit}`;
      navBadge.title = `${stats.remaining} of ${stats.limit} daily messages remaining`;
    }
  }

  function init() {
    updateAllUI();
    // Periodically sync with backend if configured
    if (typeof API !== 'undefined' && API.isConfigured()) {
      API.getUsage();
    }
    window.addEventListener('mrsall:tier_updated', () => {
      updateAllUI();
      if (typeof API !== 'undefined' && API.isConfigured()) {
        API.getUsage();
      }
    });
  }

  return {
    init,
    getUsage,
    syncWithHeaders,
    notifyLimitReached,
    updateAllUI,
  };
})();

// Attach globally
window.UsageTracker = UsageTracker;

/* ── API Abstraction Layer ── */
const API = (() => {
  // Default URL (can be overridden via Settings modal or localStorage)
  const DEFAULT_WORKER = 'https://mrsall-ai.your-subdomain.workers.dev';

  function getWorkerBase() {
    const custom = localStorage.getItem('mrsall_worker_url');
    if (custom && custom.trim().startsWith('http')) return custom.trim();
    // In an integrated Cloudflare Worker deployment, the worker serves the frontend from same origin
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    return DEFAULT_WORKER;
  }

  function isConfigured() {
    const custom = localStorage.getItem('mrsall_worker_url');
    if (custom && custom.trim().startsWith('http')) return true;
    // When served from any web origin (Cloudflare Workers, custom domain, localhost), the same-origin backend is available
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.protocol.startsWith('http')) {
      return true;
    }
    if (DEFAULT_WORKER && !DEFAULT_WORKER.includes('your-subdomain')) return true;
    return false;
  }

  async function checkHealth(url) {
    const base = (url || getWorkerBase()).replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${base}/api/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function getUsage() {
    if (!isConfigured()) return null;
    const base = getWorkerBase().replace(/\/+$/, '');
    try {
      const headers = {};
      const user = (typeof AuthManager !== 'undefined') ? AuthManager.getUser() : null;
      if (user && user.id) {
        headers['X-User-Id'] = user.id;
        headers['X-User-Tier'] = (typeof AuthManager.getTier === 'function') ? AuthManager.getTier() : (user.tier || 'free');
      }
      const res = await fetch(`${base}/api/usage`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (typeof UsageTracker !== 'undefined') {
          UsageTracker.syncWithHeaders(res.headers, data);
        }
        return data;
      }
    } catch {
      // Passive sync failure ignored
    }
    return null;
  }

  async function call(endpoint, payload) {
    if (!isConfigured()) {
      return { error: true, message: typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_api') : 'API not configured' };
    }
    const base = getWorkerBase().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = base ? `${base}/${cleanEndpoint}` : `/${cleanEndpoint}`;

    try {
      const headers = { 'Content-Type': 'application/json' };
      const user = (typeof AuthManager !== 'undefined') ? AuthManager.getUser() : null;
      if (user && user.id) {
        headers['X-User-Id'] = user.id;
        headers['X-User-Tier'] = (typeof AuthManager.getTier === 'function') ? AuthManager.getTier() : (user.tier || 'free');
        if (user.email) headers['X-User-Email'] = user.email;
      }
      // Add multi-provider AI headers if configured (used by chat endpoint)
      if (typeof AIProviderManager !== 'undefined') {
        const providerHeaders = AIProviderManager.getHeaders();
        Object.assign(headers, providerHeaders);
      }

      // 32-second client-side timeout: the Worker aborts Gemini at 25s and returns a clean 504,
      // so the browser should receive a response within 27s in the worst case.
      // If the network itself hangs (Cloudflare unreachable), we bail at 32s with a user-friendly error.
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(32000),
      });

      // Synchronize daily usage headers from backend
      if (typeof UsageTracker !== 'undefined' && res.headers) {
        UsageTracker.syncWithHeaders(res.headers);
      }

      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        if (typeof UsageTracker !== 'undefined') {
          UsageTracker.notifyLimitReached(err.message);
        }
        return { error: true, isQuota: true, message: err.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('usage_limit_reached') : 'Daily limit reached') };
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: true, message: err.message || `Server error (HTTP ${res.status})` };
      }
      return await res.json();
    } catch (e) {
      console.error('API call exception:', e);
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        return { error: true, message: 'Request timed out. Please check your connection and try again.' };
      }
      return { error: true, message: e.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_generic') : 'An error occurred') };
    }
  }

  /**
   * Stream a chat request via Server-Sent Events (SSE).
   * Calls the Worker with X-Stream: true, then reads the SSE response progressively.
   *
   * @param {Array}    messages      - Array of {role, content} objects
   * @param {Function} onToken       - Called with each text token as it arrives (string)
   * @param {Function} onDone        - Called when stream completes with { elapsed } info
   * @param {Function} onError       - Called on any error with an error message string
   * @param {AbortSignal} [signal]   - Optional AbortSignal for cancellation
   */
  async function streamChat(messages, onToken, onDone, onError, signal) {
    if (!isConfigured()) {
      onError(typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_api') : 'API not configured');
      return;
    }

    const base = getWorkerBase().replace(/\/+$/, '');
    const url = `${base}/api/chat`;

    const headers = {
      'Content-Type': 'application/json',
      'X-Stream': 'true',
    };
    const user = (typeof AuthManager !== 'undefined') ? AuthManager.getUser() : null;
    if (user && user.id) {
      headers['X-User-Id'] = user.id;
      headers['X-User-Tier'] = (typeof AuthManager.getTier === 'function') ? AuthManager.getTier() : (user.tier || 'free');
      if (user.email) headers['X-User-Email'] = user.email;
    }
    // Add multi-provider AI headers if configured
    if (typeof AIProviderManager !== 'undefined') {
      const providerHeaders = AIProviderManager.getHeaders();
      Object.assign(headers, providerHeaders);
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages }),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        onError('Request cancelled.');
      } else {
        onError(e.message || 'Network error. Please check your connection.');
      }
      return;
    }

    // Sync usage headers from SSE response
    if (typeof UsageTracker !== 'undefined' && res.headers) {
      UsageTracker.syncWithHeaders(res.headers);
    }

    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      if (typeof UsageTracker !== 'undefined') {
        UsageTracker.notifyLimitReached(err.message);
      }
      onError(err.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('usage_limit_reached') : 'Daily limit reached'));
      return;
    }

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      onError(err.message || `Server error (HTTP ${res.status})`);
      return;
    }

    // Read the SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (split on double newline)
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          const jsonStr = dataLine.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr);
            if (chunk.error) {
              onError(chunk.error);
              return;
            } else if (chunk.done) {
              onDone({ elapsed: chunk.elapsed });
              return;
            } else if (typeof chunk.token === 'string') {
              onToken(chunk.token);
            }
          } catch {
            // Ignore parse errors on individual chunks
          }
        }
      }
      // Stream ended without explicit done event
      onDone({ elapsed: null });
    } catch (streamErr) {
      if (streamErr.name === 'AbortError') {
        onError('Request cancelled.');
      } else {
        onError(streamErr.message || 'Stream read error');
      }
    } finally {
      reader.releaseLock().catch(() => {});
    }
  }

  return {
    chat: (messages) => call('api/chat', { messages }),
    streamChat,
    write: (type, topic, tone, lang) => call('api/write', { type, topic, tone, lang }),
    translate: (text, from, to) => call('api/translate', { text, from, to }),
    study: (mode, content, lang) => call('api/study', { mode, content, lang }),
    image: (prompt, style) => call('api/image', { prompt, style }),
    code: (mode, language, content) => call('api/code', { mode, language, content }),
    pdf: (action, text, question) => call('api/pdf', { action, text, question }),
    isConfigured,
    getWorkerBase,
    getUsage,
    setWorkerBase: (url) => {
      if (url && url.trim()) {
        localStorage.setItem('mrsall_worker_url', url.trim());
      } else {
        localStorage.removeItem('mrsall_worker_url');
      }
    },
    checkHealth,
  };
})();

/* ── Toast Notifications ── */
const Toast = (() => {
  let timer;
  function show(msg, type = 'info', duration = 3000) {
    clearTimeout(timer);
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    timer = setTimeout(() => el.remove(), duration);
  }
  return { show };
})();
window.Toast = Toast;

/* ── Clipboard Helper ── */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    Toast.show(LanguageManager.t('copied'), 'success');
  } catch {
    Toast.show(LanguageManager.t('error_generic'), 'error');
  }
}

/* ── API Banner ── */
function renderApiBanner(containerId) {
  if (API.isConfigured()) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const banner = document.createElement('div');
  banner.className = 'api-banner';
  banner.textContent = LanguageManager.t('api_banner');
  container.prepend(banner);
}

/* ============================================
   CHAT TOOL
============================================ */
const ChatTool = (() => {
  let conversations = JSON.parse(localStorage.getItem('mrsall_chat_history') || '[]');
  let currentConvId = null;
  let isLoading = false;
  // AbortController for the in-flight streaming request (prevents duplicate requests)
  let activeController = null;

  function saveHistory() {
    localStorage.setItem('mrsall_chat_history', JSON.stringify(conversations.slice(0, 20)));
  }

  function getCurrentConv() {
    return conversations.find(c => c.id === currentConvId);
  }

  function newConversation() {
    const id = Date.now().toString();
    conversations.unshift({ id, title: 'New Chat', messages: [] });
    currentConvId = id;
    saveHistory();
    renderHistory();
    renderMessages();
  }

  function renderHistory() {
    const list = document.getElementById('chat-history-list');
    if (!list) return;
    list.innerHTML = '';
    conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = `chat-history-item${conv.id === currentConvId ? ' active' : ''}`;
      item.textContent = conv.title;
      item.addEventListener('click', () => {
        currentConvId = conv.id;
        renderHistory();
        renderMessages();
      });
      list.appendChild(item);
    });
  }

  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const conv = getCurrentConv();
    if (!conv || conv.messages.length === 0) {
      container.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">🤖</div>
          <h3 data-i18n="chat_welcome_title">${LanguageManager.t('chat_welcome_title')}</h3>
          <p data-i18n="chat_welcome_desc">${LanguageManager.t('chat_welcome_desc')}</p>
        </div>`;
      return;
    }
    container.innerHTML = '';
    conv.messages.forEach(msg => appendMessage(msg.role, msg.content, false));
    container.scrollTop = container.scrollHeight;
  }

  function appendMessage(role, content, animate = true) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    // Remove welcome message
    const welcome = container.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;
    if (!animate) msgEl.style.animation = 'none';

    const avatar = role === 'assistant' ? '🤖' : '👤';
    msgEl.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-content">
        <div class="msg-bubble">${escapeHtml(content)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="copyToClipboard(this.closest('.msg-content').querySelector('.msg-bubble').textContent)">
            📋 ${LanguageManager.t('copy')}
          </button>
        </div>
      </div>`;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const typing = document.createElement('div');
    typing.className = 'message assistant';
    typing.id = 'typing-indicator';
    typing.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-content">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  async function sendMessage() {
    // Prevent duplicate in-flight requests
    if (isLoading) return;
    const textarea = document.getElementById('chat-input');
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;

    if (!currentConvId) newConversation();
    const conv = getCurrentConv();

    conv.messages.push({ role: 'user', content: text });
    if (conv.messages.length === 1) {
      conv.title = text.substring(0, 40) + (text.length > 40 ? '...' : '');
    }
    textarea.value = '';
    textarea.style.height = 'auto';
    appendMessage('user', text);
    renderHistory();
    saveHistory();

    isLoading = true;
    activeController = new AbortController();

    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = true;
    showTyping();

    try {
      const messagesPayload = conv.messages.map(m => ({ role: m.role, content: m.content }));
      const result = await API.chat(messagesPayload);

      if (result.error) {
        const errorMsg = result.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_generic') : 'An error occurred');
        appendMessage('assistant', `⚠️ ${errorMsg}`);
      } else {
        const reply = result.content || result.text || result.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_generic') : 'No response');
        conv.messages.push({ role: 'assistant', content: reply });
        saveHistory();
        appendMessage('assistant', reply);
      }
    } catch (err) {
      console.error('Chat error:', err);
      appendMessage('assistant', `⚠️ ${err.message || (typeof LanguageManager !== 'undefined' ? LanguageManager.t('error_generic') : 'An unexpected error occurred')}`);
    } finally {
      removeTyping();
      isLoading = false;
      activeController = null;
      if (sendBtn) sendBtn.disabled = false;
      const el = document.getElementById('chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  function init() {
    if (!document.getElementById('chat-messages')) return;
    renderApiBanner('chat-tool-body');
    if (conversations.length > 0) {
      currentConvId = conversations[0].id;
    } else {
      newConversation();
    }
    renderHistory();
    renderMessages();

    document.getElementById('new-chat-btn')?.addEventListener('click', newConversation);

    const textarea = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    // Initialize AI provider selector
    if (typeof AIProviderManager !== 'undefined') {
      AIProviderManager.init();
    }
  }

  return { init };
})();

/* ============================================
   WRITER TOOL
============================================ */
const WriterTool = (() => {
  async function generate() {
    const type = document.getElementById('writer-type')?.value || 'article';
    const topic = document.getElementById('writer-topic')?.value?.trim();
    const tone = document.getElementById('writer-tone')?.value || 'professional';
    const lang = LanguageManager.get();

    if (!topic) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }

    setLoading(true);
    const result = await API.write(type, topic, tone, lang);
    setLoading(false);

    const output = document.getElementById('writer-output');
    if (!output) return;
    if (result.error) {
      output.textContent = result.message;
    } else {
      output.textContent = result.content || result.text || result.message || LanguageManager.t('error_generic');
    }
  }

  function setLoading(loading) {
    const btn = document.getElementById('writer-generate-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? LanguageManager.t('generating') : LanguageManager.t('generate');
    }
  }

  function init() {
    if (!document.getElementById('writer-output')) return;
    renderApiBanner('writer-tool-body');
    document.getElementById('writer-generate-btn')?.addEventListener('click', generate);
    document.getElementById('writer-copy-btn')?.addEventListener('click', () => {
      const output = document.getElementById('writer-output');
      if (output?.textContent) copyToClipboard(output.textContent);
    });
    document.getElementById('writer-clear-btn')?.addEventListener('click', () => {
      const output = document.getElementById('writer-output');
      if (output) output.textContent = '';
      const topic = document.getElementById('writer-topic');
      if (topic) topic.value = '';
    });
  }

  return { init };
})();

/* ============================================
   TRANSLATOR TOOL
============================================ */
const TranslatorTool = (() => {
  async function translate() {
    const text = document.getElementById('trans-input')?.value?.trim();
    const from = document.getElementById('trans-from')?.value || 'auto';
    const to = document.getElementById('trans-to')?.value || 'en';

    if (!text) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }

    setLoading(true);
    const result = await API.translate(text, from, to);
    setLoading(false);

    const output = document.getElementById('trans-output');
    if (!output) return;
    if (result.error) {
      output.value = result.message;
    } else {
      output.value = result.content || result.text || result.translation || LanguageManager.t('error_generic');
    }
  }

  function setLoading(loading) {
    const btn = document.getElementById('trans-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? LanguageManager.t('translating') : LanguageManager.t('translate');
    }
  }

  function swap() {
    const fromEl = document.getElementById('trans-from');
    const toEl = document.getElementById('trans-to');
    const inputEl = document.getElementById('trans-input');
    const outputEl = document.getElementById('trans-output');
    if (!fromEl || !toEl) return;

    const tempLang = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = tempLang;

    if (inputEl && outputEl) {
      const tempText = inputEl.value;
      inputEl.value = outputEl.value;
      outputEl.value = tempText;
    }
  }

  function init() {
    if (!document.getElementById('trans-input')) return;
    renderApiBanner('translator-tool-body');
    document.getElementById('trans-btn')?.addEventListener('click', translate);
    document.getElementById('trans-swap')?.addEventListener('click', swap);
    document.getElementById('trans-copy-btn')?.addEventListener('click', () => {
      const output = document.getElementById('trans-output');
      if (output?.value) copyToClipboard(output.value);
    });
    document.getElementById('trans-clear-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('trans-input');
      const out = document.getElementById('trans-output');
      if (inp) inp.value = '';
      if (out) out.value = '';
    });
  }

  return { init };
})();

/* ============================================
   STUDY TOOL
============================================ */
const StudyTool = (() => {
  async function process() {
    const mode = document.getElementById('study-mode')?.value || 'explain';
    const content = document.getElementById('study-input')?.value?.trim();
    const lang = LanguageManager.get();

    if (!content) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }

    setLoading(true);
    const result = await API.study(mode, content, lang);
    setLoading(false);

    const output = document.getElementById('study-output');
    if (!output) return;
    if (result.error) {
      output.textContent = result.message;
    } else {
      output.textContent = result.content || result.text || result.message || LanguageManager.t('error_generic');
    }
  }

  function setLoading(loading) {
    const btn = document.getElementById('study-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? LanguageManager.t('processing') : LanguageManager.t('generate');
    }
  }

  function init() {
    if (!document.getElementById('study-output')) return;
    renderApiBanner('study-tool-body');
    document.getElementById('study-btn')?.addEventListener('click', process);
    document.getElementById('study-copy-btn')?.addEventListener('click', () => {
      const output = document.getElementById('study-output');
      if (output?.textContent) copyToClipboard(output.textContent);
    });
    document.getElementById('study-clear-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('study-input');
      const out = document.getElementById('study-output');
      if (inp) inp.value = '';
      if (out) out.textContent = '';
    });
  }

  return { init };
})();

/* ============================================
   IMAGE TOOL
============================================ */
const ImageTool = (() => {
  let selectedStyle = 'photorealistic';

  async function generate() {
    const prompt = document.getElementById('image-prompt')?.value?.trim();
    if (!prompt) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }

    const dlBtn = document.getElementById('image-download-btn');
    if (dlBtn) dlBtn.style.display = 'none';

    setLoading(true);
    const result = await API.image(prompt, selectedStyle);
    setLoading(false);

    const preview = document.getElementById('image-preview');
    if (!preview) return;
    if (result.error) {
      preview.innerHTML = `<p style="color:var(--text-secondary);padding:20px;text-align:center;">${result.message}</p>`;
      if (dlBtn) dlBtn.style.display = 'none';
    } else if (result.url || result.image_url) {
      const url = result.url || result.image_url;
      preview.innerHTML = `<img src="${url}" alt="Generated image" style="width:100%;border-radius:12px;">`;
      if (dlBtn) {
        dlBtn.style.display = 'flex';
        dlBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = 'mrsall-ai-image.png';
          a.click();
        };
      }
    }
  }

  function setLoading(loading) {
    const btn = document.getElementById('image-gen-btn');
    if (btn) {
      btn.disabled = loading;
      btn.innerHTML = loading
        ? `<span class="spinner"></span> ${LanguageManager.t('generating')}`
        : `✨ ${LanguageManager.t('generate')}`;
    }
  }

  function init() {
    if (!document.getElementById('image-prompt')) return;
    renderApiBanner('image-tool-body');
    document.querySelectorAll('.style-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.style-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedStyle = opt.dataset.style;
      });
    });
    document.getElementById('image-gen-btn')?.addEventListener('click', generate);
  }

  return { init };
})();

/* ============================================
   CODE TOOL
============================================ */
const CodeTool = (() => {
  async function process() {
    const mode = document.getElementById('code-mode')?.value || 'generate';
    const language = document.getElementById('code-lang-select')?.value || 'javascript';
    const content = document.getElementById('code-input')?.value?.trim();

    if (!content) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }

    setLoading(true);
    const result = await API.code(mode, language, content);
    setLoading(false);

    const output = document.getElementById('code-output');
    const outputText = document.getElementById('code-output-text');
    const placeholder = document.getElementById('code-placeholder');
    if (!output || !outputText) return;

    if (result.error) {
      outputText.textContent = result.message;
      document.getElementById('code-lang-badge').textContent = '';
    } else {
      const code = result.content || result.text || result.code || LanguageManager.t('error_generic');
      outputText.textContent = code;
      document.getElementById('code-lang-badge').textContent = language;
    }
    output.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  }

  function setLoading(loading) {
    const btn = document.getElementById('code-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? LanguageManager.t('processing') : LanguageManager.t('generate');
    }
  }

  function init() {
    if (!document.getElementById('code-input')) return;
    renderApiBanner('code-tool-body');
    document.getElementById('code-btn')?.addEventListener('click', process);
    document.getElementById('code-copy-btn')?.addEventListener('click', () => {
      const outputText = document.getElementById('code-output-text');
      if (outputText?.textContent) copyToClipboard(outputText.textContent);
    });
    document.getElementById('code-clear-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('code-input');
      const out = document.getElementById('code-output');
      const placeholder = document.getElementById('code-placeholder');
      if (inp) inp.value = '';
      if (out) out.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    });
  }

  return { init };
})();

/* ============================================
   PDF TOOL
============================================ */
const PDFTool = (() => {
  let pdfText = '';
  let fileName = '';

  function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      Toast.show(LanguageManager.t('error_file_type'), 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      Toast.show(LanguageManager.t('error_file_size'), 'error');
      return;
    }
    fileName = file.name;
    // Use PDF.js via CDN to extract text
    const fileURL = URL.createObjectURL(file);
    if (typeof pdfjsLib === 'undefined') {
      // fallback: show file name, let user ask questions manually
      showUploadSuccess(file.name, '(PDF text extraction requires PDF.js. File uploaded successfully — summarize or ask questions.)');
      return;
    }
    const loadingTask = pdfjsLib.getDocument(fileURL);
    loadingTask.promise.then(pdf => {
      let textPromises = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        textPromises.push(pdf.getPage(i).then(page => page.getTextContent()).then(tc => tc.items.map(it => it.str).join(' ')));
      }
      Promise.all(textPromises).then(pages => {
        pdfText = pages.join('\n\n');
        showUploadSuccess(file.name, `Extracted ${pdf.numPages} page(s) of text.`);
      });
    }).catch(() => {
      Toast.show(LanguageManager.t('error_generic'), 'error');
    });
  }

  function showUploadSuccess(name, info) {
    const uploadArea = document.getElementById('pdf-upload-area');
    const pdfInfo = document.getElementById('pdf-info');
    const pdfActions = document.getElementById('pdf-actions');
    if (uploadArea) uploadArea.style.display = 'none';
    if (pdfInfo) {
      pdfInfo.style.display = 'flex';
      document.getElementById('pdf-filename').textContent = name;
      document.getElementById('pdf-fileinfo').textContent = info;
    }
    if (pdfActions) pdfActions.style.display = 'block';
  }

  async function askQuestion() {
    const question = document.getElementById('pdf-question')?.value?.trim();
    if (!question) { Toast.show(LanguageManager.t('error_empty'), 'error'); return; }
    setLoading(true, 'ask');
    const result = await API.pdf('ask', pdfText || fileName, question);
    setLoading(false, 'ask');
    showOutput(result);
  }

  async function summarize() {
    setLoading(true, 'summarize');
    const result = await API.pdf('summarize', pdfText || fileName, '');
    setLoading(false, 'summarize');
    showOutput(result);
  }

  function showOutput(result) {
    const output = document.getElementById('pdf-output');
    const placeholder = document.getElementById('pdf-output-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    if (!output) return;
    output.style.display = 'block';
    const body = document.getElementById('pdf-output-text');
    if (body) {
      body.textContent = result.error
        ? result.message
        : (result.content || result.text || result.message || LanguageManager.t('error_generic'));
    }
  }

  function setLoading(loading, btn) {
    const el = document.getElementById(btn === 'ask' ? 'pdf-ask-btn' : 'pdf-summarize-btn');
    if (el) {
      el.disabled = loading;
      el.textContent = loading ? LanguageManager.t('processing') : (btn === 'ask' ? LanguageManager.t('pdf_ask') : LanguageManager.t('pdf_summarize'));
    }
  }

  function init() {
    if (!document.getElementById('pdf-upload-area')) return;
    renderApiBanner('pdf-tool-body');

    const uploadArea = document.getElementById('pdf-upload-area');
    const fileInput = document.getElementById('pdf-file-input');

    uploadArea?.addEventListener('click', () => fileInput?.click());
    uploadArea?.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      handleFile(e.dataTransfer?.files[0]);
    });
    fileInput?.addEventListener('change', (e) => handleFile(e.target.files[0]));
    document.getElementById('pdf-ask-btn')?.addEventListener('click', askQuestion);
    document.getElementById('pdf-summarize-btn')?.addEventListener('click', summarize);
    document.getElementById('pdf-copy-btn')?.addEventListener('click', () => {
      const outputText = document.getElementById('pdf-output-text');
      if (outputText?.textContent) copyToClipboard(outputText.textContent);
    });
    document.getElementById('pdf-new-btn')?.addEventListener('click', () => {
      pdfText = '';
      fileName = '';
      const uploadArea = document.getElementById('pdf-upload-area');
      const pdfInfo = document.getElementById('pdf-info');
      const pdfActions = document.getElementById('pdf-actions');
      const pdfOutput = document.getElementById('pdf-output');
      const placeholder = document.getElementById('pdf-output-placeholder');
      if (uploadArea) uploadArea.style.display = 'block';
      if (pdfInfo) pdfInfo.style.display = 'none';
      if (pdfActions) pdfActions.style.display = 'none';
      if (pdfOutput) pdfOutput.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      if (fileInput) fileInput.value = '';
    });
  }

  return { init };
})();

/* ── Shared Utility ── */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
