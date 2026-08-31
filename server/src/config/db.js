import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("railway.app") 
    ? { rejectUnauthorized: false } 
    : false
});

pool.on("connect", () => {
  console.log("🐘 PostgreSQL client connected successfully.");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle PostgreSQL client:", err);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
