// Rotina de testes da API do BarberApp, passando por todas as funcionalidades.
// Feita para o Claude Code (ou qualquer pessoa) rodar antes de publicar.
//
// Uso (Git Bash / terminal do VS Code):
//   ROTINA_DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/barberapp_rotina node scripts/rotina-testes.mjs
//   ... node scripts/rotina-testes.mjs --manter-servidor   (deixa o site no ar com os dados de teste)
//
// Regras de segurança:
// - Só aceita banco em 127.0.0.1/localhost e VAZIO. Nunca use o banco da aplicação nem o Neon.
// - Não lê o arquivo .env: assim não corre o risco de pegar o DATABASE_URL de produção.

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'manter-servidor': { type: 'boolean', default: false },
    porta: { type: 'string', default: '3100' }
  }
});

// ---------- 1. Conferir o banco antes de tudo ----------

const dbUrl = process.env.ROTINA_DATABASE_URL;
if (!dbUrl) {
  console.error('Defina ROTINA_DATABASE_URL com um banco PostgreSQL local, vazio e descartável.');
  process.exit(2);
}
let dbHost;
try { dbHost = new URL(dbUrl).hostname; } catch { console.error('ROTINA_DATABASE_URL inválida.'); process.exit(2); }
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(dbHost)) {
  console.error(`Recusado: o banco precisa ser local (recebi "${dbHost}"). A rotina cria e apaga dados.`);
  process.exit(2);
}

// As variáveis precisam existir antes de importar o backend.
process.env.DATABASE_URL = dbUrl;
process.env.APP_TIMEZONE ||= 'America/Sao_Paulo';
process.env.MAX_ACTIVE_BOOKINGS = '3';
for (const name of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'CLIENT_IP_HEADER', 'TRUST_PROXY', 'CORS_ORIGIN']) delete process.env[name];

const { pool, transaction } = await import('../backend/db.js');
const { app } = await import('../backend/app.js');
const { hashPassword } = await import('../backend/security.js');
const { runMigrations } = await import('../backend/migrations/index.js');

const tables = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' LIMIT 1");
if (tables.rowCount) {
  console.error('Recusado: o banco não está vazio. Crie um banco novo para cada execução da rotina.');
  await pool.end();
  process.exit(2);
}

await transaction(runMigrations);
const ADMIN = { email: 'admin@rotina.test', password: 'admin-rotina-123' };
await pool.query(
  "INSERT INTO usuarios(nome,email,telefone,senha,tipo) VALUES('Admin Rotina',$1,'34900000000',$2,'administrador')",
  [ADMIN.email, await hashPassword(ADMIN.password)]
);

const port = Number(args.porta);
const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
const BASE = `http://127.0.0.1:${port}`;

// ---------- 2. Ferramentas da rotina ----------

const results = [];
let section = '';

function secao(nome) {
  section = nome;
  console.log(`\n## ${nome}`);
}

// Registra um teste. `ok` é true/false; `detalhe` aparece quando falha.
function check(codigo, descricao, ok, detalhe = '') {
  results.push({ codigo, secao: section, descricao, ok, detalhe: ok ? '' : detalhe });
  console.log(`${ok ? '✅' : '❌'} ${codigo} ${descricao}${ok ? '' : `  → ${detalhe}`}`);
}

// Chama a API e devolve { status, body, headers }.
async function call(route, method = 'GET', body, token, rawBody) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + '/api' + route, {
    method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  let json = null;
  try { json = await r.json(); } catch { /* sem corpo JSON */ }
  return { status: r.status, body: json, headers: r.headers };
}

// Atalho: confere status HTTP e, se informado, o código de erro.
function expectStatus(codigo, descricao, res, status, errorCode) {
  const ok = res.status === status && (!errorCode || res.body?.code === errorCode);
  check(codigo, descricao, ok, `esperado ${status}${errorCode ? ' ' + errorCode : ''}, veio ${res.status} ${res.body?.code ?? ''} ${res.body?.message ?? ''}`.trim());
  return res;
}

// Datas futuras fixas da semana: SEG é uma segunda-feira daqui a pelo menos 10 dias.
function isoDate(d) { return d.toISOString().slice(0, 10); }
const base = new Date();
base.setUTCDate(base.getUTCDate() + 10);
while (base.getUTCDay() !== 1) base.setUTCDate(base.getUTCDate() + 1);
const dia = n => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); };
const SEG = dia(0), TER = dia(1), QUA = dia(2), QUI = dia(3), SAB = dia(5);
const ONTEM = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return isoDate(d); })();

// PNG de 1x1 pixel, para testar fotos.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---------- 3. Testes ----------

