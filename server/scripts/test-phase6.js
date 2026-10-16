import http from "http";
import app from "../src/app.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { query } from "../src/config/db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "hrms_jwt_super_secret_railway_2026";

async function runPhase6Tests() {
  console.log("==================================================");
  console.log("🧪 PHASE 6 TEAM COLLABORATION & CHAT VERIFICATION");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`📡 Local test server listening on port ${port}...\n`);

  let passed = 0;
  let failed = 0;

  const assert = (desc, condition) => {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  };

  try {
    // 1. Authenticate Admin User
    console.log("1. Authenticate Admin User:");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@teamcarrezza.com", password: "12345678" })
    });
    const loginData = await loginRes.json();
    assert("Admin login returns 200 OK", loginRes.status === 200);
    const adminToken = loginData.token;
    const adminUser = loginData.user;
    const companyId = adminUser.company_id || "carrezza-global-solutions";

    // 2. Fetch another user in the company to simulate DM partner
    const otherUsersRes = await query("SELECT id, name, email FROM users WHERE id != $1 AND company_id = $2 LIMIT 1", [adminUser.id, companyId]);
    let partnerUser = otherUsersRes.rows[0];
    if (!partnerUser) {
      // Create a temporary partner user for the test if none exists
      const tempId = "usr_partner_" + Date.now();
      await query(
        `INSERT INTO users (id, company_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, 'hash123', 'Test Colleague', 'employee')`,
        [tempId, companyId, `colleague_${Date.now()}@teamcarrezza.com`]
      );
      partnerUser = { id: tempId, name: "Test Colleague" };
    }

    // 3. Create Public Channel
    console.log("\n2. Channel Creation & Message Dispatch:");
    const createChannelRes = await fetch(`${baseUrl}/chat/channels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "test-announcements",
        displayName: "Test Announcements",
        description: "Integration test channel",
        companyId: companyId
      })
    });
    const channelData = await createChannelRes.json();
    assert("POST /chat/channels creates channel with 201 Created", createChannelRes.status === 201);
    const channelId = channelData.id;

    // 4. Send Message to Channel with Attachment
    const sendMsgRes = await fetch(`${baseUrl}/chat/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        channelId: channelId,
        content: "Welcome to the real-time Team Hub!",
        attachments: [
          {
            url: "https://example.com/spec.pdf",
            name: "spec.pdf",
            type: "application/pdf"
          }
        ]
      })
    });
    const sentMsg = await sendMsgRes.json();
    assert("POST /chat/messages sends message with 201 Created", sendMsgRes.status === 201);
    assert("Message contains file attachment payload", Boolean(sentMsg.fileData?.url));

    // 5. Pin Message in Channel
    console.log("\n3. Pin Message API Test:");
    const pinRes = await fetch(`${baseUrl}/chat/messages/${sentMsg.id}/pin`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        isPinned: true,
        pinDurationDays: 7
      })
    });
    const pinnedMsg = await pinRes.json();
    assert("PATCH /chat/messages/:id/pin returns 200 OK", pinRes.status === 200);
    assert("Message reflects pinned status and expiry", pinnedMsg.isPinned === true && Boolean(pinnedMsg.pinExpiresAt));

    // 6. Direct Message Thread Creation
    console.log("\n4. Direct Message (DM) Thread & Automated Notification:");
    const createDmRes = await fetch(`${baseUrl}/chat/dm-threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        participants: [adminUser.id, partnerUser.id],
        companyId: companyId
      })
    });
    const dmThread = await createDmRes.json();
    assert("POST /chat/dm-threads creates DM thread with 201 Created", createDmRes.status === 201);
    const threadId = dmThread.id;

    // 7. Send Direct Message (Should trigger automatic in-app notification for partner)
    const sendDmRes = await fetch(`${baseUrl}/chat/dm-messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        threadId: threadId,
        content: "Hey, check out the Phase 6 test suite!"
      })
    });
    const sentDm = await sendDmRes.json();
    assert("POST /chat/dm-messages returns 201 Created", sendDmRes.status === 201);

    // 8. Verify Partner received notification in database
    const partnerNotifRes = await query(
      "SELECT * FROM notifications WHERE user_id = $1 AND type = 'message' ORDER BY created_at DESC LIMIT 1",
      [partnerUser.id]
    );
    assert("Recipient automatically received in-app notification for DM", partnerNotifRes.rows.length > 0);
    if (partnerNotifRes.rows.length > 0) {
      assert("Notification contains sender name and preview", partnerNotifRes.rows[0].title.includes(adminUser.name));
    }

    // 9. Read Receipt Update
    console.log("\n5. Read Receipt API Test:");
    const readReceiptRes = await fetch(`${baseUrl}/chat/read-receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        userId: adminUser.id,
        threadId: threadId,
        readAt: new Date().toISOString()
      })
    });
    const readData = await readReceiptRes.json();
    assert("POST /chat/read-receipt returns 200 OK", readReceiptRes.status === 200);
    assert("Read receipt acknowledges threadId and readAt", readData.success === true && Boolean(readData.readAt));

    // 10. Multi-Tenant DM Privacy Check
    console.log("\n6. Privacy Enforcement (Non-Participant Block):");
    const outsiderToken = jwt.sign(
      { id: "usr_outsider_999", email: "outsider@othercomp.com", role: "employee", companyId: "other_comp" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const outsiderDmRes = await fetch(`${baseUrl}/chat/dm-threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${outsiderToken}` }
    });
    assert("Outsider is blocked from reading private DM thread history (403/404)", outsiderDmRes.status === 403 || outsiderDmRes.status === 404);

    // Cleanup Test Channel & Thread
    console.log("\n7. Cleanup:");
    await query("DELETE FROM messages WHERE channel_id = $1", [channelId]).catch(() => {});
    await query("DELETE FROM channels WHERE id = $1", [channelId]).catch(() => {});
    await query("DELETE FROM direct_messages WHERE thread_id = $1", [threadId]).catch(() => {});
    await query("DELETE FROM dm_threads WHERE id = $1", [threadId]).catch(() => {});
    await query("DELETE FROM notifications WHERE user_id = $1 AND type = 'message'", [partnerUser.id]).catch(() => {});

    console.log("\n==================================================");
    console.log(`📊 PHASE 6 VERIFICATION: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase6Tests();
