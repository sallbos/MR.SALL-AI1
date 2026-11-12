/* ============================================
   MR.SALL AI — Multi-Provider AI State Manager (provider.js)
   
   Manages:
   - Active provider selection (Gemini, OpenAI, DeepSeek, Groq)
   - Active model selection per provider
   - Provider catalog fetched from /api/providers
   - Sends X-AI-Provider and X-AI-Model headers with every chat request
   - Persists choices to localStorage
   ============================================ */

const AIProviderManager = (() => {
  const STORAGE_KEY_PROVIDER = 'mrsall_ai_provider';
  const STORAGE_KEY_MODEL    = 'mrsall_ai_model';

  // Built-in fallback catalog — used before /api/providers responds
  const FALLBACK_CATALOG = [
    {
      id: 'gemini',
      name: 'Gemini',
      emoji: '✨',
      configured: true, // assume Gemini is always configured (original default)
      defaultModel: 'gemini-3.8-flash',
      models: [
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      emoji: '🤖',
      configured: false,
      defaultModel: 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o-mini',    label: 'GPT-4o Mini' },
        { id: 'gpt-4o',         label: 'GPT-4o' },
        { id: 'gpt-3.5-turbo',  label: 'GPT-3.5 Turbo' },
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      emoji: '🔍',
      configured: false,
      defaultModel: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat',      label: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner',  label: 'DeepSeek Reasoner' },
      ],
    },
    {
      id: 'groq',
      name: 'Groq',
      emoji: '⚡',
      configured: false,
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
        { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B' },
        { id: 'gemma2-9b-it',             label: 'Gemma 2 9B' },
      ],
    },
  ];

  // Runtime state
  let catalog = FALLBACK_CATALOG;
  let activeProviderId = localStorage.getItem(STORAGE_KEY_PROVIDER) || 'gemini';
  let activeModelId    = localStorage.getItem(STORAGE_KEY_MODEL)    || 'gemini-3.8-flash';

  // ── Accessors ──────────────────────────────────────────────────

  function getActiveProvider() {
    return catalog.find(p => p.id === activeProviderId) || catalog[0];
  }

  function getActiveModel() {
    return activeModelId;
  }

  function getHeaders() {
    return {
      'X-AI-Provider': activeProviderId,
      'X-AI-Model':    activeModelId,
    };
  }

  // ── Setters ───────────────────────────────────────────────────

  function setProvider(providerId) {
    const provider = catalog.find(p => p.id === providerId);
    if (!provider) return;
    if (!provider.configured) {
      const msg = `${provider.emoji} ${provider.name} API key is not configured in the Worker. Contact your administrator.`;
      const toast = window.Toast || (typeof Toast !== 'undefined' ? Toast : null);
      if (toast && typeof toast.show === 'function') {
        toast.show(msg, 'error', 5000);
      } else {
        alert(msg);
      }
      return;
    }
    activeProviderId = providerId;
    // Reset to this provider's default model when switching
    activeModelId = provider.defaultModel;
    localStorage.setItem(STORAGE_KEY_PROVIDER, activeProviderId);
    localStorage.setItem(STORAGE_KEY_MODEL,    activeModelId);
    renderSelector();
  }

  function setModel(modelId) {
    const provider = getActiveProvider();
    if (!provider) return;
    const valid = provider.models.some(m => m.id === modelId);
    if (!valid) return;
    activeModelId = modelId;
    localStorage.setItem(STORAGE_KEY_MODEL, activeModelId);
  }

  // ── Catalog refresh from backend ──────────────────────────────

  async function refreshCatalog() {
    try {
      const base = (typeof API !== 'undefined' && typeof API.getWorkerBase === 'function')
        ? API.getWorkerBase().replace(/\/+$/, '')
        : window.location.origin;
      const res = await fetch(`${base}/api/providers`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.providers) && data.providers.length > 0) {
        catalog = data.providers;

        // Validate active provider is still valid
        const activeProv = catalog.find(p => p.id === activeProviderId);
        if (!activeProv || !activeProv.configured) {
          // Fall back to first configured provider
          const firstConfigured = catalog.find(p => p.configured);
          if (firstConfigured) {
            activeProviderId = firstConfigured.id;
            activeModelId    = firstConfigured.defaultModel;
            localStorage.setItem(STORAGE_KEY_PROVIDER, activeProviderId);
            localStorage.setItem(STORAGE_KEY_MODEL,    activeModelId);
          }
        } else {
          // Validate active model is still in this provider's list
          const validModels = activeProv.models.map(m => m.id);
          if (!validModels.includes(activeModelId)) {
            activeModelId = activeProv.defaultModel;
            localStorage.setItem(STORAGE_KEY_MODEL, activeModelId);
          }
        }

        renderSelector();
      }
    } catch {
      // Silently use fallback catalog — backend may not be deployed yet
    }
  }

  // ── UI Rendering ──────────────────────────────────────────────

  function renderSelector() {
    const bar = document.getElementById('ai-provider-selector');
    if (!bar) return;

    const isRTL = document.documentElement.getAttribute('dir') === 'rtl';

    // Build provider pills
    const pillsHtml = catalog.map(p => {
      const isActive = p.id === activeProviderId;
      const classes  = [
        'provider-pill',
        isActive      ? 'active'      : '',
        !p.configured ? 'unavailable' : '',
      ].filter(Boolean).join(' ');
      const title = p.configured
        ? `Switch to ${p.name}`
        : `${p.name} API key not configured`;
      return `<button class="${classes}" data-provider="${p.id}" title="${title}" aria-label="${p.name}">
        <span>${p.emoji}</span>
        <span>${p.name}</span>
      </button>`;
    }).join('');

    // Build model selector for active provider
    const activeProvider = getActiveProvider();
    const modelOptions = (activeProvider?.models || []).map(m => {
      const sel = m.id === activeModelId ? ' selected' : '';
      return `<option value="${m.id}"${sel}>${m.label}</option>`;
    }).join('');

    bar.innerHTML = `
      <span class="provider-selector-label">AI</span>
      <div class="provider-pills">${pillsHtml}</div>
      <select class="provider-model-select" id="provider-model-select" aria-label="Select model" title="Select model">
        ${modelOptions}
      </select>
    `;

    // Attach events
    bar.querySelectorAll('.provider-pill').forEach(btn => {
      btn.addEventListener('click', () => setProvider(btn.dataset.provider));
    });

    const modelSelect = bar.querySelector('#provider-model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', () => setModel(modelSelect.value));
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    // Render immediately with fallback catalog
    renderSelector();
    // Then fetch live catalog from backend
    refreshCatalog();
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    init,
    getHeaders,
    getActiveProvider,
    getActiveModel,
    refreshCatalog,
    getCatalog: () => catalog,
  };
})();

window.AIProviderManager = AIProviderManager;
