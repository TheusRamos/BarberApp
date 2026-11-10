// ============================================================
// SERVICE WORKER do app Barber (PWA)
// Roda em segundo plano no celular e guarda uma cópia do site.
//
// - Páginas, estilos, scripts e imagens: tenta a internet primeiro,
//   assim o app sempre pega a versão nova (atualização automática).
//   Se a internet faltar, ou demorar mais que TEMPO_LIMITE (o Render
//   "acordando"), usa a cópia guardada no aparelho.
// - A API (/api/...) nunca passa por aqui: entrar, agendar e cancelar
//   vão sempre direto ao servidor. Os agendamentos para ver sem internet
//   são guardados pelo js/app.js e apagados ao sair da conta.
// ============================================================

// Mudar o nome apaga a cópia antiga e baixa tudo de novo
const CACHE = 'barber-v1';
const TEMPO_LIMITE = 4000; // milissegundos

// Baixados já na instalação, para o app abrir sem internet mesmo
// em páginas que o cliente ainda não visitou
const ARQUIVOS = [
  'index.html',
  'agendamentos.html',
  'comentarios.html',
  'sobre.html',
  'auth.html',
  'manifest.webmanifest',
  'css/variaveis.css',
  'css/style.css',
  'css/agendamentos.css',
  'css/componentes.css',
  'js/api.js',
  'js/config.js',
  'js/app.js',
  'js/auth.js',
  'js/sobre.js',
  'js/sidebar.js',
  'js/pwa.js',
  'js/animations.js',
  'js/star-picker.js',
  'resources/logo-dourado.png',
  'resources/barbearia.jpg',
  'resources/favicon.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ARQUIVOS)));
  // Versão nova do service worker entra em ação logo, sem esperar fechar o app
  self.skipWaiting();
});

self.addEventListener('activate', evento => {
  // Apaga as cópias de versões antigas
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(nome => nome !== CACHE).map(nome => caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  // Só arquivos do próprio site. A API e as fontes do Google seguem o caminho normal.
  if (pedido.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  evento.respondWith(redePrimeiro(evento));
});

async function redePrimeiro(evento) {
  const pedido = evento.request;

  // Busca na internet e, se der certo, troca a cópia guardada pela versão nova
  const daRede = fetch(pedido);
  evento.waitUntil(
    daRede
      .then(resposta => {
        if (resposta.ok && resposta.type === 'basic' && !resposta.redirected) {
          const copia = resposta.clone();
          return caches.open(CACHE).then(cache => cache.put(pedido, copia));
        }
      })
      .catch(() => {}) // sem internet: fica a cópia antiga
  );

  try {
    return await Promise.race([daRede, esgotarTempo()]);
  } catch {
    // Sem internet ou demorou demais: usa a cópia do aparelho.
    // Para páginas, ignora o "?..." do endereço (ex.: auth.html?logout=1) e,
    // se nem assim achar (ex.: o endereço "/"), abre o Início.
    const ehPagina = pedido.mode === 'navigate';
    const guardada = await caches.match(pedido, { ignoreSearch: ehPagina }) ||
      (ehPagina ? await caches.match('index.html') : undefined);
    // Sem cópia: continua esperando a internet (ou devolve o erro dela)
    return guardada || daRede;
  }
}

function esgotarTempo() {
  return new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo esgotado')), TEMPO_LIMITE));
}
