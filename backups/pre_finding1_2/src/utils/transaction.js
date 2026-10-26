/**
 * Database Transaction Helper
 * ============================
 * Provides atomic execution with automatic rollback on errors.
 */

import pool from "../config/db.js";

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rbErr) {
      console.error("Error during transaction rollback:", rbErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export default { withTransaction };
