/* ============================================
   MR.SALL AI — Authentication System (auth.js)
   Google Identity Services + Session Management
   ============================================ */

// Safe HTML escaper available globally
window.escapeHtml = window.escapeHtml || function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const AuthManager = (() => {
  const STORAGE_KEY = 'mrsall_auth_user';
  const CLIENT_ID_KEY = 'mrsall_google_client_id';

  // Default Google OAuth Client ID (can be overridden via localStorage or Settings)
  // To obtain a Client ID, visit: https://console.cloud.google.com/apis/credentials
  const DEFAULT_CLIENT_ID = '';

  function getClientId() {
    return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
  }

  function setClientId(clientId) {
    if (clientId && clientId.trim()) {
      localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
    } else {
      localStorage.removeItem(CLIENT_ID_KEY);
    }
  }

  function getUser() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function isAuthenticated() {
    const user = getUser();
    return Boolean(user && user.id);
  }

  function isGuest() {
    const user = getUser();
    return Boolean(user && user.provider === 'guest');
  }

  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to parse JWT token:', e);
      return null;
    }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      if (typeof Toast !== 'undefined') {
        Toast.show(LanguageManager.t('login_auth_error'), 'error');
      }
      return;
    }

    const payload = parseJwt(response.credential);
    if (!payload) {
      if (typeof Toast !== 'undefined') {
        Toast.show(LanguageManager.t('login_auth_error'), 'error');
      }
      return;
    }

    const user = {
      id: payload.sub,
      name: payload.name || payload.given_name || 'User',
      email: payload.email || '',
      picture: payload.picture || '',
      provider: 'google',
      tier: localStorage.getItem('mrsall_user_tier') || 'free',
      token: response.credential,
      loginTime: Date.now(),
    };

    saveUser(user);

    if (typeof Toast !== 'undefined') {
      Toast.show(LanguageManager.t('login_auth_success'), 'success');
    }

    // Redirect to requested page or index.html
    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get('redirect') || 'index.html';
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 400);
  }

  function loginAsGuest() {
    const guestUser = {
      id: 'guest_' + Date.now().toString(36),
      name: LanguageManager.t('login_guest_badge'),
      email: 'guest@mrsall.ai',
      picture: '',
      provider: 'guest',
      tier: localStorage.getItem('mrsall_user_tier') || 'free',
      loginTime: Date.now(),
    };

    saveUser(guestUser);

    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get('redirect') || 'index.html';
    window.location.href = redirectUrl;
  }

  function signOut() {
    const user = getUser();
    localStorage.removeItem(STORAGE_KEY);

    // Revoke Google session if GIS is available
    if (user && user.provider === 'google' && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      try {
        if (user.email) {
          google.accounts.id.revoke(user.email, () => {});
        }
        google.accounts.id.disableAutoSelect();
      } catch (err) {
        console.warn('GIS revoke warning:', err);
      }
    }

    if (typeof Toast !== 'undefined') {
      Toast.show(LanguageManager.t('login_signout_confirm'), 'info');
    }

    // Determine path back to login
    const isSubfolder = window.location.pathname.includes('/tools/');
    const loginUrl = isSubfolder ? '../login.html' : 'login.html';
    setTimeout(() => {
      window.location.href = loginUrl;
    }, 300);
  }

  function initGoogleIdentity(containerId = 'g-signin-btn-box') {
    const clientId = getClientId();

    // Check if GIS script is loaded
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
      return;
    }

    if (clientId) {
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const targetEl = document.getElementById(containerId);
        if (targetEl) {
          targetEl.innerHTML = '';
          google.accounts.id.renderButton(targetEl, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width: 320,
          });
        }
      } catch (err) {
        console.error('Google Identity init error:', err);
      }
    }
  }

  function triggerGoogleSignIn() {
    const clientId = getClientId();

    if (!clientId) {
      // Prompt user to enter their Google Client ID if not set
      const input = prompt(
        'Enter your Google OAuth Client ID to test Google Sign-In.\n\n' +
        'Example: 123456789-abc.apps.googleusercontent.com\n\n' +
        '(Or click "Continue as Guest" for instant access without a Client ID):'
      );
      if (input && input.trim()) {
        setClientId(input.trim());
        initGoogleIdentity();
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
          google.accounts.id.prompt();
        }
      }
      return;
    }

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // If One Tap was dismissed or skipped, re-render standard button
          initGoogleIdentity();
        }
      });
    } else {
      if (typeof Toast !== 'undefined') {
        Toast.show('Google Identity Services loading... please retry in a moment.', 'info');
      }
    }
  }

  function requireAuth(options = {}) {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage === 'login.html') return;

    if (!isAuthenticated()) {
      const isSubfolder = window.location.pathname.includes('/tools/');
      const loginUrl = isSubfolder ? '../login.html' : 'login.html';
      const redirectParam = encodeURIComponent(window.location.href);
      window.location.href = `${loginUrl}?redirect=${redirectParam}`;
    }
  }

  function renderNavUser() {
    const user = getUser();
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    // Remove existing user badge if any
    const existing = document.getElementById('nav-user-badge');
    if (existing) existing.remove();

    if (!user) {
      // User is not signed in: show a "Sign In" button in navbar
      const isSubfolder = window.location.pathname.includes('/tools/');
      const loginPath = isSubfolder ? '../login.html' : 'login.html';
      const signInBtn = document.createElement('a');
      signInBtn.id = 'nav-user-badge';
      signInBtn.className = 'btn btn-primary btn-sm';
      signInBtn.href = loginPath;
      signInBtn.textContent = 'Sign In';
      navActions.appendChild(signInBtn);
      return;
    }

    // User is signed in: show avatar + name + sign out button
    const badge = document.createElement('div');
    badge.id = 'nav-user-badge';
    badge.className = 'nav-user-pill';

    const avatarHtml = user.picture
      ? `<img src="${user.picture}" alt="${user.name}" class="nav-user-avatar" referrerpolicy="no-referrer">`
      : `<div class="nav-user-avatar-initial">${user.name.charAt(0).toUpperCase()}</div>`;

    const isGuestUser = user.provider === 'guest';
    const tag = isGuestUser ? `<span class="nav-user-guest-tag">Guest</span>` : '';
    const tier = (user.tier || localStorage.getItem('mrsall_user_tier') || 'free').toLowerCase();
    const tierTag = tier === 'premium'
      ? `<span class="nav-user-tier-tag tier-premium">⭐ Pro</span>`
      : `<span class="nav-user-tier-tag tier-free">Free</span>`;

    badge.innerHTML = `
      <div class="nav-user-info" title="${user.email || user.name}">
        ${avatarHtml}
        <span class="nav-user-name">${escapeHtml(user.name)}</span>
        ${tag}
        ${tierTag}
      </div>
      <button class="nav-user-signout" id="nav-signout-btn" title="${LanguageManager.t('login_signout')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </button>
    `;

    navActions.appendChild(badge);

    badge.querySelector('#nav-signout-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      signOut();
    });
  }

  function getTier() {
    const user = getUser();
    return (user && user.tier) || localStorage.getItem('mrsall_user_tier') || 'free';
  }

  function setTier(newTier) {
    const tier = (newTier === 'premium' || newTier === 'pro') ? 'premium' : 'free';
    localStorage.setItem('mrsall_user_tier', tier);
    const user = getUser();
    if (user) {
      user.tier = tier;
      saveUser(user);
    }
    renderNavUser();
    window.dispatchEvent(new CustomEvent('mrsall:tier_updated', { detail: { tier } }));
    if (typeof Toast !== 'undefined') {
      const msg = tier === 'premium' ? 'Upgraded to Premium Plan (500 messages/day)' : 'Switched to Free Plan (50 messages/day)';
      Toast.show(msg, 'success');
    }
  }

  function init() {
    renderNavUser();
  }

  return {
    init,
    getUser,
    isAuthenticated,
    isGuest,
    getTier,
    setTier,
    loginAsGuest,
    handleCredentialResponse,
    triggerGoogleSignIn,
    signOut,
    requireAuth,
    renderNavUser,
    getClientId,
    setClientId,
    initGoogleIdentity,
  };
})();
