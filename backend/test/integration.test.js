import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('API com PostgreSQL: permissões, concorrência, fila, moderação e histórico',
  {skip:!process.env.TEST_DATABASE_URL},async()=>{
  // Use exclusivamente um banco vazio e descartável. Nunca o banco da aplicação.
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  const {pool}=await import('../db.js');
  const {app}=await import('../app.js');
  const {hashPassword}=await import('../security.js');
  let server;
  try {
    const tables=await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' LIMIT 1");
    assert.equal(tables.rowCount,0,'TEST_DATABASE_URL precisa apontar para um banco vazio.');
    await pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
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
    const comment=(await call('/comments','POST',{rating:5,text:'Ótimo atendimento'},a.token)).body;
    assert.equal((await call('/comments')).body.length,0);
    assert.equal((await call('/comments','GET',undefined,admin)).body.length,1);
    assert.equal((await call(`/comments/${comment.id}`,'PATCH',{approved:true},a.token)).status,403);
    assert.equal((await call(`/comments/${comment.id}`,'PATCH',{approved:true},admin)).status,200);
    assert.equal((await call('/comments')).body.length,1);
    assert.equal((await call('/comments','POST',{rating:5,text:'palavra '.repeat(51)},a.token)).status,400);
    await call('/services/'+service.body.id,'PATCH',{price:90},admin);
    assert.equal((await call(`/agendamentos/${promoted.id}`,'GET',undefined,admin)).body.valor,45);
    await call('/auth/logout','POST',{},a.token);
    assert.equal((await call('/auth/me','GET',undefined,a.token)).status,401);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await pool.end();
  }
});
