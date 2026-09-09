import { pool } from './db.js';
import { text,email,phone,hashPassword } from './security.js';
try {
  const e=process.env;
  await pool.query("INSERT INTO usuarios(nome,email,telefone,senha,tipo) VALUES($1,$2,$3,$4,'administrador')",
    [text(e.ADMIN_NAME,'Nome',3),email(e.ADMIN_EMAIL),phone(e.ADMIN_PHONE),await hashPassword(e.ADMIN_PASSWORD)]);
  console.log('Administrador criado. Remova ADMIN_PASSWORD do .env.');
} catch(error) {console.error('Não foi possível criar o administrador:',error.code==='23505'?'Email ou telefone já cadastrado.':error.message);process.exitCode=1;}
finally { await pool.end(); }
