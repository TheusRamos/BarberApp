// Seletor de estrelas da página de avaliações. Mantém o select escondido (#comment-rating),
// que o app.js lê ao enviar.
// Funciona como um grupo de opções (role="radiogroup"): o Tab chega à estrela escolhida, as setas
// mudam a nota (Home e End vão para 1 e 5), e o leitor de tela anuncia "4 estrelas, selecionado".
(function () {
  const picker = document.getElementById('star-picker');
  const select = document.getElementById('comment-rating');
  if (!picker || !select) return;

  const stars = [...picker.querySelectorAll('.star')];

  function choose(value, { focus = false } = {}) {
    select.value = String(value);
    picker.dataset.selected = value;
    stars.forEach((star, i) => {
      const checked = i + 1 === Number(value);
      star.setAttribute('aria-checked', String(checked));
      // Só a estrela escolhida entra na ordem do Tab
      star.tabIndex = checked ? 0 : -1;
      if (checked && focus) star.focus();
    });
  }

  stars.forEach((star, i) => {
    const value = i + 1;

    // Prévia com o mouse: acende até a estrela apontada e volta ao sair
    star.addEventListener('mouseenter', () => {
      picker.dataset.selected = value;
    });
    star.addEventListener('mouseleave', () => {
      picker.dataset.selected = select.value;
    });

    star.addEventListener('click', () => choose(value));

    star.addEventListener('keydown', event => {
      const current = Number(select.value);
      const next = {
        ArrowRight: Math.min(5, current + 1),
        ArrowUp: Math.min(5, current + 1),
        ArrowLeft: Math.max(1, current - 1),
        ArrowDown: Math.max(1, current - 1),
        Home: 1,
        End: 5,
        ' ': value,
        Enter: value
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      choose(next, { focus: true });
    });
  });

  select.addEventListener('change', () => choose(select.value));
  // Depois do envio o app.js limpa o formulário: a nota volta para 5
  select.form?.addEventListener('reset', () => setTimeout(() => choose(select.value)));

  choose(select.value);
})();
