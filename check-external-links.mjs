import { query } from './server/src/config/db.js';

async function main() {
  try {
    const tableInfo = await query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'external_links'
    `);
    console.log('Columns:');
    console.table(tableInfo.rows);

    const fkeys = await query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'external_links'
    `);
    console.log('Constraints:');
    console.table(fkeys.rows);

    const rows = await query('SELECT * FROM external_links LIMIT 5');
    console.log('Sample rows count:', rows.rows.length);
    if (rows.rows.length > 0) {
      console.log('Sample row:', rows.rows[0]);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
