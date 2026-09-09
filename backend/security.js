import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export function fail(status, message, code='VALIDATION_ERROR') {
  throw Object.assign(new Error(message), { status, code });
}
export function text(value, name, min=1, max=150) {
  if (typeof value !== 'string' || value.trim().length<min || value.trim().length>max)
    fail(400, `${name}: informe entre ${min} e ${max} caracteres.`);
  return value.trim();
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
export function photo(value='') {
  if (typeof value!=='string' || value.length>300000 ||
      (value && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)))
    fail(400,'Foto inválida. Use o seletor de imagem.');
  return value;
}
export async function hashPassword(password) {
  if (typeof password!=='string' || password.length<6 || password.length>128)
    fail(400,'A senha deve ter entre 6 e 128 caracteres.','WEAK_PASSWORD');
  const salt=randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password,salt,64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password!=='string' || password.length>128) return false;
  const [scheme,salt,hash]=String(stored).split(':');
  if (scheme!=='scrypt' || !salt || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  return timingSafeEqual(await derive(password,salt,64),Buffer.from(hash,'hex'));
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const userDTO = u => ({id:String(u.id),name:u.nome,email:u.email,phone:u.telefone,
  role:u.tipo==='administrador'?'admin':'client',photoURL:u.foto || ''});
export async function session(db,user) {
  const token=randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessoes(token_hash,usuario_id) VALUES($1,$2)',[tokenHash(token),user.id]);
  return {token,user:userDTO(user)};
}
