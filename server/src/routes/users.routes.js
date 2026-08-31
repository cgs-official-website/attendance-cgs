import express from "express";
import { getUsers, updateUser } from "../controllers/userController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getUsers);
router.put("/:id", updateUser);

export default router;
