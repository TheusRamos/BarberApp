import express from 'express';
import { fileURLToPath } from 'node:url';
import { pool,transaction } from './db.js';
import { fail,text,id,email,phone,photo,hashPassword,verifyPassword,tokenHash,userDTO,session } from './security.js';
import { bookingSelect,bookingDTO,getBooking,lockAgenda,prepare,conflict,insertBooking,promote,statusDB,active } from './bookings.js';

export const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.path.startsWith('/api')) res.setHeader('Cache-Control','no-store');
  const allowed=process.env.CORS_ORIGIN;
  if(allowed && req.headers.origin===allowed) {
    res.setHeader('Access-Control-Allow-Origin',allowed);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  }
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({limit:'400kb'}));
app.use('/api',(req,res,next)=>{
  if(['POST','PATCH'].includes(req.method)) {
    req.body ??= {};
    if(typeof req.body!=='object'||Array.isArray(req.body)||req.body===null) fail(400,'Envie um objeto JSON.');
  }
  next();
});
app.use('/api',async(req,res,next)=>{
  const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(token) {
    req.tokenHash=tokenHash(token);
    req.user=(await pool.query(`SELECT u.* FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
      WHERE s.token_hash=$1 AND s.expira_em>now()`,[req.tokenHash])).rows[0];
  }
  next();
});
function auth(req,res,next) {if(!req.user) fail(401,'Faça login para continuar.','UNAUTHORIZED');next();}
function admin(req,res,next) {if(req.user?.tipo!=='administrador') fail(403,'Acesso restrito ao administrador.','FORBIDDEN');next();}
const authAttempts=new Map();
const cleanup=setInterval(()=>{for(const [key,v] of authAttempts) if(v.until<Date.now()) authAttempts.delete(key);},60000);
cleanup.unref();
function limitAuth(req,res,next) {
  const key=req.socket.remoteAddress;
  const entry=authAttempts.get(key);
  if(entry && entry.until>Date.now()) {if(++entry.count>30) fail(429,'Muitas tentativas. Aguarde 15 minutos.','RATE_LIMIT');}
  else authAttempts.set(key,{count:1,until:Date.now()+900000});
  next();
}
app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});});
app.post('/api/auth/register',limitAuth,async(req,res)=>{
  const p=req.body;
  const values=[text(p.name,'Nome',3),email(p.email),phone(p.phone),await hashPassword(p.password)];
  res.status(201).json(await transaction(async db=>{
    const u=(await db.query("INSERT INTO usuarios(nome,email,telefone,senha,tipo) VALUES($1,$2,$3,$4,'cliente') RETURNING *",values)).rows[0];
    return session(db,u);
  }));
});
app.post('/api/auth/login',limitAuth,async(req,res)=>{
  const u=(await pool.query('SELECT * FROM usuarios WHERE lower(email)=$1',[email(req.body.email)])).rows[0];
  if(!u || !await verifyPassword(req.body.password,u.senha)) fail(401,'Email ou senha incorretos.','INVALID_CREDENTIALS');
  res.json(await session(pool,u));
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:userDTO(req.user)}));
app.post('/api/auth/logout',auth,async(req,res)=>{await pool.query('DELETE FROM sessoes WHERE token_hash=$1',[req.tokenHash]);res.json({});});
app.get('/api/users',auth,admin,async(req,res)=>res.json((await pool.query('SELECT * FROM usuarios ORDER BY nome')).rows.map(userDTO)));
app.patch('/api/users/:id',auth,async(req,res)=>{
  const key=id(req.params.id);
  if(key!==req.user.id && req.user.tipo!=='administrador') fail(403,'Acesso negado.','FORBIDDEN');
  const old=(await pool.query('SELECT * FROM usuarios WHERE id=$1',[key])).rows[0];
  if(!old) fail(404,'Usuário não encontrado.','NOT_FOUND');
  const p=req.body;
  const u=(await pool.query('UPDATE usuarios SET nome=$1,telefone=$2,foto=$3 WHERE id=$4 RETURNING *',
    [p.name===undefined?old.nome:text(p.name,'Nome',3),p.phone===undefined?old.telefone:phone(p.phone),p.photoURL===undefined?old.foto:photo(p.photoURL),key])).rows[0];
  res.json(userDTO(u));
});
app.delete('/api/users/:id',auth,admin,async(req,res)=>{
  const result=await pool.query("DELETE FROM usuarios WHERE id=$1 AND tipo='cliente' RETURNING id",[id(req.params.id)]);
  if(!result.rowCount) fail(404,'Cliente não encontrado.','NOT_FOUND');res.json({});
});
const serviceDTO=s=>({id:String(s.id),name:s.nome,price:Number(s.preco),icon:s.icone,duration:s.duracao,description:s.descricao});
app.get('/api/services',async(req,res)=>res.json((await pool.query('SELECT * FROM servicos ORDER BY nome')).rows.map(serviceDTO)));
async function saveService(req,res) {
  const key=req.params.id ? id(req.params.id):null;
  const old=key?(await pool.query('SELECT * FROM servicos WHERE id=$1',[key])).rows[0]:{};
  if(!old) fail(404,'Serviço não encontrado.','NOT_FOUND');
  const p=req.body, name=text(p.name??old.nome,'Serviço',3,100);
  const price=Number(p.price??old.preco), duration=Number(p.duration??old.duracao??60);
  if(!Number.isFinite(price)||price<0||price>99999999.99||!Number.isInteger(duration)||duration<5||duration>480) fail(400,'Preço ou duração inválidos.');
  const values=[name,price,duration,text(p.icon??old.icone??'content_cut','Ícone',1,80)];
  const result=key?await pool.query('UPDATE servicos SET nome=$1,preco=$2,duracao=$3,icone=$4 WHERE id=$5 RETURNING *',[...values,key])
    :await pool.query('INSERT INTO servicos(nome,preco,duracao,icone) VALUES($1,$2,$3,$4) RETURNING *',values);
  res.status(key?200:201).json(serviceDTO(result.rows[0]));
}
app.post('/api/services',auth,admin,saveService);
app.patch('/api/services/:id',auth,admin,saveService);
app.delete('/api/services/:id',auth,admin,async(req,res)=>{await pool.query('DELETE FROM servicos WHERE id=$1',[id(req.params.id)]);res.json({});});

