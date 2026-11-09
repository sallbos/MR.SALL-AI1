/* ============================================
   MR.SALL AI — Main App (app.js)
   ============================================ */

// Safe global HTML escaper
window.escapeHtml = window.escapeHtml || function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

document.addEventListener('DOMContentLoaded', () => {
  // ── Authentication Gatekeeper ──
  // Check if current page is protected and user is not authenticated
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const isPublicPage = currentPage === 'login.html' || currentPage === 'privacy.html' || currentPage === 'terms.html' || currentPage === 'offline.html';

  if (!isPublicPage && typeof AuthManager !== 'undefined' && !AuthManager.isAuthenticated()) {
    const isSubfolder = window.location.pathname.includes('/tools/');
    const loginUrl = isSubfolder ? '../login.html' : 'login.html';
    const redirectParam = encodeURIComponent(window.location.href);
    window.location.replace(`${loginUrl}?redirect=${redirectParam}`);
    return;
  }

  // Initialize core systems
  ThemeManager.init();
  LanguageManager.init();
  if (typeof AuthManager !== 'undefined') {
    AuthManager.init();
  }
  if (typeof UsageTracker !== 'undefined') {
    UsageTracker.init();
  }
  if (typeof PwaManager !== 'undefined') {
    PwaManager.init();
  }
  initNavbar();
  initDashboard();
  initSettingsModal();
  initTools();
  initAnimations();
});

