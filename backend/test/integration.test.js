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
  const {pool,transaction}=await import('../db.js');
  const {app}=await import('../app.js');
  const {hashPassword}=await import('../security.js');
  const {runMigrations}=await import('../migrations/index.js');
  const {google}=await import('../google.js');
  let server,fakeGoogle;
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
    assert.equal((await call('/waitlist','POST',{...combo,hora:'09:45'},d.token)).status,201);
    await call(`/agendamentos/${blockA.id}/cancel`,'POST',{},admin);
    assert.equal((await call('/agendamentos','GET',undefined,d.token)).body.length,1,'30 minutos livres não comportam 45');
    await call(`/agendamentos/${blockB.id}/cancel`,'POST',{},admin);
    const dBookings=(await call('/agendamentos','GET',undefined,d.token)).body;
    assert.equal(dBookings.length,2);assert.equal(dBookings[1].hora,'09:45');
    assert.deepEqual(dBookings[1].servicos,['Corte','Barba']);assert.equal(dBookings[1].duracao,45);
    const edited=await call(`/agendamentos/${multi.body.id}`,'PATCH',{...combo,servicos:['Barba']},admin);
    assert.equal(edited.status,200);assert.deepEqual(edited.body.servicos,['Barba']);assert.equal(edited.body.valor,25);
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
    assert.deepEqual((await call('/auth/options')).body,{google:true});
    const googleFirst=await googleLogin({sub:'g-1',email:'G@test.com',name:'Cliente Google'});
    const g=await call('/auth/google/session','POST',{code:googleFirst.google_code});
    assert.equal(g.status,200);
    assert.deepEqual([g.body.user.email,g.body.user.phone,g.body.user.hasPassword],['g@test.com',null,false]);
    assert.equal((await call('/auth/google/session','POST',{code:googleFirst.google_code})).status,400);
    assert.equal((await call('/agendamentos','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    assert.equal((await call('/waitlist','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    assert.equal((await call('/users/'+g.body.user.id,'PATCH',{phone:'11977777777'},g.body.token)).status,200);
    assert.notEqual((await call('/agendamentos','POST',{},g.body.token)).body.code,'PHONE_REQUIRED');
    const googleAgain=await googleLogin({sub:'g-1',email:'g@test.com',name:'Cliente Google'});
    assert.equal((await call('/auth/google/session','POST',{code:googleAgain.google_code})).body.user.id,g.body.user.id);
    assert.equal((await googleLogin({sub:'g-2',email:'a@test.com'})).google_error,'GOOGLE_EMAIL_IN_USE');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com',email_verified:false})).google_error,'GOOGLE_FAILED');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com',nonce:'outro'})).google_error,'GOOGLE_FAILED');
    assert.equal((await googleLogin({sub:'g-3',email:'h@test.com'},'forjado')).google_error,'GOOGLE_FAILED');
    assert.equal((await call('/auth/login','POST',{email:'g@test.com',password:'qualquer123'})).status,401);
    assert.equal((await call('/auth/password','POST',{currentPassword:'qualquer123',newPassword:'nova12345'},g.body.token)).body.code,'WRONG_PASSWORD');
    const malformed=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
    assert.equal(malformed.status,400);assert.equal((await malformed.json()).message,'Requisição inválida.');
    const page=await fetch(base.replace(/\/api$/,'/'));
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'),'DENY');
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(fakeGoogle) await new Promise(resolve=>fakeGoogle.close(resolve));
    await pool.end();
  }
});
