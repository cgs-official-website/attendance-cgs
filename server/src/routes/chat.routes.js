import express from "express";
import {
  getChannels,
  createChannel,
  getMessages,
  sendMessage,
  pinMessage,
  getDmThreads,
  getDirectMessages,
  sendDirectMessage
} from "../controllers/chatController.js";
import { authenticateToken } from "../middlewares/auth.js";

const router = express.Router();

router.use(authenticateToken);
router.get("/channels", getChannels);
router.post("/channels", createChannel);
router.get("/messages", getMessages);
router.post("/messages", sendMessage);
router.patch("/messages/:id/pin", pinMessage);
router.get("/dm-threads", getDmThreads);
router.get("/dm-threads/:threadId/messages", getDirectMessages);
router.post("/dm-messages", sendDirectMessage);

export default router;
