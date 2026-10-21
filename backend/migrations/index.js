import { readFile } from 'node:fs/promises';
// Migrações em ordem. Nunca altere um arquivo já aplicado: crie uma nova versão.
export const migrations=[
  {version:1,file:'../schema.sql'},
  {version:2,file:'./002_varios_servicos.sql'}
];
export const latestVersion=migrations.at(-1).version;
// Executar dentro de transação: aplica apenas as versões ainda não registradas.
export async function runMigrations(db) {
  await db.query('SELECT pg_advisory_xact_lock(712345)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const applied=new Set((await db.query('SELECT version FROM schema_migrations')).rows.map(r=>r.version));
  for(const {version,file} of migrations) {
    if(applied.has(version)) continue;
    await db.query(await readFile(new URL(file,import.meta.url),'utf8'));
    await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
  }
}