try {
  secao('Público e infraestrutura');
  const health = await call('/health');
  check('PU-01', 'GET /health responde ok', health.status === 200 && health.body?.status === 'ok', JSON.stringify(health.body));
  const home = await fetch(BASE + '/index.html');
  check('PU-02', 'o site (index.html) é servido pelo mesmo servidor', home.status === 200, `status ${home.status}`);
  for (const page of ['agendamentos.html', 'auth.html', 'comentarios.html', 'admin.html', 'sobre.html']) {
    const r = await fetch(`${BASE}/${page}`);
    check('PU-03', `página ${page} carrega`, r.status === 200, `status ${r.status}`);
  }
  check('PU-04', 'cabeçalhos de segurança (CSP, X-Frame-Options, nosniff)',
    Boolean(home.headers.get('content-security-policy')) && home.headers.get('x-frame-options') === 'DENY' &&
    home.headers.get('x-content-type-options') === 'nosniff', 'algum cabeçalho faltando');
  expectStatus('PU-05', 'rota inexistente da API retorna 404', await call('/naoexiste'), 404, 'NOT_FOUND');
  expectStatus('PU-06', 'JSON malformado retorna 400', await call('/auth/login', 'POST', undefined, null, '{quebrado'), 400, 'BAD_REQUEST');
  expectStatus('PU-07', 'corpo acima de 400 kB retorna 413',
    await call('/auth/login', 'POST', { lixo: 'x'.repeat(450000) }), 413, 'PAYLOAD_TOO_LARGE');
  const options = await call('/auth/options');
  check('PU-08', 'GET /auth/options responde (Google e CAPTCHA desligados na rotina)',
    options.status === 200 && options.body.google === false && options.body.captcha === null, JSON.stringify(options.body));
  expectStatus('PU-09', 'sem login não lista agendamentos', await call('/agendamentos'), 401, 'UNAUTHORIZED');

  secao('Cadastro e login');
  const admin = (await call('/auth/login', 'POST', ADMIN)).body?.token;
  check('AU-00', 'admin consegue entrar', Boolean(admin), 'sem token');
  const regA = expectStatus('AU-01', 'cadastro do cliente A', await call('/auth/register', 'POST',
    { name: 'Ana Rotina Souza', email: 'ana@rotina.test', phone: '(34) 99111-1111', password: 'senha-ana-1', role: 'admin' }), 201);
  let tokenA = regA.body?.token;
  const userA = regA.body?.user;
  check('AU-02', 'cadastro público sempre cria cliente (ignora role: admin)', userA?.role === 'client', `role ${userA?.role}`);
  check('AU-03', 'telefone é salvo só com números', userA?.phone === '34991111111', `phone ${userA?.phone}`);
  const regB = expectStatus('AU-04', 'cadastro do cliente B', await call('/auth/register', 'POST',
    { name: 'Bruno Rotina', email: 'bruno@rotina.test', phone: '34992222222', password: 'senha-bruno-1' }), 201);
  const tokenB = regB.body?.token, userB = regB.body?.user;
  const regX = await call('/auth/register', 'POST',
    { name: 'Xavier Descartavel', email: 'xavier@rotina.test', phone: '34993333333', password: 'senha-xavier-1' });
  const userX = regX.body?.user;
  const tokenC = (await call('/auth/register', 'POST',
    { name: 'Carla Rotina', email: 'carla@rotina.test', phone: '34996666666', password: 'senha-carla-1' })).body?.token;
  expectStatus('AU-05', 'e-mail repetido (em maiúsculas) é recusado', await call('/auth/register', 'POST',
    { name: 'Outra Ana', email: 'ANA@rotina.test', phone: '34994444444', password: 'senha-outra-1' }), 409, 'EMAIL_IN_USE');
  expectStatus('AU-06', 'senha curta é recusada', await call('/auth/register', 'POST',
    { name: 'Senha Fraca', email: 'fraca@rotina.test', phone: '34995555555', password: '123' }), 400, 'WEAK_PASSWORD');
  expectStatus('AU-07', 'login com senha errada', await call('/auth/login', 'POST',
    { email: 'ana@rotina.test', password: 'errada-123' }), 401, 'INVALID_CREDENTIALS');
  expectStatus('AU-08', 'login com e-mail inexistente dá a mesma resposta', await call('/auth/login', 'POST',
    { email: 'ninguem@rotina.test', password: 'errada-123' }), 401, 'INVALID_CREDENTIALS');
  const me = await call('/auth/me', 'GET', undefined, tokenA);
  check('AU-09', 'GET /auth/me devolve o usuário logado', me.body?.user?.email === 'ana@rotina.test', JSON.stringify(me.body));

  secao('Perfil');
  const perfil = await call(`/users/${userA.id}`, 'PATCH', { name: 'Ana Rotina Souza​ ', phone: '34991111112' }, tokenA);
  check('PF-01', 'cliente edita o próprio nome e telefone (e caracteres invisíveis são removidos)',
    perfil.status === 200 && perfil.body?.name === 'Ana Rotina Souza' && perfil.body?.phone === '34991111112', JSON.stringify(perfil.body));
  expectStatus('PF-02', 'cliente envia foto PNG válida', await call(`/users/${userA.id}`, 'PATCH', { photoURL: PNG }, tokenA), 200);
  expectStatus('PF-03', 'foto falsa (texto disfarçado de PNG) é recusada',
    await call(`/users/${userA.id}`, 'PATCH', { photoURL: 'data:image/png;base64,aGVsbG8gd29ybGQ=' }, tokenA), 400);
  expectStatus('PF-04', 'cliente não edita o perfil de outra pessoa',
    await call(`/users/${userB.id}`, 'PATCH', { name: 'Invasor' }, tokenA), 403, 'FORBIDDEN');

  secao('Permissões de administrador');
  expectStatus('PE-01', 'cliente não lista usuários', await call('/users', 'GET', undefined, tokenA), 403, 'FORBIDDEN');
  expectStatus('PE-02', 'cliente não cria serviço', await call('/services', 'POST', { name: 'Hack', price: 1 }, tokenA), 403, 'FORBIDDEN');
  expectStatus('PE-03', 'cliente não cria barbeiro', await call('/barbeiros', 'POST', { name: 'Hack' }, tokenA), 403, 'FORBIDDEN');
  expectStatus('PE-04', 'sem login não cria serviço', await call('/services', 'POST', { name: 'Hack', price: 1 }), 401, 'UNAUTHORIZED');

  secao('Serviços (admin)');
  const corte = expectStatus('SV-01', 'cria Corte (R$ 40, 30 min)', await call('/services', 'POST', { name: 'Corte', price: 40, duration: 30 }, admin), 201).body;
  expectStatus('SV-02', 'cria Barba (R$ 25, 15 min)', await call('/services', 'POST', { name: 'Barba', price: 25, duration: 15 }, admin), 201);
  const sobrancelha = expectStatus('SV-03', 'cria Sobrancelha (R$ 15, 10 min)', await call('/services', 'POST', { name: 'Sobrancelha', price: 15, duration: 10 }, admin), 201).body;
  expectStatus('SV-04', 'nome repetido é recusado', await call('/services', 'POST', { name: 'Corte', price: 10 }, admin), 409, 'DUPLICATE');
  expectStatus('SV-05', 'preço negativo é recusado', await call('/services', 'POST', { name: 'Negativo', price: -1 }, admin), 400);
  expectStatus('SV-06', 'duração abaixo de 5 min é recusada', await call('/services', 'POST', { name: 'Rapidinho', price: 1, duration: 3 }, admin), 400);
  const servicos = await call('/services');
  check('SV-07', 'lista pública mostra os 3 serviços', servicos.body?.length === 3, `veio ${servicos.body?.length}`);

  secao('Barbeiros (admin)');
  const b1 = expectStatus('BB-01', 'cria Teste 1 (seg a sáb, 09–18, Corte 30 + Barba 15, com foto)', await call('/barbeiros', 'POST', {
    name: 'Teste Um', bio: 'Barbeiro da rotina', photo: PNG, horarioInicio: '09:00', horarioFim: '18:00',
    diasDisponiveis: [1, 2, 3, 4, 5, 6], services: { Corte: 30, Barba: 15 }
  }, admin), 201).body;
  const b2 = expectStatus('BB-02', 'cria Teste 2 (seg a sex, 13–17, só Corte 30)', await call('/barbeiros', 'POST', {
    name: 'Teste Dois', horarioInicio: '13:00', horarioFim: '17:00', diasDisponiveis: [1, 2, 3, 4, 5], services: { Corte: 30 }
  }, admin), 201).body;
  expectStatus('BB-03', 'horário de fim antes do início é recusado', await call('/barbeiros', 'POST', {
    name: 'Errado', horarioInicio: '18:00', horarioFim: '09:00', services: { Corte: 30 } }, admin), 400);
  expectStatus('BB-04', 'barbeiro sem serviço é recusado', await call('/barbeiros', 'POST', { name: 'Sem Servico', services: {} }, admin), 400);
  expectStatus('BB-05', 'serviço inexistente é recusado', await call('/barbeiros', 'POST', { name: 'Fantasma', services: { Pintura: 30 } }, admin), 400);
  expectStatus('BB-06', 'dia da semana inválido é recusado', await call('/barbeiros', 'POST', {
    name: 'Dia Errado', diasDisponiveis: [9], services: { Corte: 30 } }, admin), 400);
  const lista = await call('/barbeiros');
  check('BB-07', 'lista pública mostra os 2 barbeiros com serviços e durações',
    lista.body?.length === 2 && lista.body.find(b => b.id === b1.id)?.services?.Barba === 15, JSON.stringify(lista.body?.map(b => b.services)));

  secao('Agendamento');
  const reserva = (barbeiroId, servicos, data, hora, extra = {}) => ({ barbeiroId, servicos, data, hora, ...extra });
  const a1 = expectStatus('AG-01', 'cliente A agenda Corte + Barba com Teste 1 (seg 10:00, com observação)',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Corte', 'Barba'], SEG, '10:00', { observacoes: 'Na tesoura', valor: 1 }), tokenA), 201).body;
  check('AG-02', 'soma valor (R$ 65) e duração (45 min) e ignora o valor enviado pelo navegador',
    a1?.valor === 65 && a1?.duracao === 45, `valor ${a1?.valor}, duração ${a1?.duracao}`);
  check('AG-03', 'reserva nasce Pendente, com os 2 serviços na ordem', a1?.status === 'Pendente' &&
    a1?.servicos?.join(',') === 'Corte,Barba', `${a1?.status} ${a1?.servicos}`);
  check('AG-04', 'nome e e-mail vêm da conta, não do formulário', a1?.email === 'ana@rotina.test', a1?.email);
  expectStatus('AG-05', 'agendar sem observações funciona (item 003)',
    await call('/agendamentos', 'POST', reserva(b2.id, ['Corte'], TER, '13:00'), tokenB), 201);
  expectStatus('AG-06', 'data no passado é recusada', await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], ONTEM, '10:00'), tokenA), 400);
  expectStatus('AG-07', 'dia em que o barbeiro não atende (sábado para Teste 2) é recusado',
    await call('/agendamentos', 'POST', reserva(b2.id, ['Corte'], SAB, '13:00'), tokenA), 400);
  expectStatus('AG-08', 'serviço que não cabe no fim do expediente (17:30 + 45 min) é recusado',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Corte', 'Barba'], SEG, '17:30'), tokenA), 400);
  expectStatus('AG-09', 'horário fora do passo da agenda (10:10) é recusado',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], QUA, '10:10'), tokenA), 400);
  expectStatus('AG-10', 'serviço que o barbeiro não faz (Barba com Teste 2) é recusado',
    await call('/agendamentos', 'POST', reserva(b2.id, ['Barba'], TER, '14:00'), tokenA), 400);
  expectStatus('AG-11', 'serviço repetido na mesma reserva é recusado',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Corte', 'Corte'], QUA, '10:00'), tokenA), 400);
  expectStatus('AG-12', 'mais de 5 serviços é recusado',
    await call('/agendamentos', 'POST', reserva(b1.id, ['a', 'b', 'c', 'd', 'e', 'f'], QUA, '10:00'), tokenA), 400);
  expectStatus('AG-13', 'horário que se sobrepõe a outra reserva (10:30 dentro de 10:00–10:45) é recusado',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], SEG, '10:30'), tokenB), 409, 'SLOT_TAKEN');
  const b45 = expectStatus('AG-14', 'horário colado no fim da outra reserva (10:45) é aceito',
    await call('/agendamentos', 'POST', reserva(b1.id, ['Barba'], SEG, '10:45'), tokenB), 201).body;
  const corrida = await Promise.all([
    call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], QUI, '09:00'), tokenA),
    call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], QUI, '09:00'), tokenB)
  ]);
  check('AG-15', 'dois clientes no mesmo horário ao mesmo tempo: só um consegue',
    corrida.map(r => r.status).sort().join(',') === '201,409', corrida.map(r => r.status).join(','));

  secao('Visibilidade das reservas');
  const listaA = await call('/agendamentos', 'GET', undefined, tokenA);
  check('VI-01', 'cliente A vê só as próprias reservas', listaA.body?.every(r => r.email === 'ana@rotina.test'), 'apareceu reserva de outra pessoa');
  expectStatus('VI-02', 'cliente B não abre reserva de A', await call(`/agendamentos/${a1.id}`, 'GET', undefined, tokenB), 403, 'FORBIDDEN');
  const listaAdmin = await call('/agendamentos', 'GET', undefined, admin);
  check('VI-03', 'admin vê reservas de todos', new Set(listaAdmin.body?.map(r => r.email)).size >= 2, `${listaAdmin.body?.length} reservas`);
  const slots = await call('/slots');
  check('VI-04', 'ocupações públicas não expõem cliente nem ids',
    slots.body?.length > 0 && slots.body.every(s => !('appointmentId' in s) && !('email' in s) && !('nome' in s)), JSON.stringify(slots.body?.[0]));
  const slotsAdmin = await call('/slots', 'GET', undefined, admin);
  check('VI-05', 'admin recebe o id da reserva nas ocupações', slotsAdmin.body?.every(s => s.appointmentId), JSON.stringify(slotsAdmin.body?.[0]));

  secao('Fila de espera');
  expectStatus('FL-01', 'B entra na fila do horário de A (seg 10:00, Corte + Barba)',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte', 'Barba'], SEG, '10:00'), tokenB), 201);
  expectStatus('FL-02', 'entrar duas vezes na mesma fila é recusado',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte', 'Barba'], SEG, '10:00'), tokenB), 409, 'ALREADY_ON_WAITLIST');
  expectStatus('FL-03', 'fila de um horário livre é recusada (manda agendar)',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte'], SEG, '15:00'), tokenB), 409, 'SLOT_AVAILABLE');
  expectStatus('FL-04', 'admin não entra na fila',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte'], SEG, '10:00'), admin), 403, 'FORBIDDEN');
  expectStatus('FL-05', 'sem login não entra na fila', await call('/waitlist', 'POST', reserva(b1.id, ['Corte'], SEG, '10:00')), 401);
  // B tem a 10:45 (Barba) e a fila pede 10:00–10:45: o intervalo cabe sem tocar na 10:45.
  const cancelA1 = expectStatus('FL-06', 'A cancela a reserva de seg 10:00', await call(`/agendamentos/${a1.id}/cancel`, 'POST', {}, tokenA), 200);
  check('FL-07', 'reserva cancelada fica com status Cancelado', cancelA1.body?.status === 'Cancelado', cancelA1.body?.status);
  const promovida = (await call('/agendamentos', 'GET', undefined, tokenB)).body?.find(r => r.data === SEG && r.hora === '10:00');
  check('FL-08', 'B foi promovido da fila para seg 10:00 (Pendente, Corte + Barba)',
    promovida?.status === 'Pendente' && promovida?.servicos?.length === 2, JSON.stringify(promovida));

  // Intervalo insuficiente: A tem 14:00 (30 min) e o admin tem 14:30. C quer 14:00 com 45 min.
  const aCurta = (await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], QUA, '14:00'), tokenA)).body;
  const adminDepois = (await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], QUA, '14:30'), admin)).body;
  expectStatus('FL-09', 'C entra na fila de qua 14:00 pedindo 45 min',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte', 'Barba'], QUA, '14:00'), tokenC), 201);
  await call(`/agendamentos/${aCurta.id}/cancel`, 'POST', {}, tokenA);
  let bQua = (await call('/agendamentos', 'GET', undefined, tokenC)).body?.find(r => r.data === QUA && r.hora === '14:00');
  check('FL-10', 'liberar só 30 min NÃO promove quem pediu 45 min', !bQua, JSON.stringify(bQua));
  await call(`/agendamentos/${adminDepois.id}/status`, 'PATCH', { status: 'Cancelado' }, admin);
  bQua = (await call('/agendamentos', 'GET', undefined, tokenC)).body?.find(r => r.data === QUA && r.hora === '14:00');
  check('FL-11', 'liberando o intervalo inteiro, C é promovida', bQua?.status === 'Pendente', JSON.stringify(bQua));

  secao('Cancelamento pelo cliente');
  expectStatus('CA-01', 'cliente não cancela reserva de outra pessoa', await call(`/agendamentos/${b45.id}/cancel`, 'POST', {}, tokenA), 403, 'FORBIDDEN');
  expectStatus('CA-02', 'cliente não cancela reserva já cancelada', await call(`/agendamentos/${a1.id}/cancel`, 'POST', {}, tokenA), 403, 'FORBIDDEN');
  expectStatus('CA-03', 'cliente não muda status (só cancela)',
    await call(`/agendamentos/${b45.id}/status`, 'PATCH', { status: 'Concluído' }, tokenB), 403, 'FORBIDDEN');
  expectStatus('CA-04', 'cliente não edita reserva', await call(`/agendamentos/${b45.id}`, 'PATCH', reserva(b1.id, ['Corte'], SEG, '15:00'), tokenB), 403);
  expectStatus('CA-05', 'cliente não exclui reserva', await call(`/agendamentos/${b45.id}`, 'DELETE', undefined, tokenB), 403);

  secao('Limite de reservas por cliente');
  // A tem a reserva de quinta (se ganhou a corrida). Agenda até bater no limite de 3.
  const ativasA = (await call('/agendamentos', 'GET', undefined, tokenA)).body.filter(r => ['Pendente', 'Confirmado'].includes(r.status)).length;
  let limite = null;
  for (let i = 0; i < 5; i++) {
    const r = await call('/agendamentos', 'POST', reserva(b1.id, ['Corte'], SAB, `${String(9 + i).padStart(2, '0')}:00`), tokenA);
    if (r.status === 409 && r.body?.code === 'BOOKING_LIMIT') { limite = ativasA + i; break; }
  }
  check('LI-01', 'cliente para em 3 reservas ativas (BOOKING_LIMIT)', limite === 3, `parou em ${limite}`);
  expectStatus('LI-02', 'no limite, também não entra em fila',
    await call('/waitlist', 'POST', reserva(b1.id, ['Corte'], SEG, '10:45'), tokenA), 409, 'BOOKING_LIMIT');
  let adminOk = true;
  for (let i = 0; i < 4; i++) {
    const r = await call('/agendamentos', 'POST', reserva(b2.id, ['Corte'], QUI, `${13 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`), admin);
    if (r.status !== 201) adminOk = false;
  }
  check('LI-03', 'admin não tem limite (4 reservas seguidas)', adminOk, 'alguma reserva do admin falhou');

  secao('Gestão de reservas (admin)');
  let st = expectStatus('AD-01', 'Pendente → Confirmado', await call(`/agendamentos/${b45.id}/status`, 'PATCH', { status: 'Confirmado' }, admin), 200);
  check('AD-02', 'status virou Confirmado', st.body?.status === 'Confirmado', st.body?.status);
  st = expectStatus('AD-03', 'Confirmado → Concluído', await call(`/agendamentos/${b45.id}/status`, 'PATCH', { status: 'Concluído' }, admin), 200);
  expectStatus('AD-04', 'status inválido é recusado', await call(`/agendamentos/${b45.id}/status`, 'PATCH', { status: 'Pago' }, admin), 400);
  expectStatus('AD-05', 'reativar reserva cujo horário já foi ocupado é recusado (A de seg 10:00)',
    await call(`/agendamentos/${a1.id}/status`, 'PATCH', { status: 'Pendente' }, admin), 409, 'SLOT_TAKEN');
  expectStatus('AD-06', 'reserva concluída não pode ser editada',
    await call(`/agendamentos/${b45.id}`, 'PATCH', reserva(b1.id, ['Barba'], SEG, '16:00'), admin), 409);
  const editada = expectStatus('AD-07', 'admin edita reserva ativa (troca barbeiro, serviço e horário)',
    await call(`/agendamentos/${promovida.id}`, 'PATCH', reserva(b2.id, ['Corte'], TER, '15:00'), admin), 200).body;
  check('AD-08', 'edição recalcula valor e duração (R$ 40, 30 min, Teste 2)',
    editada?.valor === 40 && editada?.duracao === 30 && editada?.barbeiroId === b2.id, JSON.stringify(editada));

  // Preço histórico: mudar o preço não altera reservas antigas.
  await call(`/services/${corte.id}`, 'PATCH', { price: 50 }, admin);
  const depois = await call(`/agendamentos/${editada.id}`, 'GET', undefined, admin);
  check('AD-09', 'mudar o preço do Corte não altera reservas existentes', depois.body?.valor === 40, `valor ${depois.body?.valor}`);
  const nova = await call('/agendamentos', 'POST', reserva(b2.id, ['Corte'], QUA, '16:00'), admin);
  check('AD-10', 'reserva nova usa o preço novo (R$ 50)', nova.body?.valor === 50, `valor ${nova.body?.valor}`);
  expectStatus('AD-11', 'admin exclui reserva', await call(`/agendamentos/${nova.body.id}`, 'DELETE', undefined, admin), 200);
  expectStatus('AD-12', 'reserva excluída não existe mais', await call(`/agendamentos/${nova.body.id}`, 'GET', undefined, admin), 404, 'NOT_FOUND');

  secao('Remoções com vínculos');
  expectStatus('RM-01', 'barbeiro com reservas ativas não pode ser removido', await call(`/barbeiros/${b1.id}`, 'DELETE', undefined, admin), 409, 'IN_USE');
  const b3 = (await call('/barbeiros', 'POST', { name: 'Teste Tres', services: { Corte: 30 } }, admin)).body;
  expectStatus('RM-02', 'barbeiro sem reservas é removido', await call(`/barbeiros/${b3.id}`, 'DELETE', undefined, admin), 200);
  check('RM-03', 'barbeiro removido some da lista pública',
    !(await call('/barbeiros')).body.some(b => b.id === b3.id), 'ainda aparece');
  expectStatus('RM-04', 'serviço usado em reservas não pode ser excluído', await call(`/services/${corte.id}`, 'DELETE', undefined, admin), 409, 'IN_USE');
  expectStatus('RM-05', 'serviço sem uso é excluído', await call(`/services/${sobrancelha.id}`, 'DELETE', undefined, admin), 200);
  const usuarios = await call('/users', 'GET', undefined, admin);
  check('RM-06', 'admin lista os usuários (admin + 4 clientes)', usuarios.body?.length === 5, `veio ${usuarios.body?.length}`);
  expectStatus('RM-07', 'cliente sem vínculos é excluído', await call(`/users/${userX.id}`, 'DELETE', undefined, admin), 200);
  expectStatus('RM-08', 'cliente excluído não consegue mais entrar',
    await call('/auth/login', 'POST', { email: 'xavier@rotina.test', password: 'senha-xavier-1' }), 401);
  expectStatus('RM-09', 'cliente com reservas não pode ser excluído', await call(`/users/${userA.id}`, 'DELETE', undefined, admin), 409, 'IN_USE');

  secao('Avaliações');
  expectStatus('AV-01', 'sem login não avalia', await call('/comments', 'POST', { rating: 5, text: 'Oi' }), 401);
  const c1 = expectStatus('AV-02', 'A envia avaliação nota 5', await call('/comments', 'POST',
    { rating: 5, text: 'Atendimento excelente <script>alert(1)</script>' }, tokenA), 201).body;
  check('AV-03', 'avaliação nova fica pendente', c1?.approved === false, `approved ${c1?.approved}`);
  check('AV-04', 'pendente não aparece para o público', !(await call('/comments')).body.some(c => c.id === c1?.id), 'apareceu');
  expectStatus('AV-05', 'segunda avaliação pendente é recusada', await call('/comments', 'POST', { rating: 4, text: 'De novo' }, tokenA), 409, 'COMMENT_PENDING');
  const duplo = await Promise.all([1, 2].map(() => call('/comments', 'POST', { rating: 4, text: 'Clique duplo' }, tokenB)));
  check('AV-06', 'clique duplo registra uma avaliação só (item 004)',
    duplo.map(r => r.status).sort().join(',') === '201,409', duplo.map(r => r.status).join(','));
  expectStatus('AV-07', 'nota 0 é recusada', await call('/comments', 'POST', { rating: 0, text: 'Ruim' }, admin), 400);
  expectStatus('AV-08', 'mais de 50 palavras é recusado', await call('/comments', 'POST', { rating: 3, text: 'palavra '.repeat(51) }, admin), 400);
  const todos = await call('/comments', 'GET', undefined, admin);
  check('AV-09', 'admin vê as pendentes com o nome completo',
    todos.body?.find(c => c.id === c1.id)?.authorName === 'Ana Rotina Souza', JSON.stringify(todos.body?.[0]));
  expectStatus('AV-10', 'cliente não modera', await call(`/comments/${c1.id}`, 'PATCH', { approved: true }, tokenB), 403);
  expectStatus('AV-11', 'admin aprova', await call(`/comments/${c1.id}`, 'PATCH', { approved: true }, admin), 200);
  const publica = (await call('/comments')).body?.find(c => c.id === c1.id);
  check('AV-12', 'aprovada aparece em público com nome abreviado ("Ana S.") e sem id do autor',
    publica?.authorName === 'Ana S.' && !('userId' in publica), JSON.stringify(publica));
  check('AV-13', 'texto com HTML é guardado como texto (a tela precisa escapar; ver UI)', publica?.text?.includes('<script>'), publica?.text);
  expectStatus('AV-14', 'admin oculta a avaliação publicada', await call(`/comments/${c1.id}`, 'PATCH', { approved: false }, admin), 200);
  check('AV-15', 'oculta some do público', !(await call('/comments')).body.some(c => c.id === c1.id), 'ainda aparece');
  expectStatus('AV-16', 'cliente não exclui avaliação de outra pessoa', await call(`/comments/${c1.id}`, 'DELETE', undefined, tokenB), 404);
  expectStatus('AV-17', 'cliente exclui a própria avaliação', await call(`/comments/${c1.id}`, 'DELETE', undefined, tokenA), 200);
  const cB = (await call('/comments', 'GET', undefined, admin)).body.find(c => c.authorName === 'Bruno Rotina');
  expectStatus('AV-18', 'admin exclui qualquer avaliação (item 005)', await call(`/comments/${cB.id}`, 'DELETE', undefined, admin), 200);

  secao('Senha e sessões');
  const tokenA2 = (await call('/auth/login', 'POST', { email: 'ana@rotina.test', password: 'senha-ana-1' })).body?.token;
  expectStatus('SE-01', 'troca com a senha atual errada', await call('/auth/password', 'POST',
    { currentPassword: 'errada-123', newPassword: 'senha-nova-1' }, tokenA), 400, 'WRONG_PASSWORD');
  expectStatus('SE-02', 'nova senha igual à atual é recusada', await call('/auth/password', 'POST',
    { currentPassword: 'senha-ana-1', newPassword: 'senha-ana-1' }, tokenA), 400);
  expectStatus('SE-03', 'troca de senha correta', await call('/auth/password', 'POST',
    { currentPassword: 'senha-ana-1', newPassword: 'senha-nova-1' }, tokenA), 200);
  expectStatus('SE-04', 'o dispositivo que trocou continua logado', await call('/auth/me', 'GET', undefined, tokenA), 200);
  expectStatus('SE-05', 'os outros dispositivos são desconectados', await call('/auth/me', 'GET', undefined, tokenA2), 401);
  expectStatus('SE-06', 'senha antiga não entra mais', await call('/auth/login', 'POST', { email: 'ana@rotina.test', password: 'senha-ana-1' }), 401);
  const tokenA3 = (await call('/auth/login', 'POST', { email: 'ana@rotina.test', password: 'senha-nova-1' })).body?.token;
  check('SE-07', 'senha nova entra', Boolean(tokenA3), 'login falhou');
  expectStatus('SE-08', 'sair de todos os dispositivos', await call('/auth/logout-all', 'POST', {}, tokenA3), 200);
  const depoisTodos = await Promise.all([tokenA, tokenA3].map(t => call('/auth/me', 'GET', undefined, t)));
  check('SE-09', 'depois disso, nenhuma sessão de A funciona', depoisTodos.every(r => r.status === 401), depoisTodos.map(r => r.status).join(','));
  const tokenB2 = (await call('/auth/login', 'POST', { email: 'bruno@rotina.test', password: 'senha-bruno-1' })).body?.token;
  expectStatus('SE-10', 'sair (só este dispositivo)', await call('/auth/logout', 'POST', {}, tokenB2), 200);
  expectStatus('SE-11', 'a sessão que saiu não funciona mais', await call('/auth/me', 'GET', undefined, tokenB2), 401);
  expectStatus('SE-12', 'a outra sessão de B continua', await call('/auth/me', 'GET', undefined, tokenB), 200);
  expectStatus('SE-13', 'token inventado não autentica', await call('/auth/me', 'GET', undefined, 'f'.repeat(64)), 401);

  secao('Limite de tentativas de login (por último, porque bloqueia)');
  let bloqueou = null;
  for (let i = 1; i <= 12; i++) {
    const r = await call('/auth/login', 'POST', { email: 'alvo@rotina.test', password: 'chute-' + i });
    if (r.status === 429) { bloqueou = i; break; }
  }
  check('RL-01', 'muitas senhas erradas na mesma conta bloqueiam (429 RATE_LIMIT)', bloqueou !== null, 'não bloqueou em 12 tentativas');
} catch (error) {
  check('ERRO', 'a rotina parou por um erro inesperado', false, error.stack || String(error));
}

// ---------- 4. Resumo ----------

const falhas = results.filter(r => !r.ok);
console.log(`\n# Resultado: ${results.length - falhas.length} de ${results.length} testes passaram`);
if (falhas.length) {
  console.log('\nFalhas:');
  for (const f of falhas) console.log(`- ${f.codigo} [${f.secao}] ${f.descricao}: ${f.detalhe}`);
}

if (args['manter-servidor']) {
  console.log(`\nServidor no ar para os testes de navegador: ${BASE}`);
  console.log(`Admin: ${ADMIN.email} / ${ADMIN.password}`);
  console.log('Cliente A: ana@rotina.test / senha-nova-1   Cliente B: bruno@rotina.test / senha-bruno-1   Cliente C: carla@rotina.test / senha-carla-1');
  console.log('Barbeiros: Teste Um (seg–sáb 09–18) e Teste Dois (seg–sex 13–17). Ctrl+C encerra.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await pool.end(); process.exit(falhas.length ? 1 : 0); }));
} else {
  server.close();
  await pool.end();
  process.exitCode = falhas.length ? 1 : 0;
}
