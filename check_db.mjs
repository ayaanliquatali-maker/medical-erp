import { createRequire } from 'node:module';
import path from 'node:path';
const pgPath = path.resolve('node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js');
const require = createRequire(pgPath);
const { default: pg } = require(pgPath);
const pool = new pg.Pool({
  connectionString: 'postgres://postgres:aghafication@localhost:5432/MedicalERP'
});
try {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position");
  console.log('columns:', JSON.stringify(r.rows.map(c => c.column_name)));
  const r2 = await pool.query("SELECT count(*)::int as cnt FROM products");
  console.log('product count:', r2.rows[0].cnt);
} catch(e) {
  console.error('ERROR:', e.message);
}
await pool.end();
