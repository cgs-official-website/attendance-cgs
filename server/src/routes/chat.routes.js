import express from "express";
import {
  getChannels,
  createChannel,
  getMessages,
  sendMessage,
  pinMessage,
  getDmThreads,
  createDmThread,
  getDirectMessages,
  sendDirectMessage,
  deleteMessage,
  updateReadReceipt
} from "../controllers/chatController.js";
import { authenticateToken, authenticateTokenOrExternalLink } from "../middlewares/auth.js";

const router = express.Router();

// Message endpoints allow either JWT auth or verified external link token
router.get("/messages", authenticateTokenOrExternalLink, getMessages);
router.post("/messages", authenticateTokenOrExternalLink, sendMessage);

router.use(authenticateToken);
router.get("/channels", getChannels);
router.post("/channels", createChannel);
router.delete("/messages/:id", deleteMessage);
router.patch("/messages/:id/pin", pinMessage);
router.get("/dm-threads", getDmThreads);
router.post("/dm-threads", createDmThread);
router.get("/dm-threads/:threadId/messages", getDirectMessages);
router.post("/dm-messages", sendDirectMessage);
router.post("/read-receipt", updateReadReceipt);

export default router;