async function barbers(db=pool) {
  const rows=(await db.query(`SELECT b.*,COALESCE((SELECT jsonb_object_agg(s.nome,cs.duracao)
    FROM cabeleireiro_servicos cs JOIN servicos s ON s.id=cs.servico_id
    WHERE cs.cabeleireiro_id=b.id),'{}'::jsonb) AS services FROM cabeleireiros b WHERE ativo ORDER BY nome`)).rows;
  return rows.map(b=>({id:String(b.id),name:b.nome,bio:b.bio,photo:b.foto,services:b.services,
    horarioInicio:b.inicio.slice(0,5),horarioFim:b.fim.slice(0,5),diasDisponiveis:b.dias}));
}
app.get('/api/barbeiros',async(req,res)=>res.json(await barbers()));
async function saveBarber(req,res) {
  const key=req.params.id?id(req.params.id):null,p=req.body;
  const result=await transaction(async db=>{
    await lockAgenda(db);
    const old=key?(await db.query('SELECT * FROM cabeleireiros WHERE id=$1 AND ativo',[key])).rows[0]:{};
    if(!old) fail(404,'Profissional não encontrado.','NOT_FOUND');
    const name=text(p.name??old.nome,'Nome',2),bio=text(p.bio??old.bio??'','Descrição',0,300);
    const start=p.horarioInicio??old.inicio?.slice(0,5)??'09:00',end=p.horarioFim??old.fim?.slice(0,5)??'20:00';
    if(![start,end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||start>=end) fail(400,'Horário de atendimento inválido.');
    const days=p.diasDisponiveis??old.dias??[1,2,3,4,5,6];
    if(!Array.isArray(days)||!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6)) fail(400,'Dias de atendimento inválidos.');
    const values=[name,bio,p.photo===undefined?(old.foto||''):photo(p.photo),start,end,days];
    const b=(key?await db.query('UPDATE cabeleireiros SET nome=$1,bio=$2,foto=$3,inicio=$4,fim=$5,dias=$6 WHERE id=$7 RETURNING id',[...values,key])
      :await db.query('INSERT INTO cabeleireiros(nome,bio,foto,inicio,fim,dias) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',values)).rows[0];
    if(p.services!==undefined || !key) {
      if(!p.services||Array.isArray(p.services)||typeof p.services!=='object'||!Object.keys(p.services).length) fail(400,'Selecione ao menos um serviço.');
      await db.query('DELETE FROM cabeleireiro_servicos WHERE cabeleireiro_id=$1',[b.id]);
      for(const [name,duration] of Object.entries(p.services)) {
        if(!Number.isInteger(duration)||duration<5||duration>480) fail(400,'Duração deve ser de 5 a 480 minutos.');
        const s=(await db.query('SELECT id FROM servicos WHERE nome=$1',[name])).rows[0];
        if(!s) fail(400,'Serviço não encontrado.');
        await db.query('INSERT INTO cabeleireiro_servicos VALUES($1,$2,$3)',[b.id,s.id,duration]);
      }
    }
    return (await barbers(db)).find(x=>x.id===String(b.id));
  });
  res.status(key?200:201).json(result);
}
app.post('/api/barbeiros',auth,admin,saveBarber);
app.patch('/api/barbeiros/:id',auth,admin,saveBarber);
app.delete('/api/barbeiros/:id',auth,admin,async(req,res)=>{
  await transaction(async db=>{await lockAgenda(db);const key=id(req.params.id);
    if((await db.query("SELECT 1 FROM agendamentos WHERE cabeleireiro_id=$1 AND status IN ('agendado','confirmado')",[key])).rowCount) fail(409,'Cancele ou conclua os agendamentos deste profissional antes de removê-lo.','IN_USE');
    await db.query('DELETE FROM fila_espera WHERE horario_id IN (SELECT id FROM horarios WHERE cabeleireiro_id=$1)',[key]);
    await db.query('UPDATE cabeleireiros SET ativo=false WHERE id=$1',[key]);});res.json({});
});
app.get('/api/horarios',async(req,res)=>res.json((await pool.query(`SELECT h.*,b.nome AS barbeiro FROM horarios h
  JOIN cabeleireiros b ON b.id=h.cabeleireiro_id WHERE h.disponivel AND b.ativo AND h.data>=current_date`)).rows.map(h=>({id:String(h.id),data:h.data,hora:h.hora.slice(0,5),barbeiro:h.barbeiro,barbeiroId:String(h.cabeleireiro_id)}))));
