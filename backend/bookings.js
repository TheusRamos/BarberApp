import { fail,id,text } from './security.js';
const statuses={agendado:'Pendente',confirmado:'Confirmado',concluido:'Concluído',cancelado:'Cancelado'};
export const statusDB = value => Object.keys(statuses).find(k=>statuses[k]===value);
export const active = value => ['agendado','confirmado'].includes(value);
export const bookingSelect=`SELECT a.*,u.nome,u.email,s.nome AS servico,b.nome AS barbeiro,
  h.data,h.hora FROM agendamentos a JOIN usuarios u ON u.id=a.cliente_id
  JOIN servicos s ON s.id=a.servico_id JOIN cabeleireiros b ON b.id=a.cabeleireiro_id
  JOIN horarios h ON h.id=a.horario_id`;
export function bookingDTO(a) {
  return {id:String(a.id),userId:String(a.cliente_id),nome:a.nome,email:a.email,
    servico:a.servico,barbeiro:a.barbeiro,barbeiroId:String(a.cabeleireiro_id),
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
export async function prepare(db,payload) {
  const barberId=id(payload.barbeiroId);
  const serviceName=text(payload.servico,'Serviço',1,100);
  const b=(await db.query('SELECT * FROM cabeleireiros WHERE id=$1 AND ativo',[barberId])).rows[0];
  if (!b) fail(400,'Profissional indisponível.');
  const s=(await db.query(`SELECT s.*,cs.duracao AS tempo FROM servicos s
    JOIN cabeleireiro_servicos cs ON cs.servico_id=s.id
    WHERE s.nome=$1 AND cs.cabeleireiro_id=$2`,[serviceName,barberId])).rows[0];
  if (!s) fail(400,'Este profissional não realiza o serviço selecionado.');
  const date=String(payload.data || ''), time=String(payload.hora || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400,'Data ou horário inválido.');
  const validity=(await db.query(`SELECT $1::date::text AS date,
    extract(dow FROM $1::date)::int AS day,
    $1::date+$2::time > localtimestamp AS future`,[date,time])).rows[0];
  if (!validity.future || !b.dias.includes(validity.day)) fail(400,'Escolha uma data e um horário de atendimento futuros.');
  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
  const step=(await db.query('SELECT min(duracao) AS step FROM cabeleireiro_servicos WHERE cabeleireiro_id=$1',[barberId])).rows[0].step;
  if (minutes(time)<minutes(b.inicio) || minutes(time)+s.tempo>minutes(b.fim) || (minutes(time)-minutes(b.inicio))%step!==0)
    fail(400,'Horário fora da disponibilidade do profissional.');
  const h=(await db.query(`INSERT INTO horarios(data,hora,cabeleireiro_id) VALUES($1,$2,$3)
    ON CONFLICT(data,hora,cabeleireiro_id) DO UPDATE SET data=EXCLUDED.data RETURNING *`,[date,time,barberId])).rows[0];
  if (!h.disponivel) fail(409,'Horário bloqueado.','SLOT_TAKEN');
  return {h,s,observacoes:text(payload.observacoes || '','Observações',0,240)};
}
export async function insertBooking(db,clientId,h,serviceId,duration,price,notes) {
  return (await db.query(`INSERT INTO agendamentos(cliente_id,servico_id,cabeleireiro_id,horario_id,duracao,valor,observacoes)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[clientId,serviceId,h.cabeleireiro_id,h.id,duration,price,notes])).rows[0].id;
}
export async function promote(db,barberId,date) {
  const queue=(await db.query(`SELECT f.*,h.cabeleireiro_id,h.data,h.hora FROM fila_espera f
    JOIN horarios h ON h.id=f.horario_id JOIN cabeleireiros b ON b.id=h.cabeleireiro_id
    WHERE h.cabeleireiro_id=$1 AND h.data=$2 AND h.disponivel AND b.ativo
    AND h.data+h.hora>localtimestamp ORDER BY f.id FOR UPDATE OF f`,[barberId,date])).rows;
  for (const entry of queue) {
    const h={...entry,id:entry.horario_id};
    if (await conflict(db,h,entry.duracao)) continue;
    await insertBooking(db,entry.cliente_id,h,entry.servico_id,entry.duracao,entry.valor,entry.observacoes);
    await db.query('DELETE FROM fila_espera WHERE id=$1',[entry.id]);
  }
}
