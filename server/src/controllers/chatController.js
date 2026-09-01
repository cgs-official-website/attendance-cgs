import { query } from "../config/db.js";

// Channels
export const getChannels = async (req, res) => {
  try {
    const { companyId } = req.query;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT *, name as \"displayName\" FROM channels WHERE 1=1";
    const params = [];
    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }
    sql += " ORDER BY created_at ASC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getChannels error:", err);
    res.status(500).json({ error: "Failed to fetch channels." });
  }
};

export const createChannel = async (req, res) => {
  try {
    const { name, displayName, description, isPrivate = false, companyId } = req.body;
    const creatorId = req.user?.id || null;
    const targetCompanyId = companyId || req.user?.companyId;

    const id = "ch_" + (name || "channel").toLowerCase().replace(/[^a-z0-9]/g, "-") + "_" + Math.random().toString(36).substr(2, 6);
    const result = await query(
      `INSERT INTO channels (id, company_id, name, description, created_by, is_private)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, targetCompanyId, displayName || name, description || "", creatorId, isPrivate]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("createChannel error:", err);
    res.status(500).json({ error: "Failed to create channel." });
  }
};

// Messages
export const getMessages = async (req, res) => {
  try {
    const { channelId, companyId } = req.query;
    let sql = "SELECT *, user_id as \"senderId\", user_name as \"senderName\", created_at as timestamp FROM messages WHERE 1=1";
    const params = [];

    if (channelId) {
      params.push(channelId);
      sql += ` AND channel_id = $${params.length}`;
    }
    if (companyId || req.user?.companyId) {
      params.push(companyId || req.user?.companyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY created_at ASC LIMIT 1000";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ error: "Failed to fetch messages." });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { channelId, content, attachments = [], replyToId = null, companyId } = req.body;
    const senderId = req.user?.id || req.body.senderId;
    const senderName = req.user?.name || req.body.senderName || "User";
    const userAvatar = req.user?.avatarUrl || req.body.avatar || null;
    const targetCompanyId = companyId || req.user?.companyId;

    const fileUrl = attachments[0]?.url || attachments[0]?.fileUrl || null;
    const fileName = attachments[0]?.name || attachments[0]?.fileName || null;
    const fileType = attachments[0]?.type || attachments[0]?.fileType || null;

    const id = "msg_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO messages (id, channel_id, company_id, user_id, user_name, user_avatar, content, file_url, file_name, file_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, channelId, targetCompanyId, senderId, senderName, userAvatar, content, fileUrl, fileName, fileType]
    );

    const row = result.rows[0];
    res.status(201).json({
      ...row,
      senderId: row.user_id,
      senderName: row.user_name,
      timestamp: row.created_at
    });
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ error: "Failed to send message." });
  }
};

export const pinMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { pinnedDuration, pinnedUntil, isPinned = true } = req.body;
    const result = await query(
      `UPDATE messages
       SET reactions = jsonb_set(COALESCE(reactions, '{}'::jsonb), '{pinned}', $1::jsonb)
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify({ isPinned, pinnedDuration, pinnedUntil, pinnedAt: new Date().toISOString() }), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("pinMessage error:", err);
    res.status(500).json({ error: "Failed to pin message." });
  }
};

// DM Threads
export const getDmThreads = async (req, res) => {
  try {
    const { userId, companyId } = req.query;
    const targetUserId = userId || req.user?.id;
    const targetCompanyId = companyId || req.user?.companyId;

    let sql = "SELECT *, participants as participant_ids, participants as \"participantIds\" FROM dm_threads WHERE 1=1";
    const params = [];

    if (targetUserId) {
      params.push(targetUserId);
      sql += ` AND $${params.length} = ANY(participants)`;
    }
    if (targetCompanyId) {
      params.push(targetCompanyId);
      sql += ` AND company_id = $${params.length}`;
    }

    sql += " ORDER BY last_message_at DESC NULLS LAST LIMIT 200";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("getDmThreads error:", err);
    res.status(500).json({ error: "Failed to fetch DM threads." });
  }
};

export const getDirectMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const result = await query(
      "SELECT *, sender_id as \"senderId\", created_at as timestamp FROM direct_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 1000",
      [threadId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getDirectMessages error:", err);
    res.status(500).json({ error: "Failed to fetch direct messages." });
  }
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { threadId, content, attachments = [] } = req.body;
    const senderId = req.user?.id || req.body.senderId;
    const fileUrl = attachments[0]?.url || attachments[0]?.fileUrl || null;

    const id = "dm_msg_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const result = await query(
      `INSERT INTO direct_messages (id, thread_id, sender_id, content, file_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, threadId, senderId, content, fileUrl]
    );

    // Update dm_threads last_message
    await query(
      `UPDATE dm_threads
       SET last_message = $1, last_message_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [content, threadId]
    );

    const row = result.rows[0];
    res.status(201).json({
      ...row,
      senderId: row.sender_id,
      timestamp: row.created_at
    });
  } catch (err) {
    console.error("sendDirectMessage error:", err);
    res.status(500).json({ error: "Failed to send direct message." });
  }
};
