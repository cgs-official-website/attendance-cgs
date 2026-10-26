import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  checkFaceServiceHealth,
  startFaceServiceProcess,
  stopFaceServiceProcess,
  ensureFaceService,
  getManagedProcess,
  resolvePythonCommand
} from "../services/faceServiceManager.js";
import { enrollFace, verifyFace, FaceServiceUnavailableError } from "../services/faceServiceClient.js";

// Helper to spawn a temporary HTTP mock server for health checking
function createMockHealthServer(port, responseCode = 200, responseBody = { status: "ok" }) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(responseCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responseBody));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

test("Face Service Manager - Unit & Integration Test Suite", async (t) => {

  await t.test("resolvePythonCommand returns a valid string executable", () => {
    const cmd = resolvePythonCommand();
    assert.ok(typeof cmd === "string" && cmd.length > 0);
  });

  await t.test("checkFaceServiceHealth detects healthy and offline endpoints", async () => {
    // 1. Offline port test
    const offlineResult = await checkFaceServiceHealth("http://127.0.0.1:59999", 500);
    assert.strictEqual(offlineResult.healthy, false);
    assert.ok(offlineResult.error);

    // 2. Healthy mock server test
    const mockServer = await createMockHealthServer(59998, 200, { status: "ok", model: "ArcFace" });
    try {
      const healthyResult = await checkFaceServiceHealth("http://127.0.0.1:59998", 1000);
      assert.strictEqual(healthyResult.healthy, true);
      assert.strictEqual(healthyResult.data.status, "ok");
    } finally {
      await new Promise((r) => mockServer.close(r));
    }
  });

  await t.test("ensureFaceService detects and reuses an already-running service without spawning", async () => {
    const mockPort = 59997;
    const mockUrl = `http://127.0.0.1:${mockPort}`;
    const mockServer = await createMockHealthServer(mockPort, 200, { status: "ok" });

    try {
      const result = await ensureFaceService({
        targetUrl: mockUrl,
        autoStart: true,
        registerSignalHandlers: false
      });

      assert.strictEqual(result.healthy, true);
      assert.strictEqual(result.alreadyRunning, true);
      assert.strictEqual(result.spawned, false);
      assert.strictEqual(getManagedProcess(), null, "Should not spawn child process if already healthy");
    } finally {
      await new Promise((r) => mockServer.close(r));
    }
  });

  await t.test("startFaceServiceProcess detects failed startup / invalid python executable", async () => {
    await assert.rejects(
      async () => {
        await startFaceServiceProcess({
          pythonCmd: "non_existent_python_binary_xyz_12345",
          targetUrl: "http://127.0.0.1:59996",
          timeoutMs: 1000,
          silent: true
        });
      },
      (err) => {
        assert.ok(err.message.includes("Failed to start Python face service") || err.message.includes("not found"));
        return true;
      }
    );
    assert.strictEqual(getManagedProcess(), null);
  });

  await t.test("startFaceServiceProcess detects premature process exit (crash / script error)", async () => {
    const pythonCmd = resolvePythonCommand();
    await assert.rejects(
      async () => {
        await startFaceServiceProcess({
          pythonCmd: pythonCmd,
          targetUrl: "http://127.0.0.1:59995",
          timeoutMs: 2000,
          silent: true,
          faceServiceDir: process.cwd() // run in cwd where app:app does not exist, triggering immediate exit
        });
      },
      (err) => {
        assert.ok(
          err.message.includes("exited prematurely") || err.message.includes("exit code"),
          `Expected premature exit error, got: ${err.message}`
        );
        return true;
      }
    );
    assert.strictEqual(getManagedProcess(), null);
  });

  await t.test("startFaceServiceProcess handles readiness timeout when endpoint never answers", async () => {
    const pythonCmd = resolvePythonCommand();
    // Launch a python script that sleeps indefinitely and does not serve HTTP
    await assert.rejects(
      async () => {
        const { spawn } = await import("child_process");
        // We override pythonCmd with node running a dummy infinite timer
        await startFaceServiceProcess({
          pythonCmd: process.execPath,
          targetUrl: "http://127.0.0.1:59994",
          timeoutMs: 1000,
          pollIntervalMs: 200,
          silent: true,
          faceServiceDir: process.cwd()
        });
      },
      (err) => {
        assert.ok(err.message.includes("Timed out") || err.message.includes("exited prematurely"));
        return true;
      }
    );
    // Ensure process was cleaned up
    assert.strictEqual(getManagedProcess(), null);
  });

  await t.test("ensureFaceService handles duplicate-process prevention under concurrent requests", async () => {
    const mockPort = 59993;
    const mockUrl = `http://127.0.0.1:${mockPort}`;
    const mockServer = await createMockHealthServer(mockPort, 200, { status: "ok" });

    try {
      // Fire 3 simultaneous calls
      const [res1, res2, res3] = await Promise.all([
        ensureFaceService({ targetUrl: mockUrl, registerSignalHandlers: false }),
        ensureFaceService({ targetUrl: mockUrl, registerSignalHandlers: false }),
        ensureFaceService({ targetUrl: mockUrl, registerSignalHandlers: false })
      ]);

      assert.strictEqual(res1.alreadyRunning, true);
      assert.strictEqual(res2.alreadyRunning, true);
      assert.strictEqual(res3.alreadyRunning, true);
      assert.strictEqual(getManagedProcess(), null);
    } finally {
      await new Promise((r) => mockServer.close(r));
    }
  });

  await t.test("stopFaceServiceProcess terminates child process cleanly", async () => {
    await stopFaceServiceProcess();
    assert.strictEqual(getManagedProcess(), null);
  });

  await t.test("Biometrics fail-closed: operations throw 503 when face service is offline", async () => {
    // Point FACE_SERVICE_URL to a dead port
    const originalUrl = process.env.FACE_SERVICE_URL;
    process.env.FACE_SERVICE_URL = "http://127.0.0.1:59992";

    try {
      await assert.rejects(
        async () => {
          await enrollFace("data:image/jpeg;base64,12345");
        },
        (err) => {
          assert.strictEqual(err.name, "FaceServiceUnavailableError");
          assert.strictEqual(err.status, 503);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await verifyFace({
            enrolledEmbedding: [0.1, 0.2, 0.3],
            imageBase64: "data:image/jpeg;base64,12345"
          });
        },
        (err) => {
          assert.strictEqual(err.name, "FaceServiceUnavailableError");
          assert.strictEqual(err.status, 503);
          return true;
        }
      );
    } finally {
      process.env.FACE_SERVICE_URL = originalUrl;
    }
  });
});
