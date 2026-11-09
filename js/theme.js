/* ============================================
   MR.SALL AI — Theme System (theme.js)
   ============================================ */

const ThemeManager = (() => {
  const STORAGE_KEY = 'mrsall_theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function get() {
    return localStorage.getItem(STORAGE_KEY) || DARK;
  }

  function set(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    // update toggle icons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === DARK ? '☀️' : '🌙';
      btn.setAttribute('aria-label', theme === DARK ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function toggle() {
    set(get() === DARK ? LIGHT : DARK);
  }

  function init() {
    set(get());
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
  }

  return { init, set, get, toggle };
})();
