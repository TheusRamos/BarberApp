import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { tokenHash } from './security.js';

// Consulta de DNS do domínio do e-mail (os testes trocam por respostas fixas).
const resolver=new Resolver({timeout:3000,tries:2});
export const mailDns={
  resolveMx:domain=>resolver.resolveMx(domain),
  resolveAddress:domain=>Promise.any([resolver.resolve4(domain),resolver.resolve6(domain)])
};

// O domínio do e-mail recebe mensagens? Não, se ele não existe ou declara que não recebe e-mail
// (MX nulo). Sem registro MX, o próprio domínio pode receber se tiver endereço IP (regra antiga do SMTP).
// Falha de rede ou tempo esgotado na consulta não barra ninguém.
export async function mailDomainExists(address) {
  const domain=address.split('@')[1];
  try {
    return (await mailDns.resolveMx(domain)).some(record=>record.exchange && record.exchange!=='.');
  } catch(error) {
    if(error.code==='ENOTFOUND') return false;
    if(error.code==='ENODATA') return mailDns.resolveAddress(domain).then(()=>true,()=>false);
    return true;
  }
}

// E-mails pela API HTTP do Brevo: o Render bloqueia o envio por SMTP.
// Sem BREVO_API_KEY, EMAIL_FROM e PUBLIC_URL, o envio fica desligado (como o login com Google e o Turnstile),
// e a confirmação de e-mail não é exigida.
export const brevo={
  apiKey:process.env.BREVO_API_KEY,
  from:process.env.EMAIL_FROM,
  fromName:process.env.EMAIL_FROM_NAME || 'Barber',
  url:'https://api.brevo.com/v3/smtp/email' // os testes trocam por um servidor falso
};
export const emailEnabled=()=>Boolean(brevo.apiKey && brevo.from && process.env.PUBLIC_URL);

export async function sendEmail({to,name,subject,html,text}) {
  const response=await fetch(brevo.url,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{'api-key':brevo.apiKey,'Content-Type':'application/json',accept:'application/json'},
    body:JSON.stringify({sender:{email:brevo.from,name:brevo.fromName},to:[{email:to,name}],
      subject,htmlContent:html,textContent:text})});
  if(!response.ok) {
    const body=await response.json().catch(()=>({}));
    throw new Error(`Brevo recusou o envio (${response.status} ${body.code || ''}: ${body.message || 'sem detalhes'})`);
  }
}

// Token de uso único para links enviados por e-mail. O banco guarda só o hash.
export async function createEmailToken(db,userId,tipo,seconds) {
  const token=randomBytes(32).toString('hex');
  await db.query("INSERT INTO tokens_email(token_hash,usuario_id,tipo,expira_em) VALUES($1,$2,$3,now()+make_interval(secs=>$4))",
    [tokenHash(token),userId,tipo,seconds]);
  return token;
}

// Apaga o token ao usar (não serve duas vezes) e devolve o id do usuário, ou null se for inválido ou vencido.
export async function useEmailToken(db,token,tipo) {
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row=(await db.query('DELETE FROM tokens_email WHERE token_hash=$1 AND tipo=$2 RETURNING usuario_id,expira_em>now() AS valido',
    [tokenHash(token),tipo])).rows[0];
  return row?.valido ? row.usuario_id : null;
}

const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const siteUrl=path=>`${process.env.PUBLIC_URL.replace(/\/$/,'')}/${path}`;

// Layout simples, com estilos na própria tag: é o que os programas de e-mail respeitam.
function layout({greeting,lines,button,url,footer}) {
  const paragraphs=lines.map(line=>`<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3a35">${line}</p>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3d9bf;border-radius:6px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:bold;letter-spacing:2px;color:#a37a2c">BARBER</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#282823">${greeting}</h1>
${paragraphs}
<p style="margin:22px 0"><a href="${url}" style="display:inline-block;padding:13px 22px;background:#e9be5f;color:#282823;font-weight:bold;text-decoration:none;border-radius:4px">${button}</a></p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#6b6b63">Se o botão não funcionar, copie este endereço no navegador:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#6b6b63">${url}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a80">${footer}</p>
</div></body></html>`;
}

// Monta e envia um e-mail com um botão: versão HTML e versão em texto puro.
function sendLinkEmail(user,{subject,lines,button,url,footer}) {
  const firstName=String(user.nome).trim().split(/\s+/)[0];
  return sendEmail({to:user.email,name:user.nome,subject,
    html:layout({greeting:`Olá, ${escapeHTML(firstName)}!`,lines,button,url,footer}),
    text:`Olá, ${firstName}!\n\n${lines.join('\n')}\n\n${button}: ${url}\n\n${footer}\n`});
}

// Confirmação de e-mail: link válido por 24 horas, para auth.html#verificar=TOKEN.
export async function sendVerification(db,user) {
  const token=await createEmailToken(db,user.id,'verificacao',24*3600);
  await sendLinkEmail(user,{subject:'Confirme seu e-mail na Barber',button:'Confirmar e-mail',
    url:siteUrl(`auth.html#verificar=${token}`),
    lines:['Falta só confirmar seu e-mail para você agendar na Barber.','O link vale por 24 horas.'],
    footer:'Se você não criou uma conta na Barber, ignore este e-mail.'});
}

// Recuperação de senha: link válido por 1 hora, para auth.html#redefinir=TOKEN.
// Conta só do Google (sem senha): o e-mail explica que ela entra pelo Google, sem link de redefinição.
export async function sendPasswordReset(db,user) {
  if(!user.senha) return sendLinkEmail(user,{subject:'Sua conta na Barber usa o Google',button:'Ir para o login',
    url:siteUrl('auth.html'),
    lines:['Recebemos um pedido para redefinir a senha, mas a sua conta entra pelo Google e não tem senha.',
      'Para entrar, use o botão "Continuar com o Google" na página de login.'],
    footer:'Se você não fez esse pedido, ignore este e-mail.'});
  const token=await createEmailToken(db,user.id,'senha',3600);
  await sendLinkEmail(user,{subject:'Redefina sua senha na Barber',button:'Criar nova senha',
    url:siteUrl(`auth.html#redefinir=${token}`),
    lines:['Recebemos um pedido para redefinir a senha da sua conta.','O link vale por 1 hora e só pode ser usado uma vez.'],
    footer:'Se você não fez esse pedido, ignore este e-mail: sua senha continua a mesma.'});
}
