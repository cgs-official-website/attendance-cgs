import http from "http";
import app from "./app.js";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { setSecuritySocketIO } from "./services/securityDetector.js";
import { ensureFaceService, stopFaceServiceProcess } from "./services/faceServiceManager.js";
import { runGeofenceDefaultsMigration } from "../scripts/migrate-geofence-defaults.js";

dotenv.config();

let PORT = parseInt(process.env.PORT || "5001", 10);
const server = http.createServer(app);

// Socket.io for live updates
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.set("io", io);
setSecuritySocketIO(io);

io.on("connection", (socket) => {
  console.log(`⚡ Socket client connected: ${socket.id}`);

  socket.on("join_company", (companyId) => {
    socket.join(`company_${companyId}`);
  });

  socket.on("join_user", (userId) => {
    socket.join(`user_${userId}`);
  });

  socket.on("typing_start", ({ threadId, userId, userName }) => {
    socket.to(`channel_${threadId}`).emit("user_typing", { threadId, userId, userName });
  });

  socket.on("typing_stop", ({ threadId, userId }) => {
    socket.to(`channel_${threadId}`).emit("user_stopped_typing", { threadId, userId });
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket client disconnected: ${socket.id}`);
  });
});

export { io };

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`⚠️ Port ${PORT} is in use. Trying port ${PORT + 1}...`);
    PORT++;
    setTimeout(() => {
      server.close();
      server.listen(PORT, () => {
        console.log(`🚀 HRMS Backend Server running on port ${PORT}`);
        console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
      });
    }, 300);
  } else {
    console.error("Server error:", err);
  }
});

// Graceful shutdown on termination signals
function handleShutdown() {
  console.log("\n[HRMS Backend] Gracefully shutting down...");
  stopFaceServiceProcess();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}
process.once("SIGINT", handleShutdown);
process.once("SIGTERM", handleShutdown);

async function startServer() {
  // 1. Ensure Python FastAPI Face Verification microservice is running or start it
  try {
    await ensureFaceService();
  } catch (faceErr) {
    console.error(`❌ [FaceService] Failed to initialize face verification microservice: ${faceErr.message}`);
    console.warn(`⚠️ [FaceService] Biometric attendance operations will fail-closed (503) until the service is restored.`);
  }

  // 2. Run geofence defaults migration (non-blocking)
  try {
    await runGeofenceDefaultsMigration();
  } catch (migErr) {
    console.warn(`⚠️ [Migration] Geofence defaults migration check: ${migErr.message}`);
  }

  // 3. Start Express server
  server.listen(PORT, () => {
    console.log(`🚀 HRMS Backend Server running on port ${PORT}`);
    console.log(`📡 Health check available at: http://localhost:${PORT}/api/health`);
  });
}

startServer();
