import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword,verifyPassword,email,phone,photo,id,limiter } from '../security.js';
test('senhas usam salt e rejeitam senha incorreta e conteúdo legado',async()=>{
  const hash=await hashPassword('segredo123');
  assert.notEqual(hash,await hashPassword('segredo123'));
  assert.equal(await verifyPassword('segredo123',hash),true);
  assert.equal(await verifyPassword('errada',hash),false);
  assert.equal(await verifyPassword('segredo123','segredo123'),false);
  assert.equal(await verifyPassword('segredo123',undefined),false);
  await assert.rejects(hashPassword('1234567'),{code:'WEAK_PASSWORD'});
});
test('limitador bloqueia acima do máximo e pode ser reiniciado',()=>{
  const limit=limiter(2,60000);
  assert.equal(limit.hit('a'),true);
  assert.equal(limit.hit('a'),true);
  assert.equal(limit.hit('a'),false);
  assert.equal(limit.hit('b'),true);
  limit.reset('a');
  assert.equal(limit.hit('a'),true);
});
test('validação normaliza contato e rejeita entradas perigosas',()=>{
  assert.equal(email(' A@Exemplo.com '),'a@exemplo.com');
  assert.equal(phone('(11) 99999-1234'),'11999991234');
  assert.throws(()=>photo('javascript:alert(1)'));
  assert.throws(()=>id('1 OR 1=1'));
  assert.throws(()=>email('invalido'));
});
