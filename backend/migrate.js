import { pool, transaction, target } from './db.js';
import { runMigrations } from './migrations/index.js';
try {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.');
  console.log('Banco:', target());
  await transaction(runMigrations);
  console.log('Banco atualizado.');
} catch (error) { console.error('Migração falhou:', error.message); process.exitCode=1; }
finally { await pool.end(); }
