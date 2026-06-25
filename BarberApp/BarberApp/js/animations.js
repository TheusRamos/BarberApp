(function () {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    }),
    { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
  );

  function watch() {
    document.querySelectorAll('.anim-fade-up:not(.io-watched)').forEach(el => {
      el.classList.add('io-watched');
      // Double rAF ensures the initial state (opacity 0) is painted before IO
      // starts watching — otherwise IO fires in the same frame as the element
      // is added, the transition is skipped, and the element pops into view.
      requestAnimationFrame(() => requestAnimationFrame(() => io.observe(el)));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }

  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
})();
