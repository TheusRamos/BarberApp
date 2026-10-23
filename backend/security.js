import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export function fail(status, message, code='VALIDATION_ERROR') {
  throw Object.assign(new Error(message), { status, code });
}
// Caracteres invisíveis e de controle são removidos: burlariam limites (palavras separadas por
// espaço de largura zero) e permitiriam disfarçar nomes (inversão da direção do texto).
const invisible=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁠-⁤⁦-⁩﻿]/g;
export function text(value, name, min=1, max=150) {
  const clean=typeof value==='string' ? value.replace(invisible,'').trim() : null;
  if (clean===null || clean.length<min || clean.length>max)
    fail(400, `${name}: informe entre ${min} e ${max} caracteres.`);
  return clean;
}
export function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<1)
    fail(400,'Identificador inválido.');
  return Number(value);
}
export function email(value) {
  const result=text(value,'Email',3,150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400,'Email inválido.');
  return result;
}
export function phone(value) {
  const result=text(value,'Telefone',10,20).replace(/\D/g,'');
  if (result.length<10 || result.length>15) fail(400,'Telefone inválido.');
  return result;
}
// O início do arquivo precisa ser do tipo declarado, não basta o prefixo data:image/...
const signatures={
  jpeg:b=>b[0]===0xff && b[1]===0xd8 && b[2]===0xff,
  png:b=>b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
  webp:b=>b.toString('latin1',0,4)==='RIFF' && b.toString('latin1',8,12)==='WEBP'
};
export function photo(value='') {
  const match=typeof value==='string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (typeof value!=='string' || value.length>300000 ||
      (value && !(match && signatures[match[1]](Buffer.from(match[2].slice(0,24),'base64')))))
    fail(400,'Foto inválida. Use o seletor de imagem.');
  return value;
}
export async function hashPassword(password) {
  if (typeof password!=='string' || password.length<8 || password.length>128)
    fail(400,'A senha deve ter entre 8 e 128 caracteres.','WEAK_PASSWORD');
  const salt=randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password,salt,64)).toString('hex')}`;
}
// Sempre calcula o scrypt, mesmo sem hash válido, para que o tempo de resposta
// não revele se o email existe.
export async function verifyPassword(password, stored) {
  if (typeof password!=='string' || password.length>128) return false;
  const [scheme,salt,hash]=String(stored).split(':');
  const valid=scheme==='scrypt' && Boolean(salt) && /^[a-f0-9]{128}$/.test(hash || '');
  const derived=await derive(password,valid?salt:'0'.repeat(32),64);
  return valid && timingSafeEqual(derived,Buffer.from(hash,'hex'));
}
// Janela fixa em memória: hit() conta a tentativa e informa se ainda está no limite.
export function limiter(max, windowMs) {
  const hits=new Map();
  setInterval(()=>{const now=Date.now();for(const [key,v] of hits) if(v.until<=now) hits.delete(key);},60000).unref();
  return {
    hit(key) {
      const now=Date.now();let entry=hits.get(key);
      if(!entry || entry.until<=now) hits.set(key,entry={count:0,until:now+windowMs});
      return ++entry.count<=max;
    },
    reset(key) {hits.delete(key);}
  };
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const userDTO = u => ({id:String(u.id),name:u.nome,email:u.email,phone:u.telefone,
  role:u.tipo==='administrador'?'admin':'client',photoURL:u.foto || '',hasPassword:Boolean(u.senha)});
export async function session(db,user) {
  const token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessoes(token_hash,usuario_id) VALUES($1,$2)',[tokenHash(token),user.id]);
  return {token,user:userDTO(user)};
}
