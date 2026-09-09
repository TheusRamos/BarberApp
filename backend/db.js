import pg from 'pg';

pg.types.setTypeParser(1082, value => value);
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
  options: `-c timezone=${process.env.APP_TIMEZONE || 'America/Sao_Paulo'}`,
  connectionTimeoutMillis: 5000
});
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
