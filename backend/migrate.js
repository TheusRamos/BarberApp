import { readFile } from 'node:fs/promises';
import { pool, transaction } from './db.js';
try {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.');
  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(712345)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
    if (!(await db.query('SELECT 1 FROM schema_migrations WHERE version=1')).rowCount) {
      await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
    }
  });
  console.log('Banco atualizado.');
} catch (error) { console.error('Migração falhou:', error.message); process.exitCode=1; }
finally { await pool.end(); }
