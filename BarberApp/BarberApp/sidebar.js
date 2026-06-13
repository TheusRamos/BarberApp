(function () {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarClose');
  const overlay = document.getElementById('sidebarOverlay');

  function open() {
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  toggle?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.getAttribute('href') === page) link.classList.add('active');
  });
})();
