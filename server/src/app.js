import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import usersRoutes from "./routes/users.routes.js";
import leavesRoutes from "./routes/leaves.routes.js";
import regularizationRoutes from "./routes/regularization.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import tasksRoutes from "./routes/tasks.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import assetsRoutes from "./routes/assets.routes.js";
import payrollRoutes from "./routes/payroll.routes.js";
import rolesRoutes from "./routes/roles.routes.js";
import envSettingsRoutes from "./routes/envSettings.routes.js";
import companiesRoutes from "./routes/companies.routes.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/leaves", leavesRoutes);
app.use("/api/regularization", regularizationRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/environment-settings", envSettingsRoutes);
app.use("/api/companies", companiesRoutes);

export default app;