app.get('/api/slots',async(req,res)=>res.json((await pool.query(`SELECT a.id,a.horario_id,a.cabeleireiro_id,a.duracao,h.data,h.hora
  FROM agendamentos a JOIN horarios h ON h.id=a.horario_id WHERE a.status IN ('agendado','confirmado') AND h.data>=current_date`)).rows.map(a=>({id:String(a.horario_id),horarioId:String(a.horario_id),appointmentId:String(a.id),barbeiroId:String(a.cabeleireiro_id),data:a.data,hora:a.hora.slice(0,5),duracao:a.duracao}))));
app.get('/api/agendamentos',auth,async(req,res)=>res.json((await pool.query(`${bookingSelect}${req.user.tipo==='administrador'?'':' WHERE a.cliente_id=$1'} ORDER BY h.data,h.hora`,req.user.tipo==='administrador'?[]:[req.user.id])).rows.map(bookingDTO)));
app.get('/api/agendamentos/:id',auth,async(req,res)=>res.json(bookingDTO(await getBooking(pool,req.params.id,req.user))));
app.post('/api/agendamentos',auth,async(req,res)=>{
  const result=await transaction(async db=>{await lockAgenda(db);const {h,s,observacoes}=await prepare(db,req.body);
    if(await conflict(db,h,s.tempo)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    const key=await insertBooking(db,req.user.id,h,s.id,s.tempo,s.preco,observacoes);
    await db.query('DELETE FROM fila_espera WHERE cliente_id=$1 AND horario_id=$2',[req.user.id,h.id]);
    return bookingDTO(await getBooking(db,key,req.user));});res.status(201).json(result);
});
app.patch('/api/agendamentos/:id',auth,admin,async(req,res)=>{
  const result=await transaction(async db=>{await lockAgenda(db);const old=await getBooking(db,req.params.id,req.user,true);
    if(!active(old.status)) fail(409,'Somente agendamentos ativos podem ser editados.');
    const {h,s,observacoes}=await prepare(db,req.body);
    if(await conflict(db,h,s.tempo,old.id)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    await db.query('UPDATE agendamentos SET servico_id=$1,cabeleireiro_id=$2,horario_id=$3,duracao=$4,valor=$5,observacoes=$6 WHERE id=$7',
      [s.id,h.cabeleireiro_id,h.id,s.tempo,s.preco,observacoes,old.id]);
    await promote(db,old.cabeleireiro_id,old.data);return bookingDTO(await getBooking(db,old.id,req.user));});res.json(result);
});
async function changeStatus(req,res) {
  const target=req.path.endsWith('/cancel')?'cancelado':statusDB(req.body.status);
  if(!target) fail(400,'Status inválido.');
  const result=await transaction(async db=>{await lockAgenda(db);const old=await getBooking(db,req.params.id,req.user,true);
    if(req.user.tipo!=='administrador' && (!active(old.status)||target!=='cancelado')) fail(403,'Este agendamento não pode ser cancelado.','FORBIDDEN');
    if(active(target) && !active(old.status)) {
      await prepare(db,bookingDTO(old));
      if(await conflict(db,old,old.duracao,old.id)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    }
    await db.query('UPDATE agendamentos SET status=$1 WHERE id=$2',[target,old.id]);
    if(active(old.status) && !active(target)) await promote(db,old.cabeleireiro_id,old.data);
    return bookingDTO(await getBooking(db,old.id,req.user));});res.json(result);
}
app.patch('/api/agendamentos/:id/status',auth,admin,changeStatus);
app.post('/api/agendamentos/:id/cancel',auth,changeStatus);
app.delete('/api/agendamentos/:id',auth,admin,async(req,res)=>{
  await transaction(async db=>{await lockAgenda(db);const a=await getBooking(db,req.params.id,req.user,true);
    await db.query('DELETE FROM agendamentos WHERE id=$1',[a.id]);await promote(db,a.cabeleireiro_id,a.data);});res.json({});
});
app.post('/api/waitlist',auth,async(req,res)=>{
  if(req.user.tipo==='administrador') fail(403,'A fila é destinada aos clientes.','FORBIDDEN');
  const result=await transaction(async db=>{await lockAgenda(db);const {h,s,observacoes}=await prepare(db,req.body);
    if(!await conflict(db,h,s.tempo)) fail(409,'Horário disponível. Faça um agendamento.','SLOT_AVAILABLE');
    const row=(await db.query(`INSERT INTO fila_espera(cliente_id,servico_id,horario_id,duracao,valor,observacoes)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(cliente_id,horario_id) DO NOTHING RETURNING id`,[req.user.id,s.id,h.id,s.tempo,s.preco,observacoes])).rows[0];
    if(!row) fail(409,'Você já está na fila.','ALREADY_ON_WAITLIST');return {id:String(row.id)};});res.status(201).json(result);
});
const commentDTO=c=>({id:String(c.id),userId:String(c.cliente_id),authorName:c.nome,rating:c.estrelas,text:c.texto,approved:c.aprovado,createdAt:c.criado_em});
app.get('/api/comments',async(req,res)=>res.json((await pool.query(`SELECT c.*,u.nome FROM comentarios c JOIN usuarios u ON u.id=c.cliente_id
  ${req.user?.tipo==='administrador'?'':'WHERE c.aprovado'} ORDER BY c.criado_em DESC`)).rows.map(commentDTO)));
app.post('/api/comments',auth,async(req,res)=>{
  const p=req.body,body=text(p.text,'Comentário',1,500);
  if(!Number.isInteger(p.rating)||p.rating<1||p.rating>5||body.split(/\s+/).length>50) fail(400,'Informe nota de 1 a 5 e até 50 palavras.');
  const c=(await pool.query('INSERT INTO comentarios(cliente_id,estrelas,texto) VALUES($1,$2,$3) RETURNING *',[req.user.id,p.rating,body])).rows[0];
  res.status(201).json(commentDTO({...c,nome:req.user.nome}));
});
app.patch('/api/comments/:id',auth,admin,async(req,res)=>{
  if(typeof req.body.approved!=='boolean') fail(400,'Aprovação inválida.');
  const c=(await pool.query('UPDATE comentarios SET aprovado=$1 WHERE id=$2 RETURNING *',[req.body.approved,id(req.params.id)])).rows[0];
  if(!c) fail(404,'Comentário não encontrado.','NOT_FOUND');res.json(commentDTO(c));
});
app.delete('/api/comments/:id',auth,async(req,res)=>{
  const result=await pool.query(`DELETE FROM comentarios WHERE id=$1 ${req.user.tipo==='administrador'?'':'AND cliente_id=$2'} RETURNING id`,req.user.tipo==='administrador'?[id(req.params.id)]:[id(req.params.id),req.user.id]);
  if(!result.rowCount) fail(404,'Comentário não encontrado.','NOT_FOUND');res.json({});
});
app.use('/api',(req,res)=>res.status(404).json({message:'Rota não encontrada.',code:'NOT_FOUND'}));
app.use(express.static(fileURLToPath(new URL('../BarberApp/BarberApp/',import.meta.url)),{dotfiles:'deny'}));
app.use((error,req,res,next)=>{
  let status=error.status||500,code=error.code||'INTERNAL_ERROR',message=error.message;
  if(code==='23505') {status=409;code=error.constraint?.includes('email')?'EMAIL_IN_USE':'DUPLICATE';message='Email, telefone ou registro já cadastrado.';}
  else if(code==='23503') {status=409;code='IN_USE';message='Este registro está vinculado a outros dados e não pode ser removido.';}
  else if(['23514','22007','22008','22P02','22003'].includes(code)) {status=400;message='Dados inválidos. Confira os campos.';code='VALIDATION_ERROR';}
  if(status>=500) {console.error('Erro na API:',error.code||error.name);message='Não foi possível acessar o banco de dados. Tente novamente.';}
  res.status(status).json({message,code});
});
