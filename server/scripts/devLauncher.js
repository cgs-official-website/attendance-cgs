/**
 * devLauncher.js
 * ============================================================================
 * Launches HRMS Fullstack Backend:
 *   Node.js Express Backend automatically ensures and supervises the
 *   Python FastAPI Face Verification microservice on 127.0.0.1:5002.
 * Handles graceful cross-platform shutdown (SIGINT / SIGTERM).
 * ============================================================================
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const serverDir = path.resolve(rootDir, "server");

console.log("==================================================");
console.log("🚀 Starting HRMS Fullstack Biometric Development Environment");
console.log("==================================================");

// Spawn Node.js Backend Server (which automatically manages Face Service on 127.0.0.1:5002)
console.log(`[DevLauncher] Starting Node backend (auto-supervising Face Service on 127.0.0.1:5002)...`);
const nodeProcess = spawn(
  process.execPath,
  ["src/index.js"],
  {
    cwd: serverDir,
    stdio: "inherit",
    env: { ...process.env }
  }
);

nodeProcess.on("error", (err) => {
  console.error(`[DevLauncher Error] Failed to start Node backend:`, err.message);
});

// Clean shutdown handler
function shutdown() {
  console.log("\n[DevLauncher] Stopping all services...");
  try { nodeProcess.kill("SIGINT"); } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
