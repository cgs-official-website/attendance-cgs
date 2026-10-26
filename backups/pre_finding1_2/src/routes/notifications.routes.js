import express from "express";
import {
  getNotifications,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from "../controllers/notificationController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/", getNotifications);
router.post("/", createNotification);
router.patch("/:id/read", markNotificationAsRead);
router.post("/read-all", markAllNotificationsAsRead);

export default router;
