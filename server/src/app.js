import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import usersRoutes from "./routes/users.routes.js";
import leavesRoutes from "./routes/leaves.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import companiesRoutes from "./routes/companies.routes.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/leaves", leavesRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/companies", companiesRoutes);

export default app;
