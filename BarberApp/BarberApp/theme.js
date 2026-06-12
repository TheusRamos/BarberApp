// Theme manager: toggles between 'dark' and 'light', persists choice in localStorage
const THEME_KEY = 'barber_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = theme === 'light' ? 'Claro' : 'Escuro';
}

function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
  return mql && mql.matches ? 'light' : 'dark';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Init
(function () {
  const theme = getPreferredTheme();
  applyTheme(theme);

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.addEventListener('click', toggleTheme);
  });
})();
