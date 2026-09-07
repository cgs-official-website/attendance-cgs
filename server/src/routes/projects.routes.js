import express from "express";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  addProjectMember,
  getTasks,
  createTask,
  updateTask
} from "../controllers/projectController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getProjects);
router.post("/", createProject);
router.patch("/:id", updateProject);
router.delete("/:id", deleteProject);
router.post("/:id/members", addProjectMember);

router.get("/tasks", getTasks);
router.post("/tasks", createTask);
router.patch("/tasks/:id", updateTask);

export default router;
