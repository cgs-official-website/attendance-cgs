import { query } from './server/src/config/db.js';

async function testInsert() {
  try {
    const dummyProjectId = "proj-" + Math.random().toString(36).substr(2, 9);
    console.log("Trying insert with dummy project_id:", dummyProjectId);
    await query(
      `INSERT INTO external_links (id, company_id, user_id, link_token, channel_id, client_name, client_email, project_id, project_name, pm_id, pm_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')`,
      ['test_' + Date.now(), 'carrezza-global-solutions', 'q1ZdappoH2hcV1D8kaaTMkBFhrF3', 'test_tok_' + Date.now(), 'test_ch', 'Test Client', 'test@test.com', dummyProjectId, 'Test Project', 'h3MgS48nNlbN5GfPxsxkMLut6gc2', 'Test PM']
    );
    console.log("Insert succeeded!");
  } catch (err) {
    console.error("Insert failed:", err.message);
  }

  // Let's also check existing projects
  const projs = await query('SELECT id, name FROM projects LIMIT 5');
  console.log("Existing projects in DB:", projs.rows);

  // Let's also check channels
  const chs = await query('SELECT id, name FROM channels LIMIT 5');
  console.log("Existing channels in DB:", chs.rows);

  process.exit(0);
}

testInsert();
