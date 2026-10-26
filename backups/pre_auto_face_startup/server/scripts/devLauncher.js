/**
 * devLauncher.js
 * ============================================================================
 * Concurrently starts:
 *   1. Python Biometric Microservice (FastAPI + DeepFace on 127.0.0.1:5002)
 *   2. Node.js Express Backend (127.0.0.1:5000)
 * Handles graceful cross-platform shutdown (SIGINT / SIGTERM) on Windows & POSIX.
 * ============================================================================
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const faceServiceDir = path.resolve(rootDir, "face_service");
const serverDir = path.resolve(rootDir, "server");

console.log("==================================================");
console.log("🚀 Starting HRMS Fullstack Biometric Development Environment");
console.log("==================================================");

// 1. Spawn Python Face Service
console.log(`[Face Service] Spawning Python microservice on port 5002...`);
const pythonCmd = process.platform === "win32" ? "python" : "python3";
const faceProcess = spawn(
  pythonCmd,
  ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "5002"],
  {
    cwd: faceServiceDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
  }
);

faceProcess.on("error", (err) => {
  console.error(`[Face Service Error] Failed to start Python service:`, err.message);
});

// 2. Spawn Node.js Backend Server
console.log(`[Node Server] Spawning Express backend on port 5000...`);
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
  console.error(`[Node Server Error] Failed to start Node backend:`, err.message);
});

// Clean shutdown handler
function shutdown() {
  console.log("\n[DevLauncher] Stopping all services...");
  try { faceProcess.kill(); } catch (e) {}
  try { nodeProcess.kill(); } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
