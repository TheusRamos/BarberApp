import { app } from './app.js';
import { pool } from './db.js';
if(!process.env.DATABASE_URL) { console.error('Configure DATABASE_URL no arquivo .env.');process.exit(1); }
try {
  await pool.query('SELECT version FROM schema_migrations WHERE version=1').then(result=>{
    if(!result.rowCount) throw new Error('Execute npm run db:migrate.');
  });
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const server=app.listen(port,host,()=>console.log(`BarberApp disponível em http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
} catch(error) {console.error('Falha ao iniciar. Confira DATABASE_URL e execute npm run db:migrate.',error.code||error.message);await pool.end();process.exitCode=1;}
