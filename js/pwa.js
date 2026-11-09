/**
 * MR.SALL AI — Progressive Web App Controller (pwa.js)
 * Handles Service Worker registration, Install Prompts (Android, Windows, macOS),
 * iOS "Add to Home Screen" instructions modal, standalone detection, and offline notifications.
 */

const PwaManager = (() => {
  let deferredPrompt = null;
  let isStandalone = false;
  let updateRegistration = null;

  function checkStandalone() {
    isStandalone = (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
    if (isStandalone) {
      document.documentElement.setAttribute('data-pwa-standalone', 'true');
    }
    return isStandalone;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function getSwPath() {
    const isSubfolder = window.location.pathname.includes('/tools/');
    return isSubfolder ? '../service-worker.js' : 'service-worker.js';
  }

  // 1. Register Service Worker
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker not supported by browser.');
      return;
    }

    const isSubfolder = window.location.pathname.includes('/tools/');
    const swPath = getSwPath();
    const registerOptions = isSubfolder ? { scope: '../' } : { scope: './' };

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swPath, registerOptions)
        .then((reg) => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
          updateRegistration = reg;

          // Check for service worker updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast();
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] ServiceWorker registration failed:', err);
        });

      // Reload page when new worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  // 2. Install Prompt Listener
  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      deferredPrompt = e;
      console.log('[PWA] Captured beforeinstallprompt event');

      // Update UI to reveal install buttons
      updateInstallUI(true);
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Application installed successfully!');
      deferredPrompt = null;
      updateInstallUI(false, true);

      if (typeof Toast !== 'undefined') {
        Toast.show(
          LanguageManager.t('install_already_installed') || 'MR.SALL AI installed successfully!',
          'success'
        );
      }
    });
  }

  // 3. Trigger Installation
  async function triggerInstall() {
    if (deferredPrompt) {
      // Chrome, Edge, Android native install prompt
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', choiceResult.outcome);
      if (choiceResult.outcome === 'accepted') {
        deferredPrompt = null;
        updateInstallUI(false, true);
      }
    } else if (isIOS()) {
      // Show iOS modal guide
      showIosInstallModal();
    } else if (checkStandalone()) {
      if (typeof Toast !== 'undefined') {
        Toast.show(
          LanguageManager.t('install_already_installed') || 'MR.SALL AI is already installed on your device.',
          'info'
        );
      }
    } else {
      // Desktop or browser where prompt is not yet available or unsupported
      showDesktopInstructionsModal();
    }
  }

  // 4. Update UI buttons
  function updateInstallUI(canInstall, alreadyInstalled = false) {
    const installBtns = document.querySelectorAll('.btn-pwa-install');
    const isApp = alreadyInstalled || checkStandalone();

    installBtns.forEach((btn) => {
      if (isApp) {
        btn.style.display = 'none';
        return;
      }
      if (canInstall || isIOS()) {
        btn.style.display = 'inline-flex';
      }
    });

    // Also update settings modal install status
    const settingsStatus = document.getElementById('settings-pwa-status');
    if (settingsStatus) {
      if (isApp) {
        settingsStatus.innerHTML = `<span style="color:var(--brand-blue);font-weight:700;">✅ ${LanguageManager.t('install_already_installed') || 'Installed (Standalone App)'}</span>`;
      } else {
        settingsStatus.innerHTML = `<button class="btn btn-primary btn-sm btn-pwa-install" onclick="PwaManager.triggerInstall()">⚡ ${LanguageManager.t('install_btn') || 'Install App'}</button>`;
      }
    }
  }

  // 5. iOS Instructions Modal
  function showIosInstallModal() {
    const existing = document.getElementById('pwa-ios-modal');
    if (existing) existing.remove();

    const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
    const modal = document.createElement('div');
    modal.id = 'pwa-ios-modal';
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:480px;text-align:center;">
        <div class="modal-header" style="justify-content:center;position:relative;">
          <div style="width:64px;height:64px;border-radius:18px;padding:3px;background:var(--brand-gradient);box-shadow:0 0 25px var(--brand-blue-glow);margin-bottom:8px;">
            <img src="${getAssetPath('assets/icons/pwa/icon-192x192.png')}" alt="MR.SALL AI" style="width:100%;height:100%;border-radius:15px;object-fit:cover;">
          </div>
          <button class="modal-close" onclick="this.closest('#pwa-ios-modal').remove()" style="position:absolute;top:16px;${isRtl ? 'left:16px;' : 'right:16px;'}">✕</button>
        </div>
        <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:8px;" class="gradient-text">${LanguageManager.t('install_ios_title') || 'Install on iPhone & iPad'}</h3>
        <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:20px;">
          ${LanguageManager.t('install_pwa_desc') || 'Install MR.SALL AI on your home screen for a full-screen, standalone experience.'}
        </p>

        <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:16px;padding:18px;text-align:${isRtl ? 'right' : 'left'};display:flex;flex-direction:column;gap:14px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
              ⎋
            </div>
            <div style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">
              ${LanguageManager.t('install_ios_step1') || '1. Tap the <strong>Share</strong> button in Safari toolbar'}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
              ⊞
            </div>
            <div style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">
              ${LanguageManager.t('install_ios_step2') || '2. Scroll down and tap <strong>Add to Home Screen</strong>'}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
              ➕
            </div>
            <div style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">
              ${LanguageManager.t('install_ios_step3') || '3. Tap <strong>Add</strong> in the top-right corner'}
            </div>
          </div>
        </div>

        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="this.closest('#pwa-ios-modal').remove()">
          ${LanguageManager.t('install_close') || 'Got it'}
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // 6. Desktop / General Manual Instructions Modal
  function showDesktopInstructionsModal() {
    const existing = document.getElementById('pwa-desktop-modal');
    if (existing) existing.remove();

    const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
    const modal = document.createElement('div');
    modal.id = 'pwa-desktop-modal';
    modal.className = 'modal-backdrop active';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:500px;text-align:center;">
        <div class="modal-header" style="justify-content:center;position:relative;">
          <div style="width:64px;height:64px;border-radius:18px;padding:3px;background:var(--brand-gradient);box-shadow:0 0 25px var(--brand-blue-glow);margin-bottom:8px;">
            <img src="${getAssetPath('assets/icons/pwa/icon-192x192.png')}" alt="MR.SALL AI" style="width:100%;height:100%;border-radius:15px;object-fit:cover;">
          </div>
          <button class="modal-close" onclick="this.closest('#pwa-desktop-modal').remove()" style="position:absolute;top:16px;${isRtl ? 'left:16px;' : 'right:16px;'}">✕</button>
        </div>
        <h3 style="font-size:1.35rem;font-weight:800;margin-bottom:8px;" class="gradient-text">${LanguageManager.t('install_pwa_title') || 'Install MR.SALL AI'}</h3>
        <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:20px;">
          ${LanguageManager.t('install_pwa_desc') || 'Install MR.SALL AI as a desktop app on Windows, macOS, or Chromebook for quick access and full-screen workspace.'}
        </p>

        <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:16px;padding:18px;text-align:${isRtl ? 'right' : 'left'};display:flex;flex-direction:column;gap:12px;margin-bottom:24px;font-size:13.5px;color:var(--text-secondary);line-height:1.5;">
          <div><strong>• Chrome & Edge (Windows / Mac):</strong> Look for the <strong>Install</strong> icon (⊕ / 💻) on the right side of the URL address bar, or click browser menu (⋮) → <strong>Install MR.SALL AI</strong>.</div>
          <div><strong>• Safari (macOS Sonoma+):</strong> Click <strong>File</strong> in menu bar → <strong>Add to Dock</strong>.</div>
        </div>

        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="this.closest('#pwa-desktop-modal').remove()">
          ${LanguageManager.t('install_close') || 'Got it'}
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function getAssetPath(relPath) {
    const isSubfolder = window.location.pathname.includes('/tools/');
    return isSubfolder ? `../${relPath}` : relPath;
  }

  // 7. Update Toast Notification
  function showUpdateToast() {
    if (document.getElementById('pwa-update-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar';
    bar.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      background: var(--bg-card);
      border: 1.5px solid var(--brand-blue);
      box-shadow: 0 10px 30px var(--shadow-glow);
      border-radius: 16px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      animation: slideInUp 0.3s ease;
      max-width: 380px;
    `;

    bar.innerHTML = `
      <div style="font-size: 24px;">⚡</div>
      <div style="font-size: 13.5px; color: var(--text-primary); line-height: 1.4;">
        ${LanguageManager.t('pwa_update_available') || 'A new version of MR.SALL AI is ready.'}
      </div>
      <button id="pwa-refresh-btn" class="btn btn-primary btn-sm" style="flex-shrink:0;">
        ${LanguageManager.t('pwa_update_btn') || 'Update'}
      </button>
    `;

    document.body.appendChild(bar);

    bar.querySelector('#pwa-refresh-btn')?.addEventListener('click', () => {
      if (updateRegistration && updateRegistration.waiting) {
        updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  }

  // 8. Online / Offline network status listeners
  function initNetworkStatus() {
    function showNetworkToast(isOnline) {
      if (typeof Toast === 'undefined') return;
      if (isOnline) {
        Toast.show(
          LanguageManager.t('pwa_online_toast') || 'You are back online!',
          'success'
        );
      } else {
        Toast.show(
          LanguageManager.t('pwa_offline_toast') || 'You are offline. AI generation is paused.',
          'warning'
        );
      }
    }

    window.addEventListener('online', () => showNetworkToast(true));
    window.addEventListener('offline', () => showNetworkToast(false));
  }

  // 9. Initialize
  function init() {
    checkStandalone();
    registerServiceWorker();
    initInstallPrompt();
    initNetworkStatus();

    // Auto-setup any install button present
    document.querySelectorAll('.btn-pwa-install').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerInstall();
      });
    });

    // Check if initial standalone state should hide buttons
    if (isStandalone) {
      updateInstallUI(false, true);
    }
  }

  return {
    init,
    triggerInstall,
    isStandalone: checkStandalone,
    showIosModal: showIosInstallModal,
    showDesktopModal: showDesktopInstructionsModal,
  };
})();
