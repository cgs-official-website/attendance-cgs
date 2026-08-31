import http from "http";
import app from "./app.js";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

let PORT = parseInt(process.env.PORT || "5000", 10);
const server = http.createServer(app);

// Socket.io for live updates
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`⚡ Socket client connected: ${socket.id}`);

  socket.on("join_company", (companyId) => {
    socket.join(`company_${companyId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket client disconnected: ${socket.id}`);
  });
});

export { io };

function startServer(port) {
  server.listen(port, () => {
    console.log(`🚀 HRMS Backend Server running on port ${port}`);
    console.log(`📡 Health check available at: http://localhost:${port}/api/health`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${port} is in use. Trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}

startServer(PORT);