/* ── Navbar ── */
function initNavbar() {
  // Scroll effect
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    }
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
      menuToggle.textContent = mobileNav.classList.contains('open') ? '✕' : '☰';
    });
    // Close on nav link click
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        menuToggle.textContent = '☰';
      });
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!menuToggle.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
        menuToggle.textContent = '☰';
      }
    });
  }

  // Highlight active nav link based on current URL
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPage || (currentPage === 'index.html' && href === '#home'))) {
      link.classList.add('active');
    }
  });

  // Smooth scroll for anchor links (excluding #settings)
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href === '#settings') return; // Handled by settings modal
    a.addEventListener('click', (e) => {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ── Settings Modal ── */
function initSettingsModal() {
  // Inject modal into DOM if not present
  if (!document.getElementById('settings-modal')) {
    const currentUser = typeof AuthManager !== 'undefined' ? AuthManager.getUser() : null;
    const isGuest = currentUser && currentUser.provider === 'guest';
    const userDisplay = currentUser
      ? `${escapeHtml(currentUser.name)} (${isGuest ? 'Guest' : currentUser.email || 'Google Account'})`
      : 'Not signed in';

    const modalHtml = `
      <div class="modal-backdrop" id="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title" id="settings-modal-title">
              ⚙️ <span data-i18n="settings_title">${LanguageManager.t('settings_title')}</span>
            </h3>
            <button class="modal-close" id="settings-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            <!-- User Account Info -->
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;" data-i18n="login_signed_in_as">
                  ${LanguageManager.t('login_signed_in_as')}
                </div>
                <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-top:2px;" id="settings-user-display">
                  ${userDisplay}
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="settings-signout-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.3);flex-shrink:0;">
                <span data-i18n="login_signout">${LanguageManager.t('login_signout')}</span>
              </button>
            </div>

            <!-- PWA Installation -->
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;">
              <div>
                <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">
                  App Installation (PWA)
                </div>
                <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">
                  Install on Windows, Android, Mac, or iOS
                </div>
              </div>
              <div id="settings-pwa-status">
                <button type="button" class="btn btn-primary btn-sm btn-pwa-install" onclick="typeof PwaManager !== 'undefined' && PwaManager.triggerInstall()">
                  ⚡ <span data-i18n="install_btn">${LanguageManager.t('install_btn') || 'Install App'}</span>
                </button>
              </div>
            </div>

            <!-- Theme Selection -->
            <div class="form-group">
              <label class="form-label" data-i18n="settings_theme">${LanguageManager.t('settings_theme')}</label>
              <select class="form-select" id="settings-theme-select">
                <option value="dark">🌙 Dark Mode</option>
                <option value="light">☀️ Light Mode</option>
              </select>
            </div>

            <!-- Language Selection -->
            <div class="form-group">
              <label class="form-label" data-i18n="settings_lang">${LanguageManager.t('settings_lang')}</label>
              <select class="form-select" id="settings-lang-select">
                <option value="en">English (LTR)</option>
                <option value="ar">العربية (RTL)</option>
                <option value="fr">Français (LTR)</option>
              </select>
            </div>

            <!-- Google OAuth Client ID -->
            <div class="form-group">
              <label class="form-label">Google OAuth Client ID</label>
              <input
                type="text"
                class="form-input"
                id="settings-google-client-id"
                placeholder="123456789-xyz.apps.googleusercontent.com"
              />
              <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                Required for production Google Sign-In. Obtained from Google Cloud Console.
              </p>
            </div>

            <!-- Cloudflare Worker API Endpoint -->
            <div class="form-group">
              <label class="form-label" data-i18n="settings_worker_url">${LanguageManager.t('settings_worker_url')}</label>
              <input
                type="url"
                class="form-input"
                id="settings-worker-url"
                placeholder="https://your-worker.your-subdomain.workers.dev"
              />
              <p style="font-size:12px;color:var(--text-muted);margin-top:4px;" data-i18n="settings_worker_desc">
                ${LanguageManager.t('settings_worker_desc')}
              </p>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button type="button" class="btn btn-secondary btn-sm" id="settings-test-btn" data-i18n="settings_test">
                  ${LanguageManager.t('settings_test')}
                </button>
                <span id="settings-conn-status" style="font-size:12px;display:flex;align-items:center;"></span>
              </div>
            </div>

            <!-- Plan & Usage Info -->
            <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:13px;font-weight:700;color:var(--brand-blue);" data-i18n="dashboard_plan">
                  ${LanguageManager.t('dashboard_plan')}
                </div>
                <div id="settings-plan-pill" class="dashboard-badge badge-free">Free Plan</div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;">
                <span style="color:var(--text-muted);" data-i18n="dashboard_daily_usage">${LanguageManager.t('dashboard_daily_usage')}</span>
                <span style="font-weight:700;"><span class="usage-used">0</span> / <span class="usage-limit">50</span></span>
              </div>
              <div class="dashboard-progress-track" style="margin-bottom:12px;">
                <div class="dashboard-progress-fill usage-progress-bar" style="width:0%;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-muted);margin-bottom:12px;">
                <span data-i18n="dashboard_resets_at">${LanguageManager.t('dashboard_resets_at')}</span>
                <span style="font-weight:600;color:var(--brand-blue);"><span class="usage-remaining">50</span> left</span>
              </div>
              <button type="button" class="btn btn-outline btn-sm" id="settings-tier-toggle" style="width:100%;justify-content:center;">
                ⭐ <span data-i18n="dashboard_upgrade">${LanguageManager.t('dashboard_upgrade')}</span>
              </button>
            </div>

            <!-- Clear Chat History -->
            <div class="form-group">
              <button type="button" class="btn btn-secondary btn-sm" id="settings-clear-history-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.3);">
                🗑️ <span data-i18n="settings_clear_history">${LanguageManager.t('settings_clear_history')}</span>
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="settings-cancel-btn" data-i18n="settings_close">
              ${LanguageManager.t('settings_close')}
            </button>
            <button type="button" class="btn btn-primary" id="settings-save-btn" data-i18n="settings_save">
              ${LanguageManager.t('settings_save')}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  const modal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close-btn');
  const cancelBtn = document.getElementById('settings-cancel-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const testBtn = document.getElementById('settings-test-btn');
  const clearHistoryBtn = document.getElementById('settings-clear-history-btn');
  const signoutBtn = document.getElementById('settings-signout-btn');
  const themeSelect = document.getElementById('settings-theme-select');
  const langSelect = document.getElementById('settings-lang-select');
  const workerInput = document.getElementById('settings-worker-url');
  const clientIdInput = document.getElementById('settings-google-client-id');
  const connStatus = document.getElementById('settings-conn-status');

  function openSettings() {
    if (themeSelect) themeSelect.value = ThemeManager.get();
    if (langSelect) langSelect.value = LanguageManager.get();
    const currentWorker = localStorage.getItem('mrsall_worker_url') || '';
    if (workerInput) workerInput.value = currentWorker;
    if (clientIdInput && typeof AuthManager !== 'undefined') {
      clientIdInput.value = AuthManager.getClientId() || '';
    }
    if (connStatus) connStatus.textContent = '';

    // Update user display
    const userDisplayEl = document.getElementById('settings-user-display');
    if (userDisplayEl && typeof AuthManager !== 'undefined') {
      const u = AuthManager.getUser();
      userDisplayEl.textContent = u
        ? `${u.name} (${u.provider === 'guest' ? 'Guest' : u.email || 'Google Account'})`
        : 'Not signed in';
    }

    // Update Plan & Usage display in settings
    const currentTier = (typeof AuthManager !== 'undefined' && typeof AuthManager.getTier === 'function')
      ? AuthManager.getTier()
      : 'free';
    const planPill = document.getElementById('settings-plan-pill');
    if (planPill) {
      planPill.textContent = currentTier === 'premium' ? 'Premium (500/day)' : 'Free (50/day)';
      planPill.className = `dashboard-badge ${currentTier === 'premium' ? 'badge-premium' : 'badge-free'}`;
    }
    const tierToggleBtn = document.getElementById('settings-tier-toggle');
    if (tierToggleBtn) {
      tierToggleBtn.innerHTML = currentTier === 'premium'
        ? `🔄 <span>${LanguageManager.t('dashboard_switch_free')}</span>`
        : `⭐ <span>${LanguageManager.t('dashboard_upgrade')}</span>`;
      tierToggleBtn.onclick = () => {
        const next = currentTier === 'premium' ? 'free' : 'premium';
        if (typeof AuthManager !== 'undefined' && typeof AuthManager.setTier === 'function') {
          AuthManager.setTier(next);
          openSettings();
        }
      };
    }
    if (typeof UsageTracker !== 'undefined') {
      UsageTracker.updateAllUI();
    }

    modal.classList.add('open');
  }

  function closeSettings() {
    modal.classList.remove('open');
  }

  // Open triggers
  document.querySelectorAll('a[href="#settings"], [data-action="settings"]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openSettings();
    });
  });

  // Close triggers
  closeBtn?.addEventListener('click', closeSettings);
  cancelBtn?.addEventListener('click', closeSettings);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeSettings();
  });

  // Sign out from settings
  signoutBtn?.addEventListener('click', () => {
    closeSettings();
    if (typeof AuthManager !== 'undefined') {
      AuthManager.signOut();
    }
  });

  // Save settings
  saveBtn?.addEventListener('click', () => {
    if (themeSelect) ThemeManager.set(themeSelect.value);
    if (langSelect) LanguageManager.set(langSelect.value);
    if (workerInput) {
      const url = workerInput.value.trim();
      API.setWorkerBase(url);
    }
    if (clientIdInput && typeof AuthManager !== 'undefined') {
      AuthManager.setClientId(clientIdInput.value.trim());
    }
    Toast.show(LanguageManager.t('settings_saved'), 'success');
    closeSettings();
  });

  // Test connection
  testBtn?.addEventListener('click', async () => {
    const url = workerInput?.value?.trim();
    if (!url) {
      if (connStatus) {
        connStatus.textContent = '⚠️ Enter a URL first';
        connStatus.style.color = '#fbbf24';
      }
      return;
    }
    if (testBtn) testBtn.textContent = LanguageManager.t('settings_testing');
    if (connStatus) connStatus.textContent = '';
    const ok = await API.checkHealth(url);
    if (testBtn) testBtn.textContent = LanguageManager.t('settings_test');
    if (connStatus) {
      if (ok) {
        connStatus.textContent = '✅ ' + LanguageManager.t('settings_connected');
        connStatus.style.color = '#22c55e';
      } else {
        connStatus.textContent = '❌ ' + LanguageManager.t('settings_failed');
        connStatus.style.color = '#ef4444';
      }
    }
  });

  // Clear chat history
  clearHistoryBtn?.addEventListener('click', () => {
    localStorage.removeItem('mrsall_chat_history');
    Toast.show(LanguageManager.t('settings_history_cleared'), 'info');
    // If on chat page, refresh chat view
    if (typeof ChatTool !== 'undefined') {
      const list = document.getElementById('chat-history-list');
      if (list) list.innerHTML = '';
      const msgs = document.getElementById('chat-messages');
      if (msgs) {
        msgs.innerHTML = `
          <div class="chat-welcome">
            <div class="chat-welcome-icon">🤖</div>
            <h3>${LanguageManager.t('chat_welcome_title')}</h3>
            <p>${LanguageManager.t('chat_welcome_desc')}</p>
          </div>`;
      }
    }
  });
}

/* ── Tool Initialization ── */
function initTools() {
  ChatTool.init();
  WriterTool.init();
  TranslatorTool.init();
  StudyTool.init();
  ImageTool.init();
  CodeTool.init();
  PDFTool.init();
}

/* ── Animation System ── */
function initAnimations() {
  const cards = document.querySelectorAll('.tool-card, .feature-card');
  if (!cards.length) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    cards.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      observer.observe(el);
    });
  } else {
    // Fallback: show immediately
    cards.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
}

/* ── User Dashboard Overview ── */
function initDashboard() {
  const dashContainer = document.getElementById('dashboard-overview');
  if (!dashContainer) return;

  const user = (typeof AuthManager !== 'undefined') ? AuthManager.getUser() : null;
  if (!user) {
    dashContainer.style.display = 'none';
    return;
  }

  dashContainer.style.display = 'block';

  // Populate user data
  const nameEl = document.getElementById('dashboard-user-name');
  if (nameEl) nameEl.textContent = user.name || 'User';

  const avatarEl = document.getElementById('dashboard-user-avatar');
  if (avatarEl) {
    if (user.picture) {
      avatarEl.innerHTML = `<img src="${user.picture}" alt="${escapeHtml(user.name)}" referrerpolicy="no-referrer">`;
    } else {
      avatarEl.innerHTML = `<div class="dashboard-avatar-initial">${(user.name || 'U').charAt(0).toUpperCase()}</div>`;
    }
  }

  const emailEl = document.getElementById('dashboard-user-email');
  if (emailEl) {
    emailEl.textContent = user.email || (user.provider === 'guest' ? 'Guest Mode' : '');
  }

  // Update plan switch button
  const upgradeBtn = document.getElementById('dashboard-upgrade-btn');
  if (upgradeBtn) {
    const tier = (typeof AuthManager !== 'undefined' && typeof AuthManager.getTier === 'function')
      ? AuthManager.getTier()
      : 'free';
    upgradeBtn.innerHTML = tier === 'premium'
      ? `🔄 <span data-i18n="dashboard_switch_free">${LanguageManager.t('dashboard_switch_free')}</span>`
      : `⭐ <span data-i18n="dashboard_upgrade">${LanguageManager.t('dashboard_upgrade')}</span>`;
    upgradeBtn.onclick = () => {
      const nextTier = tier === 'premium' ? 'free' : 'premium';
      if (typeof AuthManager !== 'undefined' && typeof AuthManager.setTier === 'function') {
        AuthManager.setTier(nextTier);
        initDashboard();
      }
    };
  }

  if (typeof UsageTracker !== 'undefined') {
    UsageTracker.updateAllUI();
  }
}
