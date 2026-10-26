import express from "express";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  startTaskTimer,
  stopTaskTimer
} from "../controllers/taskController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getTasks);
router.post("/", createTask);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);
router.post("/:id/start-timer", startTaskTimer);
router.post("/:id/stop-timer", stopTaskTimer);

export default router;
