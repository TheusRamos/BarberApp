const THEME_KEY = 'barber_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  const label = btn.querySelector('.theme-label');
  if (icon) icon.textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
  if (label) label.textContent = theme === 'light' ? 'Modo escuro' : 'Modo claro';
}

function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

(function () {
  applyTheme(getPreferredTheme());
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  });
})();
