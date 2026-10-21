import { fail,id,text } from './security.js';
const statuses={agendado:'Pendente',confirmado:'Confirmado',concluido:'Concluído',cancelado:'Cancelado'};
export const statusDB = value => Object.keys(statuses).find(k=>statuses[k]===value);
export const active = value => ['agendado','confirmado'].includes(value);
export const bookingSelect=`SELECT a.*,u.nome,u.email,b.nome AS barbeiro,h.data,h.hora,
  (SELECT array_agg(s.nome ORDER BY x.ordem) FROM agendamento_servicos x JOIN servicos s ON s.id=x.servico_id
    WHERE x.agendamento_id=a.id) AS servicos
  FROM agendamentos a JOIN usuarios u ON u.id=a.cliente_id
  JOIN cabeleireiros b ON b.id=a.cabeleireiro_id JOIN horarios h ON h.id=a.horario_id`;
export function bookingDTO(a) {
  const servicos=a.servicos || [];
  return {id:String(a.id),userId:String(a.cliente_id),nome:a.nome,email:a.email,
    servicos,servico:servicos.join(' + '),barbeiro:a.barbeiro,barbeiroId:String(a.cabeleireiro_id),
    horarioId:String(a.horario_id),data:a.data,hora:a.hora.slice(0,5),
    status:statuses[a.status],valor:Number(a.valor),duracao:a.duracao,observacoes:a.observacoes};
}
export async function getBooking(db,key,user,lock=false) {
  const a=(await db.query(`${bookingSelect} WHERE a.id=$1${lock?' FOR UPDATE OF a':''}`,[id(key)])).rows[0];
  if (!a) fail(404,'Agendamento não encontrado.','NOT_FOUND');
  if (user.tipo!=='administrador' && a.cliente_id!==user.id) fail(403,'Acesso negado.','FORBIDDEN');
  return a;
}
// Uma trava transacional compartilhada por todas as escritas da agenda impede
// corridas entre criação, edição, cancelamento e promoção da fila.
export async function lockAgenda(db) { await db.query('SELECT pg_advisory_xact_lock(712346)'); }
export async function conflict(db,h,duration,exclude=0) {
  return (await db.query(`SELECT 1 FROM agendamentos a JOIN horarios h ON h.id=a.horario_id
    WHERE a.cabeleireiro_id=$1 AND h.data=$2 AND a.status IN ('agendado','confirmado')
    AND a.id<>$5 AND h.hora < $3::time + $4 * interval '1 minute'
    AND h.hora + a.duracao * interval '1 minute' > $3::time LIMIT 1`,
    [h.cabeleireiro_id,h.data,h.hora,duration,exclude])).rowCount>0;
}
const maxServices=5;
const cents=value=>Math.round(Number(value)*100);
// Valida a solicitação com as regras atuais do profissional e devolve o plano da reserva:
// serviços na ordem escolhida, duração total (soma das durações do profissional) e preço total.
// Aceita `servicos` (lista de nomes) ou, por compatibilidade, `servico` (um nome).
export async function prepare(db,payload) {
  const barberId=id(payload.barbeiroId);
  const requested=Array.isArray(payload.servicos) ? payload.servicos : [payload.servico];
  if (!requested.length || requested.length>maxServices) fail(400,`Selecione de 1 a ${maxServices} serviços.`);
  const names=requested.map(name=>text(name,'Serviço',1,100));
  if (new Set(names).size!==names.length) fail(400,'Serviço repetido na seleção.');
  const b=(await db.query('SELECT * FROM cabeleireiros WHERE id=$1 AND ativo',[barberId])).rows[0];
  if (!b) fail(400,'Profissional indisponível.');
  const rows=(await db.query(`SELECT s.*,cs.duracao AS tempo FROM servicos s
    JOIN cabeleireiro_servicos cs ON cs.servico_id=s.id
    WHERE s.nome=ANY($1::text[]) AND cs.cabeleireiro_id=$2`,[names,barberId])).rows;
  if (rows.length!==names.length) fail(400,'Este profissional não realiza todos os serviços selecionados.');
  const services=names.map(name=>rows.find(s=>s.nome===name));
  const duracao=services.reduce((total,s)=>total+s.tempo,0);
  const valor=services.reduce((total,s)=>total+cents(s.preco),0)/100;
  const date=String(payload.data || ''), time=String(payload.hora || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400,'Data ou horário inválido.');
  const validity=(await db.query(`SELECT $1::date::text AS date,
    extract(dow FROM $1::date)::int AS day,
    $1::date+$2::time > localtimestamp AS future`,[date,time])).rows[0];
  if (!validity.future || !b.dias.includes(validity.day)) fail(400,'Escolha uma data e um horário de atendimento futuros.');
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
  const step=(await db.query('SELECT min(duracao) AS step FROM cabeleireiro_servicos WHERE cabeleireiro_id=$1',[barberId])).rows[0].step;
  if (minutes(time)<minutes(b.inicio) || minutes(time)+duracao>minutes(b.fim) || (minutes(time)-minutes(b.inicio))%step!==0)
    fail(400,'Horário fora da disponibilidade do profissional para a duração total dos serviços.');
  const h=(await db.query(`INSERT INTO horarios(data,hora,cabeleireiro_id) VALUES($1,$2,$3)
    ON CONFLICT(data,hora,cabeleireiro_id) DO UPDATE SET data=EXCLUDED.data RETURNING *`,[date,time,barberId])).rows[0];
  if (!h.disponivel) fail(409,'Horário bloqueado.','SLOT_TAKEN');
  return {h,services,duracao,valor,observacoes:text(payload.observacoes || '','Observações',0,240)};
}
const quota=Number(process.env.MAX_ACTIVE_BOOKINGS);
export const maxActiveBookings=Number.isInteger(quota) && quota>0 ? quota : 3;
// Reservas ativas futuras + pedidos futuros na fila contam juntos; a promoção da
// fila troca um pelo outro, então o total por cliente nunca ultrapassa o limite.
// O pedido da fila no mesmo horário é ignorado porque é removido ao reservar.
export async function checkQuota(db,user,horarioId) {
  if (user.tipo==='administrador') return;
  const {total}=(await db.query(`SELECT
    (SELECT count(*) FROM agendamentos a JOIN horarios h ON h.id=a.horario_id
      WHERE a.cliente_id=$1 AND a.status IN ('agendado','confirmado') AND h.data+h.hora>localtimestamp)
    +(SELECT count(*) FROM fila_espera f JOIN horarios h ON h.id=f.horario_id
      WHERE f.cliente_id=$1 AND f.horario_id<>$2 AND h.data+h.hora>localtimestamp) AS total`,[user.id,horarioId])).rows[0];
  if (Number(total)>=maxActiveBookings)
    fail(409,`Você atingiu o limite de ${maxActiveBookings} reservas ativas ou pedidos na fila. Cancele um deles para continuar.`,'BOOKING_LIMIT');
}
// Grava (ou substitui) os serviços do agendamento com duração e preço de cada um.
export async function saveBookingServices(db,bookingId,services) {
  await db.query('DELETE FROM agendamento_servicos WHERE agendamento_id=$1',[bookingId]);
  for (const [index,s] of services.entries())
    await db.query('INSERT INTO agendamento_servicos(agendamento_id,servico_id,ordem,duracao,valor) VALUES($1,$2,$3,$4,$5)',
      [bookingId,s.id,index+1,s.tempo,s.preco]);
}
export async function insertBooking(db,clientId,plan) {
  const {h,services,duracao,valor,observacoes}=plan;
  const key=(await db.query(`INSERT INTO agendamentos(cliente_id,servico_id,cabeleireiro_id,horario_id,duracao,valor,observacoes)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[clientId,services[0].id,h.cabeleireiro_id,h.id,duracao,valor,observacoes])).rows[0].id;
  await saveBookingServices(db,key,services);
  return key;
}
// Devolve o id do pedido, ou nada se o cliente já estiver na fila desse horário.
export async function insertWaitlist(db,clientId,plan) {
  const {h,services,duracao,valor,observacoes}=plan;
  const row=(await db.query(`INSERT INTO fila_espera(cliente_id,servico_id,horario_id,duracao,valor,observacoes)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(cliente_id,horario_id) DO NOTHING RETURNING id`,
    [clientId,services[0].id,h.id,duracao,valor,observacoes])).rows[0];
  if (!row) return;
  for (const [index,s] of services.entries())
    await db.query('INSERT INTO fila_espera_servicos(fila_id,servico_id,ordem) VALUES($1,$2,$3)',[row.id,s.id,index+1]);
  return row.id;
}
// Cada pedido da fila é para um horário de início com um conjunto de serviços. Ele só é
// promovido quando o intervalo inteiro (soma das durações) está livre e o pedido ainda
// atende às regras atuais do profissional (dias, expediente e serviços), revalidadas
// por prepare(); duração e preço da reserva criada são os vigentes na promoção.
// Pedidos que deixaram de atender às regras permanecem na fila.
export async function promote(db,barberId,date) {
  const queue=(await db.query(`SELECT f.*,h.cabeleireiro_id,h.data,h.hora,
      (SELECT array_agg(s.nome ORDER BY x.ordem) FROM fila_espera_servicos x JOIN servicos s ON s.id=x.servico_id
        WHERE x.fila_id=f.id) AS servicos
    FROM fila_espera f JOIN horarios h ON h.id=f.horario_id JOIN cabeleireiros b ON b.id=h.cabeleireiro_id
    WHERE h.cabeleireiro_id=$1 AND h.data=$2 AND h.disponivel AND b.ativo
    AND h.data+h.hora>localtimestamp ORDER BY f.id FOR UPDATE OF f`,[barberId,date])).rows;
  for (const entry of queue) {
    let plan;
    try {
      plan=await prepare(db,{barbeiroId:entry.cabeleireiro_id,servicos:entry.servicos||[],
        data:entry.data,hora:entry.hora.slice(0,5),observacoes:entry.observacoes});
    } catch (error) {
      if (!error.status) throw error;
      continue;
    }
    if (await conflict(db,plan.h,plan.duracao)) continue;
    await insertBooking(db,entry.cliente_id,plan);
    await db.query('DELETE FROM fila_espera WHERE id=$1',[entry.id]);
  }
}
