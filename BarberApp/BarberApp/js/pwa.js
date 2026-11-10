// App no celular (PWA): botão "Baixe nosso aplicativo" no pé do menu lateral.
// - Android (e Chrome/Edge no computador): o clique abre a janela de instalação do navegador.
// - iPhone, e navegadores sem instalação por botão: o clique mostra o passo a passo.
// - Com o app já instalado (aberto pelo ícone da tela inicial), o botão não aparece.
(function () {
  const botao = document.getElementById('install-app-btn');
  if (!botao) return;

  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // iPad novo se identifica como Mac; o toque denuncia que é um iPad
  const ehIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const ehCelular = ehIphone || /android|mobi/i.test(navigator.userAgent);
  let pedidoDeInstalacao = null; // aviso do navegador que abre a janela de instalação

  function mostrarBotao() { if (!instalado) botao.classList.remove('hidden'); }
  function esconderBotao() { botao.classList.add('hidden'); }

  // Chrome e Edge avisam quando o site pode ser instalado. Guardamos o aviso
  // para usar no clique do botão, no lugar da faixa padrão do navegador.
  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    pedidoDeInstalacao = evento;
    mostrarBotao();
  });
  window.addEventListener('appinstalled', esconderBotao);

  // No celular o botão sempre aparece (no iPhone a instalação é pelo passo a passo)
  if (ehCelular) mostrarBotao();

  botao.addEventListener('click', async () => {
    if (pedidoDeInstalacao) {
      pedidoDeInstalacao.prompt();
      const { outcome } = await pedidoDeInstalacao.userChoice;
      pedidoDeInstalacao = null;
      if (outcome === 'accepted') esconderBotao();
      return;
    }
    abrirPassoAPasso(ehIphone);
  });

  // Painel com as instruções de instalação. Os textos são fixos (sem dados do usuário).
  function abrirPassoAPasso(iphone) {
    fecharPassoAPasso();
    const passos = iphone
      ? ['Toque em <b>Compartilhar</b> <span class="material-symbols-outlined">ios_share</span> na barra do navegador.',
         'Escolha <b>Adicionar à Tela de Início</b>.',
         'Toque em <b>Adicionar</b>.']
      : ['Abra o menu do navegador <span class="material-symbols-outlined">more_vert</span>.',
         'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.',
         'Confirme.'];

    const painel = document.createElement('div');
    painel.id = 'install-guide';
    painel.className = 'install-guide';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-labelledby', 'install-guide-title');
    painel.innerHTML = `
      <button type="button" class="install-guide-close" aria-label="Fechar">
        <span class="material-symbols-outlined">close</span>
      </button>
      <h3 id="install-guide-title">Instale o app Barber</h3>
      <ol>${passos.map(passo => `<li>${passo}</li>`).join('')}</ol>
      <p>Pronto: o ícone do Barber aparece na tela inicial do seu celular.</p>`;
    document.body.appendChild(painel);

    const fechar = painel.querySelector('.install-guide-close');
    fechar.addEventListener('click', fecharPassoAPasso);
    fechar.focus();
  }

  function fecharPassoAPasso() {
    document.getElementById('install-guide')?.remove();
  }

  document.addEventListener('keydown', evento => { if (evento.key === 'Escape') fecharPassoAPasso(); });
})();
