import { randomBytes, createHash } from 'node:crypto';
import { fail, email } from './security.js';

// Login com Google por OpenID Connect (fluxo de código com PKCE), sem scripts do Google nas páginas.
export const google={
  clientId:process.env.GOOGLE_CLIENT_ID,
  clientSecret:process.env.GOOGLE_CLIENT_SECRET,
  authUrl:'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl:'https://oauth2.googleapis.com/token' // os testes trocam por um servidor falso
};
export const googleEnabled=()=>Boolean(google.clientId && google.clientSecret && process.env.PUBLIC_URL);
const redirectUri=()=>`${process.env.PUBLIC_URL.replace(/\/$/,'')}/api/auth/google/callback`;
const random=()=>randomBytes(32).toString('base64url');

// state, verificador PKCE e nonce vão para um cookie HttpOnly: só o navegador que iniciou o login o conclui.
export function start() {
  const state=random(),verifier=random(),nonce=random();
  const url=new URL(google.authUrl);
  url.search=new URLSearchParams({client_id:google.clientId,redirect_uri:redirectUri(),response_type:'code',
    scope:'openid email profile',state,nonce,prompt:'select_account',code_challenge_method:'S256',
    code_challenge:createHash('sha256').update(verifier).digest('base64url')});
  return {url:url.href,cookie:[state,verifier,nonce].join('.')};
}

// O id_token chega direto do Google por HTTPS, em troca do segredo do cliente: dispensa validar a assinatura.
export async function finish(code,cookie) {
  const [,verifier,nonce]=cookie.split('.');
  const response=await fetch(google.tokenUrl,{method:'POST',signal:AbortSignal.timeout(10000),
    body:new URLSearchParams({code,client_id:google.clientId,client_secret:google.clientSecret,
      redirect_uri:redirectUri(),grant_type:'authorization_code',code_verifier:verifier})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) fail(502,`Google recusou o código (${body.error}).`,'GOOGLE_FAILED');
  const claims=JSON.parse(Buffer.from(String(body.id_token).split('.')[1]||'','base64url').toString());
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss) || claims.aud!==google.clientId ||
     !(claims.exp*1000>Date.now()) || claims.nonce!==nonce || claims.email_verified!==true || typeof claims.sub!=='string')
    fail(401,'id_token recusado (emissor, cliente, validade, nonce ou e-mail não verificado).','GOOGLE_FAILED');
  const name=typeof claims.name==='string' && claims.name.trim().length>=3?claims.name.trim():String(claims.email).split('@')[0];
  return {sub:claims.sub,email:email(claims.email),name:name.slice(0,150)};
}

// Conta ligada ao id do Google ou conta nova. Um e-mail já cadastrado com senha não é vinculado:
// o site não confirma e-mails, então quem cadastrou o e-mail de outra pessoa manteria o acesso pela senha.
export async function googleUser(db,{sub,email,name}) {
  const linked=(await db.query('SELECT * FROM usuarios WHERE google_id=$1',[sub])).rows[0];
  if(linked) return linked;
  if((await db.query('SELECT 1 FROM usuarios WHERE lower(email)=$1',[email])).rowCount)
    fail(409,'Este e-mail já tem cadastro. Entre com e-mail e senha.','GOOGLE_EMAIL_IN_USE');
  return (await db.query("INSERT INTO usuarios(nome,email,google_id,tipo) VALUES($1,$2,$3,'cliente') RETURNING *",[name,email,sub])).rows[0];
}

// Código de uso único (1 minuto) que a página troca pela sessão, para o token não passar pela URL.
const codes=new Map();
export function issueCode(userId) {
  const now=Date.now();
  for(const [key,v] of codes) if(v.until<=now) codes.delete(key);
  const code=random();
  codes.set(code,{userId,until:now+60000});
  return code;
}
export function redeemCode(code) {
  const entry=typeof code==='string' && codes.get(code);
  if(entry) codes.delete(code);
  return entry && entry.until>Date.now()?entry.userId:null;
}
