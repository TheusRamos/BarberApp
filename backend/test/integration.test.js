import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

test('API com PostgreSQL: permissões, concorrência, fila, moderação e histórico',
  {skip:!process.env.TEST_DATABASE_URL},async()=>{
  // Use exclusivamente um banco vazio e descartável. Nunca o banco da aplicação.
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  process.env.MAX_ACTIVE_BOOKINGS='2';
  process.env.CLIENT_IP_HEADER='X-Client-IP';
  process.env.GOOGLE_CLIENT_ID='cliente-teste';
  process.env.GOOGLE_CLIENT_SECRET='segredo-teste';
  process.env.PUBLIC_URL='http://127.0.0.1:3000';
  process.env.BREVO_WEBHOOK_SECRET='segredo-webhook';
  const {pool,transaction}=await import('../db.js');
  const {app}=await import('../app.js');
  const {hashPassword}=await import('../security.js');
  const {runMigrations}=await import('../migrations/index.js');
  const {google}=await import('../google.js');
  const {turnstile}=await import('../captcha.js');
  const {brevo,mailDns,purgeUnconfirmedAccounts}=await import('../email.js');
  let server,fakeGoogle,fakeTurnstile,fakeBrevo;
  // DNS falso, sem depender da internet: ".invalid" não existe; "semcorreio.test" existe, mas sem MX nem IP;
  // "nulo.test" declara que não recebe e-mail (MX nulo); "so-ip.test" não tem MX, mas tem IP (recebe).
  const dnsError=code=>Object.assign(new Error(code),{code});
  Object.assign(mailDns,{
    resolveMx:async domain=>{
      if(domain.endsWith('.invalid')) throw dnsError('ENOTFOUND');
      if(['semcorreio.test','so-ip.test'].includes(domain)) throw dnsError('ENODATA');
      if(domain==='nulo.test') return [{exchange:'',priority:0}];
      return [{exchange:`mx.${domain}`,priority:10}];
    },
    resolveAddress:async domain=>{ if(domain==='so-ip.test') return ['192.0.2.10']; throw dnsError('ENODATA'); }
  });
  try {
    const tables=await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' LIMIT 1");
    assert.equal(tables.rowCount,0,'TEST_DATABASE_URL precisa apontar para um banco vazio.');
    await transaction(runMigrations);
    await transaction(runMigrations);
    await pool.query("INSERT INTO usuarios(nome,email,telefone,senha,tipo) VALUES('Admin','admin@test.com','11911111111',$1,'administrador')",[await hashPassword('admin123')]);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    async function call(route,method='GET',body,token) {
      const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:r.status,body:await r.json()};
    }
    const admin=(await call('/auth/login','POST',{email:'admin@test.com',password:'admin123'})).body.token;
    const a=(await call('/auth/register','POST',{name:'Cliente A',email:'a@test.com',phone:'11922222222',password:'senha123',role:'admin'})).body;
    const b=(await call('/auth/register','POST',{name:'Cliente B',email:'b@test.com',phone:'11933333333',password:'senha123'})).body;
    assert.equal(a.user.role,'client');
    assert.equal((await call('/users','GET',undefined,a.token)).status,403);
    assert.equal((await call('/auth/register','POST',{name:'Outro',email:'A@test.com',phone:'11944444444',password:'senha123'})).status,409);
    // Domínio que não recebe e-mail é recusado no cadastro; sem MX, mas com IP, é aceito.
    // (Um IP próprio, para não gastar o limite de 10 cadastros por hora do IP local.)
    const registerFrom=body=>fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Client-IP':'198.18.0.1'},
      body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
    for(const address of ['x@gmail.invalid','x@semcorreio.test','x@nulo.test'])
      assert.equal((await registerFrom({name:'Domínio Ruim',email:address,phone:'11944444444',password:'senha123'})).body.code,'EMAIL_DOMAIN_INVALID',address);
    assert.equal((await registerFrom({name:'Só IP',email:'x@so-ip.test',phone:'11944444445',password:'senha123'})).status,201);
    const service=await call('/services','POST',{name:'Corte',price:45,duration:30},admin);assert.equal(service.status,201);
    const barber=(await call('/barbeiros','POST',{name:'Barbeiro',services:{Corte:30},diasDisponiveis:[0,1,2,3,4,5,6],horarioInicio:'09:00',horarioFim:'20:00'},admin)).body;
    const date=(await pool.query("SELECT (current_date+2)::text AS day")).rows[0].day;
    await call('/services','POST',{name:'Barba',price:25,duration:15},admin);
    await call('/barbeiros/'+barber.id,'PATCH',{services:{Corte:30,Barba:15}},admin);
    const payload={barbeiroId:barber.id,servico:'Corte',data:date,hora:'10:00',observacoes:'Teste',valor:0,userId:b.user.id};
    const results=await Promise.all([call('/agendamentos','POST',payload,a.token),call('/agendamentos','POST',payload,b.token)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    const winner=results[0].status===201?a:b,loser=winner===a?b:a;
    const booking=results.find(r=>r.status===201).body;
    assert.equal(booking.valor,45);assert.equal(booking.userId,winner.user.id);
    assert.equal((await call(`/agendamentos/${booking.id}`,'GET',undefined,loser.token)).status,403);
    assert.equal((await call('/agendamentos','GET',undefined,loser.token)).body.length,0);
    assert.equal((await call('/slots')).body.length,1);
    // Ocupações públicas sem ids sequenciais; o administrador recebe o id da reserva.
    assert.deepEqual(Object.keys((await call('/slots')).body[0]).sort(),['barbeiroId','data','duracao','hora']);
    assert.equal((await call('/slots','GET',undefined,admin)).body[0].appointmentId,booking.id);
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'10:15'},loser.token)).status,409);
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'08:00'},loser.token)).status,400);
    assert.equal((await call('/waitlist','POST',payload,loser.token)).status,201);
    assert.equal((await call('/waitlist','POST',payload,loser.token)).body.code,'ALREADY_ON_WAITLIST');
    assert.equal((await call(`/agendamentos/${booking.id}/status`,'PATCH',{status:'Concluído'},winner.token)).status,403);
    assert.equal((await call(`/agendamentos/${booking.id}/cancel`,'POST',{},winner.token)).status,200);
    const promoted=(await call('/agendamentos','GET',undefined,loser.token)).body[0];
    assert.equal(promoted.status,'Pendente');assert.equal(promoted.hora,'10:00');
    assert.equal((await call(`/agendamentos/${booking.id}/status`,'PATCH',{status:'Confirmado'},admin)).status,409);
    assert.equal((await call(`/agendamentos/${promoted.id}/status`,'PATCH',{status:'Concluído'},admin)).status,200);
    assert.equal((await call('/slots')).body.length,0);
    assert.equal((await call('/agendamentos','POST',payload,winner.token)).status,201);
    // Cota: reservas ativas futuras + pedidos na fila (MAX_ACTIVE_BOOKINGS=2 neste teste).
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'11:00'},winner.token)).status,201);
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'12:00'},winner.token)).body.code,'BOOKING_LIMIT');
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'13:00'},loser.token)).status,201);
    assert.equal((await call('/waitlist','POST',{...payload,hora:'13:00'},winner.token)).body.code,'BOOKING_LIMIT');
    assert.equal((await call('/agendamentos','POST',{...payload,hora:'14:00'},admin)).status,201);
    // Vários serviços: duração e preço somados; fila só promove quando o intervalo inteiro fica livre.
    const date2=(await pool.query("SELECT (current_date+3)::text AS day")).rows[0].day;
    const d=(await call('/auth/register','POST',{name:'Cliente D',email:'d@test.com',phone:'11966666666',password:'senha123'})).body;
    const combo={barbeiroId:barber.id,servicos:['Corte','Barba'],data:date2,hora:'09:00'};
    const multi=await call('/agendamentos','POST',combo,d.token);
    assert.equal(multi.status,201);assert.deepEqual(multi.body.servicos,['Corte','Barba']);
    assert.equal(multi.body.servico,'Corte + Barba');assert.equal(multi.body.duracao,45);assert.equal(multi.body.valor,70);
    assert.equal((await call('/agendamentos','POST',{...combo,servicos:['Corte','Corte']},d.token)).status,400);
    assert.equal((await call('/agendamentos','POST',{...combo,servicos:['Corte','Inexistente']},d.token)).status,400);
    assert.equal((await call('/agendamentos','POST',{...combo,hora:'19:30'},d.token)).status,400);
    const blockA=(await call('/agendamentos','POST',{barbeiroId:barber.id,servico:'Barba',data:date2,hora:'09:45'},admin)).body;
    const blockB=(await call('/agendamentos','POST',{barbeiroId:barber.id,servico:'Barba',data:date2,hora:'10:15'},admin)).body;
    assert.equal((await call('/agendamentos','POST',{...combo,hora:'09:45'},d.token)).body.code,'SLOT_TAKEN');
    // Fora do admin, reservas encostadas viram um bloco só: ninguém conta quantas reservas a barbearia tem.
    const day2=list=>list.filter(s=>s.data===date2).map(s=>[s.hora,s.duracao]);
    assert.deepEqual(day2((await call('/slots')).body),[['09:00',60],['10:15',15]]);
    assert.deepEqual(day2((await call('/slots','GET',undefined,d.token)).body),[['09:00',60],['10:15',15]]);
    assert.deepEqual(day2((await call('/slots','GET',undefined,admin)).body),[['09:00',45],['09:45',15],['10:15',15]]);
    assert.equal((await call('/waitlist','POST',{...combo,hora:'09:45'},d.token)).status,201);
    await call(`/agendamentos/${blockA.id}/cancel`,'POST',{},admin);
    assert.equal((await call('/agendamentos','GET',undefined,d.token)).body.length,1,'30 minutos livres não comportam 45');
    await call(`/agendamentos/${blockB.id}/cancel`,'POST',{},admin);
    const dBookings=(await call('/agendamentos','GET',undefined,d.token)).body;
    assert.equal(dBookings.length,2);assert.equal(dBookings[1].hora,'09:45');
    assert.deepEqual(dBookings[1].servicos,['Corte','Barba']);assert.equal(dBookings[1].duracao,45);
    const edited=await call(`/agendamentos/${multi.body.id}`,'PATCH',{...combo,servicos:['Barba']},admin);
    assert.equal(edited.status,200);assert.deepEqual(edited.body.servicos,['Barba']);assert.equal(edited.body.valor,25);
    // Reserva que já passou: o cliente não cancela mais; o administrador ainda pode.
    const pastSlot=(await pool.query("INSERT INTO horarios(data,hora,cabeleireiro_id) VALUES(current_date-1,'10:00',$1) RETURNING id",[barber.id])).rows[0].id;
    const past=(await pool.query("INSERT INTO agendamentos(cliente_id,servico_id,cabeleireiro_id,horario_id,duracao,valor) VALUES($1,$2,$3,$4,30,45) RETURNING id",
      [d.user.id,service.body.id,barber.id,pastSlot])).rows[0].id;
    assert.equal((await call(`/agendamentos/${past}/cancel`,'POST',{},d.token)).status,403);
    assert.equal((await call(`/agendamentos/${past}/cancel`,'POST',{},admin)).status,200);
    const [first,second]=await Promise.all([call('/comments','POST',{rating:5,text:'Ótimo atendimento'},a.token),
      call('/comments','POST',{rating:5,text:'Ótimo atendimento'},a.token)]);
    assert.deepEqual([first.status,second.status].sort(),[201,409]);
    const comment=(first.status===201?first:second).body;
    assert.equal((await call('/comments')).body.length,0);
    assert.equal((await call('/comments','GET',undefined,admin)).body.length,1);
    assert.equal((await call(`/comments/${comment.id}`,'PATCH',{approved:true},a.token)).status,403);
    const approved=await call(`/comments/${comment.id}`,'PATCH',{approved:true},admin);
    assert.equal(approved.status,200);assert.equal(approved.body.authorName,'Cliente A');
    const publicComments=(await call('/comments')).body;
    assert.equal(publicComments.length,1);assert.equal(publicComments[0].userId,undefined);
    assert.equal(publicComments[0].authorName,'Cliente A.');
    assert.equal((await call('/comments','POST',{rating:5,text:'palavra '.repeat(51)},a.token)).status,400);
    await call('/services/'+service.body.id,'PATCH',{price:90},admin);
    assert.equal((await call(`/agendamentos/${promoted.id}`,'GET',undefined,admin)).body.valor,45);
    await call('/auth/logout','POST',{},a.token);
    assert.equal((await call('/auth/me','GET',undefined,a.token)).status,401);
    // Segurança: senha mínima, limite por conta no login, JSON inválido e cabeçalhos.
    assert.equal((await call('/auth/register','POST',{name:'Curta',email:'c@test.com',phone:'11955555555',password:'1234567'})).body.code,'WEAK_PASSWORD');
    for(let i=0;i<10;i++) assert.equal((await call('/auth/login','POST',{email:'ninguem@test.com',password:'errada123'})).status,401);
    assert.equal((await call('/auth/login','POST',{email:'ninguem@test.com',password:'errada123'})).status,429);
    const bOther=(await call('/auth/login','POST',{email:'b@test.com',password:'senha123'})).body.token;
    assert.ok(bOther);
    // Com CLIENT_IP_HEADER, o limite de cadastro conta pelo IP do cabeçalho; sem ele, pelo da conexão.
    const register=ip=>fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Client-IP':ip},body:'{}'}).then(r=>r.status);
    for(let i=0;i<10;i++) assert.equal(await register('203.0.113.1'),400);
    assert.equal(await register('203.0.113.1'),429);
    assert.equal(await register('203.0.113.2'),400);
    // Caracteres invisíveis são removidos dos textos; a foto precisa ter o conteúdo do tipo declarado.
    const hidden=(await call('/auth/register','POST',{name:'Ana‮ Lima​',email:'ana@test.com',phone:'11988888888',password:'senha123'})).body;
    assert.equal(hidden.user.name,'Ana Lima');
    assert.equal((await call('/comments','POST',{rating:5,text:'bom​trabalho'},hidden.token)).body.text,'bomtrabalho');
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    assert.equal((await call(`/users/${hidden.user.id}`,'PATCH',{photoURL:png},hidden.token)).status,200);
    assert.equal((await call(`/users/${hidden.user.id}`,'PATCH',{photoURL:'data:image/png;base64,'+Buffer.from('<html><script>').toString('base64')},hidden.token)).status,400);
    // Troca de senha mantém só a sessão atual; "sair de todos" encerra também a atual.
    assert.equal((await call('/auth/password','POST',{currentPassword:'errada123',newPassword:'nova12345'},b.token)).body.code,'WRONG_PASSWORD');
    assert.equal((await call('/auth/password','POST',{currentPassword:'senha123',newPassword:'senha123'},b.token)).status,400);
    assert.equal((await call('/auth/password','POST',{currentPassword:'senha123',newPassword:'1234567'},b.token)).body.code,'WEAK_PASSWORD');
    assert.equal((await call('/auth/password','POST',{currentPassword:'senha123',newPassword:'nova12345'},b.token)).status,200);
    assert.equal((await call('/auth/me','GET',undefined,bOther)).status,401);
    assert.equal((await call('/auth/me','GET',undefined,b.token)).status,200);
    assert.equal((await call('/auth/login','POST',{email:'b@test.com',password:'senha123'})).status,401);
    const bNew=(await call('/auth/login','POST',{email:'b@test.com',password:'nova12345'})).body.token;
    assert.equal((await call('/auth/logout-all','POST',{},bNew)).status,200);
    assert.equal((await call('/auth/me','GET',undefined,bNew)).status,401);
    assert.equal((await call('/auth/me','GET',undefined,b.token)).status,401);
    // Login com Google contra um Google falso, que confere o segredo e o PKCE e devolve as claims do teste.
    let claims,challenge;
    fakeGoogle=await new Promise(resolve=>{const s=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const p=new URLSearchParams(body),ok=p.get('client_secret')==='segredo-teste' && p.get('code')==='codigo' &&
        createHash('sha256').update(p.get('code_verifier')||'').digest('base64url')===challenge;
      res.writeHead(ok?200:400,{'Content-Type':'application/json'});
      res.end(JSON.stringify(ok?{id_token:`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`}:{error:'invalid_grant'}));
    });}).listen(0,'127.0.0.1',()=>resolve(s));});
    google.tokenUrl=`http://127.0.0.1:${fakeGoogle.address().port}/token`;
    async function googleLogin(extra,state) {
      const begin=await fetch(base+'/auth/google',{redirect:'manual'});
      const url=new URL(begin.headers.get('location')),cookie=begin.headers.get('set-cookie');
      assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
      challenge=url.searchParams.get('code_challenge');
      claims={iss:'https://accounts.google.com',aud:'cliente-teste',exp:Math.floor(Date.now()/1000)+300,
        nonce:url.searchParams.get('nonce'),email_verified:true,...extra};
      const back=await fetch(`${base}/auth/google/callback?code=codigo&state=${state??url.searchParams.get('state')}`,
        {headers:{cookie:cookie.split(';')[0]},redirect:'manual'});
      return Object.fromEntries(new URLSearchParams(new URL(back.headers.get('location'),base).hash.slice(1)));
    }
    assert.deepEqual((await call('/auth/options')).body,{google:true,captcha:null,emailVerification:false});
    const googleFirst=await googleLogin({sub:'g-1',email:'G@test.com',name:'Cliente Google'});
    const g=await call('/auth/google/session','POST',{code:googleFirst.google_code});
    assert.equal(g.status,200);
    assert.deepEqual([g.body.user.email,g.body.user.phone,g.body.user.hasPassword],['g@test.com',null,false]);
    assert.equal((await call('/auth/google/session','POST',{code:googleFirst.google_code})).status,400);
    assert.equal((await call('/agendamentos','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    assert.equal((await call('/waitlist','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    assert.equal((await call('/users/'+g.body.user.id,'PATCH',{phone:'11977777777'},g.body.token)).status,200);
    assert.notEqual((await call('/agendamentos','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    const shortName=await googleLogin({sub:'g-4',email:'jo@test.com',name:'Jo'});
    assert.equal((await call('/auth/google/session','POST',{code:shortName.google_code})).body.user.name,'Cliente');
    const googleAgain=await googleLogin({sub:'g-1',email:'g@test.com',name:'Cliente Google'});
    assert.equal((await call('/auth/google/session','POST',{code:googleAgain.google_code})).body.user.id,g.body.user.id);
    assert.equal((await googleLogin({sub:'g-2',email:'a@test.com'})).google_error,'GOOGLE_EMAIL_IN_USE');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com',email_verified:false})).google_error,'GOOGLE_FAILED');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com',nonce:'outro'})).google_error,'GOOGLE_FAILED');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com'},'forjado')).google_error,'GOOGLE_FAILED');
    assert.equal((await call('/auth/login','POST',{email:'g@test.com',password:'qualquer123'})).status,401);
    assert.equal((await call('/auth/password','POST',{currentPassword:'qualquer123',newPassword:'nova12345'},g.body.token)).body.code,'WRONG_PASSWORD');
    // Turnstile contra um servidor falso: cadastro exige o CAPTCHA; conta no limite pede o CAPTCHA em vez de travar.
    fakeTurnstile=await new Promise(resolve=>{const s=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const p=new URLSearchParams(body);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({success:p.get('secret')==='segredo-turnstile' && p.get('response')==='ok'}));
    });}).listen(0,'127.0.0.1',()=>resolve(s));});
    Object.assign(turnstile,{siteKey:'chave-site',secret:'segredo-turnstile',verifyUrl:`http://127.0.0.1:${fakeTurnstile.address().port}/siteverify`});
    const post=(route,body,ip)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Client-IP':ip},body:JSON.stringify(body)})
      .then(async r=>({status:r.status,body:await r.json()}));
    assert.equal((await call('/auth/options')).body.captcha,'chave-site');
    const human={name:'Cliente Humano',email:'humano@test.com',phone:'11999999999',password:'senha123'};
    assert.equal((await post('/auth/register',human,'198.51.100.1')).body.code,'CAPTCHA_REQUIRED');
    assert.equal((await post('/auth/register',{...human,captchaToken:'falso'},'198.51.100.1')).body.code,'CAPTCHA_REQUIRED');
    assert.equal((await post('/auth/register',{...human,captchaToken:'ok'},'198.51.100.1')).status,201);
    for(let i=0;i<10;i++) await post('/auth/login',{email:'humano@test.com',password:'errada123'},`198.51.100.${10+i}`);
    assert.equal((await post('/auth/login',{email:'humano@test.com',password:'senha123'},'198.51.100.30')).body.code,'CAPTCHA_REQUIRED');
    assert.equal((await post('/auth/login',{email:'humano@test.com',password:'senha123',captchaToken:'ok'},'198.51.100.30')).status,200);
    Object.assign(turnstile,{siteKey:undefined,secret:undefined});
    // Confirmação de e-mail contra um Brevo falso, que confere a chave da API e guarda as mensagens.
    // E-mails que começam com "falha" são recusados, para testar o Brevo fora do ar.
    const mails=[];
    fakeBrevo=await new Promise(resolve=>{const s=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const message=JSON.parse(body||'{}');
      const ok=req.headers['api-key']==='chave-brevo' && !String(message.to?.[0]?.email).startsWith('falha');
      if(ok) mails.push(message);
      res.writeHead(ok?201:400,{'Content-Type':'application/json'});
      res.end(JSON.stringify(ok?{messageId:'<1@teste>'}:{code:'invalid_parameter',message:'recusado'}));
    });}).listen(0,'127.0.0.1',()=>resolve(s));});
    Object.assign(brevo,{apiKey:'chave-brevo',from:'barbearia@test.com',url:`http://127.0.0.1:${fakeBrevo.address().port}/v3/smtp/email`});
    const linkToken=message=>/#verificar=([a-f0-9]{64})/.exec(message.htmlContent)[1];
    assert.equal((await call('/auth/options')).body.emailVerification,true);
    const newbie=await post('/auth/register',{name:'Cliente Novo',email:'novo@test.com',phone:'11910101010',password:'senha123'},'192.0.2.1');
    assert.equal(newbie.status,201);assert.equal(newbie.body.emailSent,true);assert.equal(newbie.body.user.emailVerified,false);
    assert.equal(mails.length,1);
    assert.deepEqual([mails[0].to[0].email,mails[0].sender.email],['novo@test.com','barbearia@test.com']);
    assert.match(mails[0].textContent,/http:\/\/127\.0\.0\.1:3000\/auth\.html#verificar=[a-f0-9]{64}/);
    // Sem confirmar, o cliente não agenda, não entra na fila e não avalia. Google e administrador não confirmam.
    assert.equal((await call('/agendamentos','POST',{},newbie.body.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await call('/waitlist','POST',{},newbie.body.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await call('/comments','POST',{rating:5,text:'Bom'},newbie.body.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await call('/auth/me','GET',undefined,g.body.token)).body.user.emailVerified,true);
    assert.notEqual((await call('/agendamentos','POST',{},g.body.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.notEqual((await call('/agendamentos','POST',{},admin)).body.code,'EMAIL_NOT_VERIFIED');
    // Os links valem até a confirmação; depois, nenhum serve mais (uso único)
    assert.equal((await call('/auth/verify-email/resend','POST',{},newbie.body.token)).status,200);
    assert.equal(mails.length,2);
    assert.equal((await call('/auth/verify-email','POST',{token:'0'.repeat(64)})).body.code,'VERIFY_INVALID');
    assert.equal((await call('/auth/verify-email','POST',{token:linkToken(mails[0])})).status,200);
    assert.equal((await call('/auth/verify-email','POST',{token:linkToken(mails[1])})).body.code,'VERIFY_INVALID');
    assert.equal((await call('/auth/me','GET',undefined,newbie.body.token)).body.user.emailVerified,true);
    assert.notEqual((await call('/agendamentos','POST',{},newbie.body.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await call('/auth/verify-email/resend','POST',{},newbie.body.token)).body.code,'ALREADY_VERIFIED');
    // Conta criada com o envio desligado fica bloqueada até confirmar; link vencido não serve; 3 reenvios por hora
    assert.equal((await call('/comments','POST',{rating:4,text:'Bom'},hidden.token)).body.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await call('/auth/verify-email/resend','POST',{},hidden.token)).status,200);
    await pool.query("UPDATE tokens_email SET expira_em=now()-interval '1 minute' WHERE token_hash=$1",
      [createHash('sha256').update(linkToken(mails.at(-1))).digest('hex')]);
    assert.equal((await call('/auth/verify-email','POST',{token:linkToken(mails.at(-1))})).body.code,'VERIFY_INVALID');
    assert.equal((await call('/auth/verify-email/resend','POST',{},hidden.token)).status,200);
    assert.equal((await call('/auth/verify-email/resend','POST',{},hidden.token)).status,200);
    assert.equal((await call('/auth/verify-email/resend','POST',{},hidden.token)).body.code,'RATE_LIMIT');
    // Brevo fora do ar: a conta é criada mesmo assim, e o reenvio avisa a falha
    const failed=await post('/auth/register',{name:'Cliente Falha',email:'falha@test.com',phone:'11920202020',password:'senha123'},'192.0.2.2');
    assert.equal(failed.status,201);assert.equal(failed.body.emailSent,false);
    const resendFailed=(await call('/auth/verify-email/resend','POST',{},failed.body.token)).body;
    assert.equal(resendFailed.code,'EMAIL_FAILED');assert.match(resendFailed.message,/enviar o e-mail/);
    // E-mail que voltou como inexistente (webhook do Brevo): só com o segredo; marca só contas não confirmadas
    const typo=await post('/auth/register',{name:'Cliente Digitou Errado',email:'errado@test.com',phone:'11930303030',password:'senha123'},'192.0.2.3');
    assert.equal(typo.status,201);
    const typoMail=mails.at(-1);
    const webhook=(body,secret='segredo-webhook')=>fetch(base+'/webhooks/brevo',{method:'POST',
      headers:{'Content-Type':'application/json','X-Webhook-Token':secret},body:JSON.stringify(body)}).then(r=>r.status);
    assert.equal(await webhook({event:'hard_bounce',email:'errado@test.com'},'chute'),401);
    assert.equal(await webhook({event:'delivered',email:'errado@test.com'}),200);
    assert.equal((await call('/auth/me','GET',undefined,typo.body.token)).body.user.emailBounced,false,'evento de entrega não marca');
    assert.equal(await webhook({event:'hard_bounce',email:'ERRADO@test.com',reason:'mailbox does not exist'}),200);
    assert.equal((await call('/auth/me','GET',undefined,typo.body.token)).body.user.emailBounced,true);
    assert.equal(await webhook({event:'invalid_email',email:'novo@test.com'}),200);
    assert.equal((await call('/auth/me','GET',undefined,newbie.body.token)).body.user.emailBounced,false,'conta confirmada não é marcada');
    assert.equal((await call('/auth/verify-email/resend','POST',{},typo.body.token)).body.code,'EMAIL_BOUNCED');
    // Corrigir o e-mail: só antes de confirmar, com domínio que recebe e sem repetir e-mail de outra conta
    const fix=body=>call(`/users/${typo.body.user.id}`,'PATCH',body,typo.body.token);
    assert.equal((await fix({email:'certo@gmail.invalid'})).body.code,'EMAIL_DOMAIN_INVALID');
    assert.equal((await fix({email:'b@test.com'})).body.code,'EMAIL_IN_USE');
    assert.equal((await call(`/users/${typo.body.user.id}`,'PATCH',{email:'outro@test.com'},admin)).body.code,'EMAIL_LOCKED');
    const fixed=await fix({email:'certo@test.com'});
    assert.equal(fixed.status,200);
    assert.deepEqual([fixed.body.email,fixed.body.emailBounced,fixed.body.emailVerified,fixed.body.emailSent],['certo@test.com',false,false,true]);
    assert.equal(mails.at(-1).to[0].email,'certo@test.com');
    assert.equal((await call('/auth/verify-email','POST',{token:linkToken(typoMail)})).body.code,'VERIFY_INVALID','o link do e-mail antigo deixa de valer');
    assert.equal((await call('/auth/verify-email','POST',{token:linkToken(mails.at(-1))})).status,200);
    assert.equal((await fix({email:'mais-um@test.com'})).body.code,'EMAIL_LOCKED','depois de confirmar, o e-mail não muda');
    // Limpeza de contas sem confirmação: e-mail que voltou há mais de 24 h ou 7 dias sem confirmar.
    // Ficam: e-mail que voltou há pouco, quem corrigiu o e-mail (prazo recomeça), conta com agendamento e conta confirmada.
    const pending=async(name,address,phone,ip)=>{
      const body=(await post('/auth/register',{name,email:address,phone,password:'senha123'},ip)).body;
      return {id:Number(body.user.id),token:body.token};
    };
    const oldBounce=await pending('Voltou Antes','voltou.antes@test.com','11940000001','192.0.2.21');
    const newBounce=await pending('Voltou Agora','voltou.agora@test.com','11940000002','192.0.2.22');
    const oldPending=await pending('Pendente Antiga','pendente.antiga@test.com','11940000003','192.0.2.23');
    const corrected=await pending('Corrigiu Hoje','corrigiu.antes@test.com','11940000004','192.0.2.24');
    const withBooking=await pending('Tem Reserva','tem.reserva@test.com','11940000005','192.0.2.25');
    await pool.query("UPDATE usuarios SET email_recusado_em=now()-interval '25 hours' WHERE id=$1",[oldBounce.id]);
    await pool.query("UPDATE usuarios SET email_recusado_em=now()-interval '1 hour' WHERE id=$1",[newBounce.id]);
    await pool.query("UPDATE usuarios SET email_definido_em=now()-interval '8 days' WHERE id=ANY($1::int[]) OR lower(email)='novo@test.com'",
      [[oldPending.id,corrected.id,withBooking.id]]);
    assert.equal((await call(`/users/${corrected.id}`,'PATCH',{email:'corrigiu.hoje@test.com'},corrected.token)).status,200);
    const oldSlot=(await pool.query("INSERT INTO horarios(data,hora,cabeleireiro_id) VALUES(current_date-2,'11:00',$1) RETURNING id",[barber.id])).rows[0].id;
    await pool.query('INSERT INTO agendamentos(cliente_id,servico_id,cabeleireiro_id,horario_id,duracao,valor) VALUES($1,$2,$3,$4,30,45)',
      [withBooking.id,service.body.id,barber.id,oldSlot]);
    assert.equal(await purgeUnconfirmedAccounts(pool),2);
    const kept=(await pool.query('SELECT id FROM usuarios WHERE id=ANY($1::int[]) ORDER BY id',
      [[oldBounce.id,newBounce.id,oldPending.id,corrected.id,withBooking.id]])).rows.map(r=>r.id);
    assert.deepEqual(kept,[newBounce.id,corrected.id,withBooking.id],'só somem o e-mail que voltou há 25 h e a pendente de 8 dias');
    assert.equal((await call('/auth/me','GET',undefined,oldBounce.token)).status,401,'sessões da conta apagada caem junto');
    assert.equal((await pool.query("SELECT 1 FROM usuarios WHERE lower(email)='novo@test.com'")).rowCount,1,'conta confirmada nunca é apagada');
    // Recuperação de senha: a resposta é igual exista ou não a conta, e o e-mail sai depois da resposta.
    const waitMails=async count=>{for(let i=0;i<100 && mails.length<count;i++) await new Promise(r=>setTimeout(r,20));};
    const resetToken=message=>/#redefinir=([a-f0-9]{64})/.exec(message.htmlContent)?.[1];
    const forgot=(address,ip='192.0.2.50')=>post('/auth/password/forgot',{email:address},ip);
    const sentBefore=mails.length;
    assert.deepEqual(await forgot('ninguem@test.com'),{status:200,body:{}});
    assert.deepEqual(await forgot('NOVO@test.com'),{status:200,body:{}});
    await waitMails(sentBefore+1);
    assert.equal(mails.length,sentBefore+1,'só a conta existente recebe e-mail');
    const resetMail=mails.at(-1);
    assert.deepEqual([resetMail.to[0].email,resetMail.subject],['novo@test.com','Redefina sua senha na Barber']);
    // Conta só do Google: o e-mail explica que ela entra pelo Google, sem link de redefinição
    await forgot('g@test.com');await waitMails(sentBefore+2);
    assert.equal(mails.at(-1).subject,'Sua conta na Barber usa o Google');assert.equal(resetToken(mails.at(-1)),undefined);
    // Conta travada por 10 senhas erradas: a redefinição libera o login
    for(let i=0;i<10;i++) await post('/auth/login',{email:'novo@test.com',password:'errada123'},`192.0.2.${60+i}`);
    assert.equal((await post('/auth/login',{email:'novo@test.com',password:'senha123'},'192.0.2.70')).body.code,'RATE_LIMIT');
    // Senha curta não gasta o link; depois de usado, o link não serve mais; as sessões antigas caem
    const token=resetToken(resetMail);
    assert.equal((await call('/auth/password/reset','POST',{token,newPassword:'curta'})).body.code,'WEAK_PASSWORD');
    assert.deepEqual(await call('/auth/password/reset','POST',{token,newPassword:'novasenha123'}),{status:200,body:{email:'novo@test.com'}});
    assert.equal((await call('/auth/password/reset','POST',{token,newPassword:'outra12345'})).body.code,'RESET_INVALID');
    assert.equal((await call('/auth/password/reset','POST',{token:'x',newPassword:'outra12345'})).body.code,'RESET_INVALID');
    assert.equal((await call('/auth/me','GET',undefined,newbie.body.token)).status,401,'a redefinição encerra as sessões');
    assert.equal((await post('/auth/login',{email:'novo@test.com',password:'senha123'},'192.0.2.71')).status,401);
    assert.equal((await post('/auth/login',{email:'novo@test.com',password:'novasenha123'},'192.0.2.72')).status,200);
    // Link vencido não serve; a redefinição confirma o e-mail de quem ainda não tinha confirmado (Ana)
    await forgot('ana@test.com');await waitMails(sentBefore+3);
    const expired=resetToken(mails.at(-1));
    await pool.query("UPDATE tokens_email SET expira_em=now()-interval '1 minute' WHERE token_hash=$1",[createHash('sha256').update(expired).digest('hex')]);
    assert.equal((await call('/auth/password/reset','POST',{token:expired,newPassword:'novasenha123'})).body.code,'RESET_INVALID');
    await forgot('ana@test.com');await waitMails(sentBefore+4);
    assert.equal((await call('/auth/password/reset','POST',{token:resetToken(mails.at(-1)),newPassword:'novasenha123'})).status,200);
    assert.equal((await post('/auth/login',{email:'ana@test.com',password:'novasenha123'},'192.0.2.73')).body.user.emailVerified,true);
    // Limites: 3 e-mails por conta por hora (o 4º pedido responde igual, mas não envia) e 10 pedidos por IP por hora
    await forgot('ana@test.com');await waitMails(sentBefore+5);assert.equal(mails.length,sentBefore+5);
    assert.deepEqual(await forgot('ana@test.com'),{status:200,body:{}});
    await new Promise(r=>setTimeout(r,200));
    assert.equal(mails.length,sentBefore+5,'o 4º pedido da mesma conta na hora não envia');
    for(let i=0;i<10;i++) assert.equal((await forgot(`pessoa${i}@test.com`,'192.0.2.99')).status,200);
    assert.equal((await forgot('outra@test.com','192.0.2.99')).body.code,'RATE_LIMIT');
    Object.assign(brevo,{apiKey:undefined,from:undefined});
    // Com o envio desligado, ninguém consegue confirmar: a limpeza não apaga nada
    await pool.query("UPDATE usuarios SET email_recusado_em=now()-interval '25 hours' WHERE id=$1",[newBounce.id]);
    assert.equal(await purgeUnconfirmedAccounts(pool),0);
    assert.equal((await call('/auth/verify-email/resend','POST',{},failed.body.token)).body.code,'EMAIL_DISABLED');
    assert.equal((await forgot('novo@test.com','192.0.2.98')).body.code,'EMAIL_DISABLED');
    const malformed=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
    assert.equal(malformed.status,400);assert.equal((await malformed.json()).message,'Requisição inválida.');
    const page=await fetch(base.replace(/\/api$/,'/'));
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'),'DENY');
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(fakeGoogle) await new Promise(resolve=>fakeGoogle.close(resolve));
    if(fakeTurnstile) await new Promise(resolve=>fakeTurnstile.close(resolve));
    if(fakeBrevo) await new Promise(resolve=>fakeBrevo.close(resolve));
    await pool.end();
  }
});
