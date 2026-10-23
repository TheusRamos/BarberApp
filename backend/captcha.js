import { fail } from './security.js';

// Cloudflare Turnstile (CAPTCHA grátis): exigido no cadastro, contra contas falsas em massa, e no
// login de uma conta com muitas tentativas, no lugar do bloqueio que deixaria a vítima sem acesso.
export const turnstile={
  siteKey:process.env.TURNSTILE_SITE_KEY,
  secret:process.env.TURNSTILE_SECRET_KEY,
  verifyUrl:'https://challenges.cloudflare.com/turnstile/v0/siteverify' // os testes trocam por um servidor falso
};
export const captchaEnabled=()=>Boolean(turnstile.siteKey && turnstile.secret);

export async function requireCaptcha(token,ip) {
  if(typeof token!=='string' || !token || token.length>2048) fail(400,'Confirme que você não é um robô.','CAPTCHA_REQUIRED');
  let result;
  try {
    const response=await fetch(turnstile.verifyUrl,{method:'POST',signal:AbortSignal.timeout(10000),
      body:new URLSearchParams({secret:turnstile.secret,response:token,remoteip:ip})});
    result=await response.json();
  } catch(error) {
    console.error('Falha ao consultar o Turnstile:',error.name);
  }
  if(result?.success!==true) fail(400,'A verificação anti-robô falhou. Tente novamente.','CAPTCHA_REQUIRED');
}
