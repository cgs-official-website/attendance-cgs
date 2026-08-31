import pg from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const backupFile = path.resolve(__dirname, "../backup/firestore_export_latest.json");
const rawData = JSON.parse(fs.readFileSync(backupFile, "utf8"));
const { collections = {} } = rawData;

const toDate = (val) => val ? new Date(val).toISOString() : new Date().toISOString();

async function populateDirectMessages() {
  const client = await pool.connect();
  console.log("==================================================");
  console.log("💬 POPULATING DIRECT_MESSAGES TABLE FROM MESSAGES");
  console.log("==================================================");

  const msgs = collections.messages || [];
  const dmThreads = collections.dm_threads || [];
  const dmThreadIds = new Set(dmThreads.map(d => d._id));

  // Also extract DM thread IDs from messages where threadId contains '_dm_'
  for (const m of msgs) {
    const tid = m.threadId || m.thread_id || m.channelId;
    if (tid && (tid.includes("_dm_") || dmThreadIds.has(tid))) {
      dmThreadIds.add(tid);
    }
  }

  // Ensure all DM threads exist in dm_threads table
  for (const tid of dmThreadIds) {
    const parts = tid.split("_dm_");
    await client.query(
      `INSERT INTO dm_threads (id, participants, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [tid, parts.length === 2 ? parts : []]
    );
  }

  let dmCount = 0;
  for (const m of msgs) {
    const threadId = m.threadId || m.thread_id || m.channelId;
    const isDm = m.threadType === "dm" || (threadId && (threadId.includes("_dm_") || dmThreadIds.has(threadId)));

    if (isDm && threadId) {
      const senderId = m.senderId || m.userId || m.sender?.id || null;
      if (senderId) {
        await client.query(
          `INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
          [senderId, `${senderId}@system.local`, m.senderName || m.userName || "Staff Member"]
        );
      }

      await client.query(
        `INSERT INTO direct_messages (id, thread_id, sender_id, content, file_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          m._id,
          threadId,
          senderId,
          m.content || m.text || m.message || "",
          m.fileUrl || m.file || null,
          toDate(m.timestamp || m.createdAt)
        ]
      );
      dmCount++;
    }
  }

  console.log(`\n🎉 Successfully imported ${dmCount} direct messages into 'direct_messages'!`);

  const res = await client.query("SELECT COUNT(*) FROM direct_messages;");
  console.log(`Total rows in 'direct_messages' table: ${res.rows[0].count}`);

  client.release();
  await pool.end();
}

populateDirectMessages().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
