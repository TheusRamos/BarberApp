// Seletor de estrelas da página de avaliações (mantém o select oculto usado por app.js).
(function () {
  const picker = document.getElementById('star-picker');
  const select = document.getElementById('comment-rating');
  if (!picker || !select) return;

  const labels = picker.querySelectorAll('label');

  labels.forEach((label, i) => {
    const value = i + 1;

    label.addEventListener('mouseenter', () => {
      picker.dataset.selected = value;
    });

    label.addEventListener('mouseleave', () => {
      picker.dataset.selected = select.value;
    });

    label.addEventListener('click', () => {
      select.value = value;
      picker.dataset.selected = value;
    });
  });

  select.addEventListener('change', () => {
    picker.dataset.selected = select.value;
  });
})();
