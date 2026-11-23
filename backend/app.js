import express from 'express';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { pool,transaction } from './db.js';
import { fail,text,id,email,phone,photo,hashPassword,verifyPassword,tokenHash,userDTO,session,limiter } from './security.js';
import { bookingSelect,bookingDTO,getBooking,lockAgenda,prepare,conflict,insertBooking,insertWaitlist,saveBookingServices,promote,statusDB,active,checkQuota } from './bookings.js';
import { googleEnabled,start,finish,googleUser,issueCode,redeemCode } from './google.js';
import { turnstile,captchaEnabled,requireCaptcha } from './captcha.js';
import { emailEnabled,sendVerification,sendPasswordReset,sendWaitlistBooked,useEmailToken,mailDomainExists } from './email.js';

export const app=express();
app.disable('x-powered-by');
// Atrás de proxy reverso, informe o número de proxies (ex.: 1) para que req.ip seja o IP real do cliente.
const trustProxy=process.env.TRUST_PROXY;
if(trustProxy) app.set('trust proxy',trustProxy==='true'?true:/^\d+$/.test(trustProxy)?Number(trustProxy):trustProxy);
// Cabeçalho com o IP real gravado pelo proxy (no Render, CF-Connecting-IP, que o Cloudflare sobrescreve).
// Só defina se todo acesso passar por esse proxy: sem ele, o cliente escolhe o IP usado nos limites.
const ipHeader=process.env.CLIENT_IP_HEADER;
const clientIp=req=>(ipHeader&&req.get(ipHeader))||req.ip;
// O widget do Turnstile (script e iframe) vem de challenges.cloudflare.com; só é liberado quando ativo.
const cf=captchaEnabled()?' https://challenges.cloudflare.com':'';
const csp=["default-src 'self'",`script-src 'self'${cf}`,`frame-src 'self'${cf}`,"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com","img-src 'self' data:","connect-src 'self'","object-src 'none'",
  "base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join('; ');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',csp);
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  if(req.secure) res.setHeader('Strict-Transport-Security','max-age=15552000');
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
// Login: limite por IP contra varredura e por conta contra força bruta distribuída.
// O limite por conta vale para qualquer email informado, existente ou não. Com o Turnstile ativo,
// a conta no limite passa a exigir o CAPTCHA em vez de travar: senão, qualquer um bloquearia a vítima.
const loginByIp=limiter(30,900000),loginByAccount=limiter(10,900000),registerByIp=limiter(10,3600000);
// Troca de senha: limite por usuário para que um token roubado não sirva para testar a senha atual.
const passwordByAccount=limiter(5,900000);
// Links por e-mail: poucos envios por conta (cada um é um e-mail de verdade, inclusive para quem não pediu)
// e tentativas de usar um link (confirmação ou nova senha) por IP.
const resendByAccount=limiter(3,3600000),forgotByAccount=limiter(3,3600000),forgotByIp=limiter(10,3600000),linkByIp=limiter(30,900000);
// Com o envio de e-mails ligado, o cliente só agenda, entra na fila e avalia depois de confirmar o e-mail.
function emailConfirmed(req,res,next) {
  if(emailEnabled() && req.user.tipo==='cliente' && !req.user.email_verificado)
    fail(403,'Confirme seu e-mail para continuar: use o link que enviamos (veja também o spam) ou peça um novo no Perfil.','EMAIL_NOT_VERIFIED');
  next();
}
// Domínio que não recebe e-mail (ex.: "gmail.cm"): recusado no cadastro e na troca de e-mail.
async function requireMailDomain(address) {
  if(!await mailDomainExists(address)) fail(400,'Este domínio de e-mail não existe. Confira o que vem depois do @.','EMAIL_DOMAIN_INVALID');
}
app.get('/api/health',async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});});
app.post('/api/auth/register',async(req,res)=>{
  if(!registerByIp.hit(clientIp(req))) fail(429,'Muitos cadastros a partir desta conexão. Aguarde uma hora.','RATE_LIMIT');
  const p=req.body;
  const values=[text(p.name,'Nome',3),email(p.email),phone(p.phone),await hashPassword(p.password)];
  await requireMailDomain(values[1]);
  if(captchaEnabled()) await requireCaptcha(p.captchaToken,clientIp(req));
  const {result,user}=await transaction(async db=>{
    const u=(await db.query("INSERT INTO usuarios(nome,email,telefone,senha,tipo) VALUES($1,$2,$3,$4,'cliente') RETURNING *",values)).rows[0];
    return {result:await session(db,u),user:u};
  });
  // A conta é criada mesmo se o e-mail falhar: o cliente pede outro link no Perfil.
  if(emailEnabled()) result.emailSent=await sendVerification(pool,user).then(()=>true,error=>{
    console.error('Falha ao enviar a confirmação de e-mail:',error.message);return false;});
  res.status(201).json(result);
});
// Link do e-mail (auth.html#verificar=TOKEN): o token basta, sem login, porque o link pode abrir em outro aparelho.
app.post('/api/auth/verify-email',async(req,res)=>{
  if(!linkByIp.hit(clientIp(req))) fail(429,'Muitas tentativas. Aguarde 15 minutos.','RATE_LIMIT');
  const userId=await useEmailToken(pool,req.body.token,'verificacao');
  if(!userId) fail(400,'Este link de confirmação é inválido ou expirou. Peça um novo no Perfil.','VERIFY_INVALID');
  await pool.query('UPDATE usuarios SET email_verificado=true WHERE id=$1',[userId]);
  await pool.query("DELETE FROM tokens_email WHERE usuario_id=$1 AND tipo='verificacao'",[userId]);
  res.json({});
});
app.post('/api/auth/verify-email/resend',auth,async(req,res)=>{
  if(!emailEnabled()) fail(503,'O envio de e-mails está desligado no momento.','EMAIL_DISABLED');
  if(req.user.email_verificado) fail(409,'Seu e-mail já está confirmado.','ALREADY_VERIFIED');
  if(req.user.email_recusado_em) fail(409,'Esse endereço não recebe e-mails. Corrija o e-mail no Perfil para receber um novo link.','EMAIL_BOUNCED');
  if(!resendByAccount.hit(req.user.id)) fail(429,'Você já pediu vários links. Confira a caixa de spam ou aguarde uma hora.','RATE_LIMIT');
  try { await sendVerification(pool,req.user); }
  catch(error) {
    console.error('Falha ao reenviar a confirmação de e-mail:',error.message);
    fail(502,'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.','EMAIL_FAILED');
  }
  res.json({});
});
// Aviso do Brevo (webhook): o e-mail voltou porque o endereço não existe ou não recebe mensagens.
// O Brevo manda o segredo de BREVO_WEBHOOK_SECRET no cabeçalho X-Webhook-Token, definido ao criar o webhook.
// Só contas ainda não confirmadas são marcadas: elas passam a ver o aviso e podem corrigir o e-mail.
const bounceEvents=new Set(['hard_bounce','invalid_email','blocked']);
app.post('/api/webhooks/brevo',async(req,res)=>{
  const secret=process.env.BREVO_WEBHOOK_SECRET,sent=req.get('x-webhook-token') || '';
  if(!secret || !timingSafeEqual(Buffer.from(tokenHash(sent),'hex'),Buffer.from(tokenHash(secret),'hex'))) fail(401,'Não autorizado.','UNAUTHORIZED');
  const event=req.body;
  if(bounceEvents.has(event.event) && typeof event.email==='string')
    await pool.query('UPDATE usuarios SET email_recusado_em=now() WHERE lower(email)=$1 AND NOT email_verificado',[event.email.trim().toLowerCase()]);
  res.json({});
});
// Esqueci minha senha: a resposta é sempre a mesma e sai antes de procurar a conta e enviar o e-mail,
// para que nem a mensagem nem o tempo de resposta revelem quem tem cadastro.
app.post('/api/auth/password/forgot',async(req,res)=>{
  if(!forgotByIp.hit(clientIp(req))) fail(429,'Muitos pedidos a partir desta conexão. Aguarde uma hora.','RATE_LIMIT');
  if(!emailEnabled()) fail(503,'A recuperação de senha está indisponível no momento.','EMAIL_DISABLED');
  const address=email(req.body.email);
  res.json({});
  if(!forgotByAccount.hit(address)) return;
  try {
    const u=(await pool.query('SELECT * FROM usuarios WHERE lower(email)=$1',[address])).rows[0];
    if(u) await sendPasswordReset(pool,u);
  } catch(error) { console.error('Falha ao enviar a recuperação de senha:',error.message); }
});
// Link do e-mail (auth.html#redefinir=TOKEN): troca a senha, encerra todas as sessões, confirma o e-mail
// (quem abriu o link tem acesso à caixa) e libera o bloqueio de login da conta.
app.post('/api/auth/password/reset',async(req,res)=>{
  if(!linkByIp.hit(clientIp(req))) fail(429,'Muitas tentativas. Aguarde 15 minutos.','RATE_LIMIT');
  // A senha é validada antes de usar o link: uma senha curta não gasta o link.
  const hash=await hashPassword(req.body.newPassword);
  const u=await transaction(async db=>{
    const userId=await useEmailToken(db,req.body.token,'senha');
    if(!userId) fail(400,'Este link de redefinição é inválido ou expirou. Peça um novo em "Esqueci minha senha".','RESET_INVALID');
    await db.query("DELETE FROM tokens_email WHERE usuario_id=$1 AND tipo='senha'",[userId]);
    await db.query('DELETE FROM sessoes WHERE usuario_id=$1',[userId]);
    return (await db.query('UPDATE usuarios SET senha=$1,email_verificado=true WHERE id=$2 RETURNING *',[hash,userId])).rows[0];
  });
  loginByAccount.reset(u.email.toLowerCase());
  res.json({email:u.email});
});
app.post('/api/auth/login',async(req,res)=>{
  if(!loginByIp.hit(clientIp(req))) fail(429,'Muitas tentativas. Aguarde 15 minutos.','RATE_LIMIT');
  const address=email(req.body.email);
  if(!loginByAccount.hit(address)) {
    if(!captchaEnabled()) fail(429,'Muitas tentativas para esta conta. Aguarde 15 minutos.','RATE_LIMIT');
    await requireCaptcha(req.body.captchaToken,clientIp(req));
  }
  const u=(await pool.query('SELECT * FROM usuarios WHERE lower(email)=$1',[address])).rows[0];
  const valid=await verifyPassword(req.body.password,u?.senha);
  if(!u || !valid) fail(401,'Email ou senha incorretos.','INVALID_CREDENTIALS');
  loginByAccount.reset(address);
  res.json(await session(pool,u));
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:userDTO(req.user)}));
app.post('/api/auth/logout',auth,async(req,res)=>{await pool.query('DELETE FROM sessoes WHERE token_hash=$1',[req.tokenHash]);res.json({});});
app.post('/api/auth/logout-all',auth,async(req,res)=>{await pool.query('DELETE FROM sessoes WHERE usuario_id=$1',[req.user.id]);res.json({});});
app.post('/api/auth/password',auth,async(req,res)=>{
  if(!passwordByAccount.hit(req.user.id)) fail(429,'Muitas tentativas. Aguarde 15 minutos.','RATE_LIMIT');
  const p=req.body;
  if(!await verifyPassword(p.currentPassword,req.user.senha)) fail(400,'Senha atual incorreta.','WRONG_PASSWORD');
  if(p.newPassword===p.currentPassword) fail(400,'A nova senha deve ser diferente da atual.');
  const hash=await hashPassword(p.newPassword);
  // Mantém só a sessão atual: quem entrou com a senha antiga em outro dispositivo perde o acesso.
  await transaction(async db=>{
    await db.query('UPDATE usuarios SET senha=$1 WHERE id=$2',[hash,req.user.id]);
    await db.query('DELETE FROM sessoes WHERE usuario_id=$1 AND token_hash<>$2',[req.user.id,req.tokenHash]);
  });
  passwordByAccount.reset(req.user.id);
  res.json({});
});
// Login com Google: /api/auth/google leva ao Google, que volta para /callback; a página recebe
// um código de uso único no fragmento da URL e o troca pela sessão em /session.
app.get('/api/auth/options',(req,res)=>res.json({google:googleEnabled(),captcha:captchaEnabled()?turnstile.siteKey:null,emailVerification:emailEnabled()}));
app.get('/api/auth/google',(req,res)=>{
  if(!googleEnabled()) return res.redirect('/auth.html#google_error=GOOGLE_DISABLED');
  const {url,cookie}=start();
  res.cookie('google_oauth',cookie,{httpOnly:true,secure:req.secure,sameSite:'lax',path:'/api/auth/google',maxAge:600000});
  res.redirect(url);
});
app.get('/api/auth/google/callback',async(req,res)=>{
  const saved=req.get('cookie')?.match(/(?:^|;\s*)google_oauth=([^;]+)/)?.[1];
  res.clearCookie('google_oauth',{path:'/api/auth/google'});
  const back=hash=>res.redirect(`/auth.html#${new URLSearchParams(hash)}`);
  if(req.query.error==='access_denied') return back({google_error:'GOOGLE_CANCELLED'});
  // Sem o cookie ou com state diferente: o login não começou neste navegador.
  if(!googleEnabled() || !saved || typeof req.query.code!=='string' || req.query.state!==saved.split('.')[0])
    return back({google_error:'GOOGLE_FAILED'});
  try {
    const user=await googleUser(pool,await finish(req.query.code,saved));
    back({google_code:issueCode(user.id)});
  } catch(error) {
    if(error.code!=='GOOGLE_EMAIL_IN_USE') console.error('Falha no login com Google:',error.message);
    back({google_error:error.code==='GOOGLE_EMAIL_IN_USE'?error.code:'GOOGLE_FAILED'});
  }
});
app.post('/api/auth/google/session',async(req,res)=>{
  const userId=redeemCode(req.body.code);
  const u=userId && (await pool.query('SELECT * FROM usuarios WHERE id=$1',[userId])).rows[0];
  if(!u) fail(400,'O login com Google expirou. Tente novamente.','GOOGLE_FAILED');
  res.json(await session(pool,u));
});
app.get('/api/users',auth,admin,async(req,res)=>res.json((await pool.query('SELECT * FROM usuarios ORDER BY nome')).rows.map(userDTO)));
app.patch('/api/users/:id',auth,async(req,res)=>{
  const key=id(req.params.id);
  if(key!==req.user.id && req.user.tipo!=='administrador') fail(403,'Acesso negado.','FORBIDDEN');
  const old=(await pool.query('SELECT * FROM usuarios WHERE id=$1',[key])).rows[0];
  if(!old) fail(404,'Usuário não encontrado.','NOT_FOUND');
  const p=req.body;
  // Trocar o e-mail: só o próprio cliente, antes de confirmar (ex.: digitou errado e o e-mail voltou).
  // Cada troca envia um novo link, então conta no mesmo limite do reenvio (3 por hora).
  const newEmail=p.email===undefined?old.email:email(p.email);
  const emailChanged=newEmail!==old.email.toLowerCase();
  if(emailChanged) {
    if(key!==req.user.id || old.tipo!=='cliente' || old.email_verificado) fail(403,'O e-mail só pode ser trocado antes da confirmação.','EMAIL_LOCKED');
    await requireMailDomain(newEmail);
    if(!resendByAccount.hit(key)) fail(429,'Você já trocou o e-mail ou pediu vários links. Aguarde uma hora.','RATE_LIMIT');
  }
  // E-mail novo: some a marca de "voltou como inexistente" e o prazo de 7 dias para confirmar recomeça
  const u=(await pool.query(`UPDATE usuarios SET nome=$1,telefone=$2,foto=$3,email=$4,
    email_recusado_em=CASE WHEN $5 THEN NULL ELSE email_recusado_em END,
    email_definido_em=CASE WHEN $5 THEN now() ELSE email_definido_em END WHERE id=$6 RETURNING *`,
    [p.name===undefined?old.nome:text(p.name,'Nome',3),p.phone===undefined?old.telefone:phone(p.phone),
      p.photoURL===undefined?old.foto:photo(p.photoURL),newEmail,emailChanged,key])).rows[0];
  let emailSent;
  if(emailChanged) {
    await pool.query("DELETE FROM tokens_email WHERE usuario_id=$1 AND tipo='verificacao'",[key]);
    if(emailEnabled()) emailSent=await sendVerification(pool,u).then(()=>true,error=>{
      console.error('Falha ao enviar a confirmação do novo e-mail:',error.message);return false;});
  }
  res.json(emailSent===undefined?userDTO(u):{...userDTO(u),emailSent});
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
// Horários ocupados. Em público, só blocos: reservas encostadas ou sobrepostas do mesmo profissional
// viram um intervalo, sem ids. Assim a agenda mostra o que está livre sem revelar quantas reservas
// a barbearia tem. O administrador recebe cada reserva, com o id, para ignorá-la ao editar.
const clock=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
app.get('/api/slots',async(req,res)=>{
  const rows=(await pool.query(`SELECT a.id,a.cabeleireiro_id,a.duracao,h.data,h.hora
    FROM agendamentos a JOIN horarios h ON h.id=a.horario_id WHERE a.status IN ('agendado','confirmado') AND h.data>=current_date
    ORDER BY a.cabeleireiro_id,h.data,h.hora`)).rows;
  if(req.user?.tipo==='administrador')
    return res.json(rows.map(a=>({barbeiroId:String(a.cabeleireiro_id),data:a.data,hora:a.hora.slice(0,5),duracao:a.duracao,appointmentId:String(a.id)})));
  const blocks=[];
  for(const a of rows) {
    const start=Number(a.hora.slice(0,2))*60+Number(a.hora.slice(3,5)),end=start+a.duracao,last=blocks.at(-1);
    if(last && last.barber===a.cabeleireiro_id && last.data===a.data && start<=last.end) last.end=Math.max(last.end,end);
    else blocks.push({barber:a.cabeleireiro_id,data:a.data,start,end});
  }
  res.json(blocks.map(b=>({barbeiroId:String(b.barber),data:b.data,hora:clock(b.start),duracao:b.end-b.start})));
});
app.get('/api/agendamentos',auth,async(req,res)=>res.json((await pool.query(`${bookingSelect}${req.user.tipo==='administrador'?'':' WHERE a.cliente_id=$1'} ORDER BY h.data,h.hora`,req.user.tipo==='administrador'?[]:[req.user.id])).rows.map(bookingDTO)));
app.get('/api/agendamentos/:id',auth,async(req,res)=>res.json(bookingDTO(await getBooking(pool,req.params.id,req.user))));
// Contas criadas pelo Google começam sem telefone; a barbearia precisa dele para contatar o cliente.
function phoneRequired(req,res,next) {if(!req.user.telefone) fail(400,'Cadastre seu telefone no Perfil antes de agendar.','PHONE_REQUIRED');next();}
app.post('/api/agendamentos',auth,phoneRequired,emailConfirmed,async(req,res)=>{
  const result=await transaction(async db=>{await lockAgenda(db);const plan=await prepare(db,req.body),{h}=plan;
    await checkQuota(db,req.user,h.id);
    if(await conflict(db,h,plan.duracao)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    const key=await insertBooking(db,req.user.id,plan);
    await db.query('DELETE FROM fila_espera WHERE cliente_id=$1 AND horario_id=$2',[req.user.id,h.id]);
    return bookingDTO(await getBooking(db,key,req.user));});res.status(201).json(result);
});
// Pedidos da fila que viraram agendamento: avisa cada cliente por e-mail, depois da resposta e da transação
// gravada. Falha no envio só vai para o log: a reserva já está feita e aparece na lista do cliente.
function notifyPromoted(bookingIds) {
  if(!bookingIds.length || !emailEnabled()) return;
  (async()=>{
    for(const key of bookingIds) {
      const booking=(await pool.query(`${bookingSelect} WHERE a.id=$1`,[key])).rows[0];
      if(booking) await sendWaitlistBooked(booking);
    }
  })().catch(error=>console.error('Falha ao avisar a fila de espera por e-mail:',error.message));
}
app.patch('/api/agendamentos/:id',auth,admin,async(req,res)=>{
  let promoted=[];
  const result=await transaction(async db=>{await lockAgenda(db);const old=await getBooking(db,req.params.id,req.user,true);
    if(!active(old.status)) fail(409,'Somente agendamentos ativos podem ser editados.');
    const {h,services,duracao,valor,observacoes}=await prepare(db,req.body);
    if(await conflict(db,h,duracao,old.id)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    await db.query('UPDATE agendamentos SET servico_id=$1,cabeleireiro_id=$2,horario_id=$3,duracao=$4,valor=$5,observacoes=$6 WHERE id=$7',
      [services[0].id,h.cabeleireiro_id,h.id,duracao,valor,observacoes,old.id]);
    await saveBookingServices(db,old.id,services);
    promoted=await promote(db,old.cabeleireiro_id,old.data);return bookingDTO(await getBooking(db,old.id,req.user));});res.json(result);
  notifyPromoted(promoted);
});
async function changeStatus(req,res) {
  const target=req.path.endsWith('/cancel')?'cancelado':statusDB(req.body.status);
  if(!target) fail(400,'Status inválido.');
  let promoted=[];
  const result=await transaction(async db=>{await lockAgenda(db);const old=await getBooking(db,req.params.id,req.user,true);
    if(req.user.tipo!=='administrador') {
      if(!active(old.status)||target!=='cancelado') fail(403,'Este agendamento não pode ser cancelado.','FORBIDDEN');
      // O cliente só cancela antes do horário; depois disso, o registro fica a cargo do administrador.
      if(!(await db.query('SELECT $1::date+$2::time>localtimestamp AS future',[old.data,old.hora])).rows[0].future)
        fail(403,'Reservas que já passaram não podem ser canceladas.','FORBIDDEN');
    }
    if(active(target) && !active(old.status)) {
      await prepare(db,bookingDTO(old));
      if(await conflict(db,old,old.duracao,old.id)) fail(409,'Horário já reservado.','SLOT_TAKEN');
    }
    await db.query('UPDATE agendamentos SET status=$1 WHERE id=$2',[target,old.id]);
    if(active(old.status) && !active(target)) promoted=await promote(db,old.cabeleireiro_id,old.data);
    return bookingDTO(await getBooking(db,old.id,req.user));});res.json(result);
  notifyPromoted(promoted);
}
app.patch('/api/agendamentos/:id/status',auth,admin,changeStatus);
app.post('/api/agendamentos/:id/cancel',auth,changeStatus);
app.delete('/api/agendamentos/:id',auth,admin,async(req,res)=>{
  let promoted=[];
  await transaction(async db=>{await lockAgenda(db);const a=await getBooking(db,req.params.id,req.user,true);
    await db.query('DELETE FROM agendamentos WHERE id=$1',[a.id]);promoted=await promote(db,a.cabeleireiro_id,a.data);});res.json({});
  notifyPromoted(promoted);
});
// Pedidos do próprio cliente na fila de espera, de horários que ainda não passaram, com os serviços pedidos.
app.get('/api/waitlist',auth,async(req,res)=>{
  const rows=(await pool.query(`SELECT f.id,f.valor,f.duracao,h.data,h.hora,b.nome AS barbeiro,
      (SELECT array_agg(s.nome ORDER BY x.ordem) FROM fila_espera_servicos x JOIN servicos s ON s.id=x.servico_id
        WHERE x.fila_id=f.id) AS servicos
    FROM fila_espera f JOIN horarios h ON h.id=f.horario_id JOIN cabeleireiros b ON b.id=h.cabeleireiro_id
    WHERE f.cliente_id=$1 AND h.data+h.hora>localtimestamp ORDER BY h.data,h.hora`,[req.user.id])).rows;
  res.json(rows.map(f=>({id:String(f.id),barbeiro:f.barbeiro,data:f.data,hora:f.hora.slice(0,5),
    servicos:f.servicos || [],valor:Number(f.valor),duracao:f.duracao})));
});
// Desistir de um pedido da fila: só o dono do pedido (de outro cliente, responde como inexistente).
app.delete('/api/waitlist/:id',auth,async(req,res)=>{
  const removed=await pool.query('DELETE FROM fila_espera WHERE id=$1 AND cliente_id=$2',[id(req.params.id),req.user.id]);
  if(!removed.rowCount) fail(404,'Pedido não encontrado na fila de espera.','NOT_FOUND');
  res.json({});
});
app.post('/api/waitlist',auth,phoneRequired,emailConfirmed,async(req,res)=>{
  if(req.user.tipo==='administrador') fail(403,'A fila é destinada aos clientes.','FORBIDDEN');
  const result=await transaction(async db=>{await lockAgenda(db);const plan=await prepare(db,req.body);
    if(!await conflict(db,plan.h,plan.duracao)) fail(409,'Horário disponível. Faça um agendamento.','SLOT_AVAILABLE');
    await checkQuota(db,req.user,plan.h.id);
    const key=await insertWaitlist(db,req.user.id,plan);
    if(!key) fail(409,'Você já está na fila.','ALREADY_ON_WAITLIST');return {id:String(key)};});res.status(201).json(result);
});
const commentDTO=c=>({id:String(c.id),userId:String(c.cliente_id),authorName:c.nome,rating:c.estrelas,text:c.texto,approved:c.aprovado,createdAt:c.criado_em});
// Em público, o autor aparece com o primeiro nome e a inicial do último sobrenome.
const publicName=name=>{const parts=String(name).trim().split(/\s+/);return parts.length>1?`${parts[0]} ${parts.at(-1)[0].toUpperCase()}.`:parts[0];};
app.get('/api/comments',async(req,res)=>{
  const isAdmin=req.user?.tipo==='administrador';
  const rows=(await pool.query(`SELECT c.*,u.nome FROM comentarios c JOIN usuarios u ON u.id=c.cliente_id
    ${isAdmin?'':'WHERE c.aprovado'} ORDER BY c.criado_em DESC`)).rows;
  res.json(rows.map(c=>{const dto=commentDTO(c);if(!isAdmin) {delete dto.userId;dto.authorName=publicName(c.nome);}return dto;}));
});
app.post('/api/comments',auth,emailConfirmed,async(req,res)=>{
  const p=req.body,body=text(p.text,'Comentário',1,500);
  if(!Number.isInteger(p.rating)||p.rating<1||p.rating>5||body.split(/\s+/).length>50) fail(400,'Informe nota de 1 a 5 e até 50 palavras.');
  // Uma avaliação pendente por usuário: limita a fila de moderação e impede envio duplicado.
  const c=await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(712347,$1)',[req.user.id]);
    if((await db.query('SELECT 1 FROM comentarios WHERE cliente_id=$1 AND NOT aprovado LIMIT 1',[req.user.id])).rowCount)
      fail(409,'Você já tem uma avaliação aguardando aprovação.','COMMENT_PENDING');
    return (await db.query('INSERT INTO comentarios(cliente_id,estrelas,texto) VALUES($1,$2,$3) RETURNING *',[req.user.id,p.rating,body])).rows[0];
  });
  res.status(201).json(commentDTO({...c,nome:req.user.nome}));
});
app.patch('/api/comments/:id',auth,admin,async(req,res)=>{
  if(typeof req.body.approved!=='boolean') fail(400,'Aprovação inválida.');
  const c=(await pool.query(`UPDATE comentarios c SET aprovado=$1 FROM usuarios u
    WHERE c.id=$2 AND u.id=c.cliente_id RETURNING c.*,u.nome`,[req.body.approved,id(req.params.id)])).rows[0];
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
  // Erros do leitor de JSON do Express: não repassar a mensagem interna.
  if(error.type && status<500) {code=status===413?'PAYLOAD_TOO_LARGE':'BAD_REQUEST';message=status===413?'Conteúdo muito grande.':'Requisição inválida.';}
  else if(code==='23505') {status=409;code=error.constraint?.includes('email')?'EMAIL_IN_USE':'DUPLICATE';message='Email, telefone ou registro já cadastrado.';}
  else if(code==='23503') {status=409;code='IN_USE';message='Este registro está vinculado a outros dados e não pode ser removido.';}
  else if(['23514','22007','22008','22P02','22003'].includes(code)) {status=400;message='Dados inválidos. Confira os campos.';code='VALIDATION_ERROR';}
  // Erro inesperado (banco, bug): não repassar a mensagem interna. Os do fail() já são textos para o usuário.
  if(status>=500) {console.error('Erro na API:',error.code||error.name);if(!error.status) message='Não foi possível acessar o banco de dados. Tente novamente.';}
  res.status(status).json({message,code});
});
