/**
 * Tests that the process exits naturally after unmount — no process.exit(0) needed.
 *
 * Spawns real subprocesses because the event loop hang can only be detected
 * by checking whether the Node/Bun process actually terminates.
 */
import { describe, it, expect } from "vitest"
import { spawn } from "child_process"
import path from "path"

const TIMEOUT_MS = 5_000

function runScript(code: string): Promise<{ exitCode: number | null; timedOut: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["--eval", code], {
      cwd: path.resolve(import.meta.dirname, ".."),
      timeout: TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stderr = ""
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()))

    let timedOut = false
    child.on("error", () => {})
    child.on("close", (code) => {
      resolve({ exitCode: code, timedOut, stderr })
    })

    // If the process doesn't exit in time, kill it
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, TIMEOUT_MS)
    timer.unref()

    child.on("close", () => clearTimeout(timer))
  })
}

describe("event loop cleanup", () => {
  // Headless mode: cols + rows provided → mock stdin, no real I/O
  it("run() headless — process exits after unmount", async () => {
    const result = await runScript(`
      import React from "react";
      import { Text } from "./src/index.js";
      import { run } from "./src/runtime/run.js";
      const handle = await run(React.createElement(Text, null, "hi"), { cols: 80, rows: 24 });
      handle.unmount();
      await handle.waitUntilExit();
    `)
    expect(result.timedOut, `process hung (event loop not released)\n${result.stderr}`).toBe(false)
    expect(result.exitCode).toBe(0)
  })

  it("createApp() headless — process exits after unmount", async () => {
    const result = await runScript(`
      import React from "react";
      import { Text } from "./src/index.js";
      import { createApp } from "./src/runtime/create-app.js";
      const app = createApp(() => (_set, _get) => ({}));
      function App() { return React.createElement(Text, null, "hi"); }
      const handle = await app.run(React.createElement(App), { cols: 80, rows: 24 });
      handle.unmount();
      await handle.waitUntilExit();
    `)
    expect(result.timedOut, `process hung (event loop not released)\n${result.stderr}`).toBe(false)
    expect(result.exitCode).toBe(0)
  })

  // Non-headless mode with piped stdin (the actual bug scenario: CI, subprocess, tests).
  // stdin is a pipe (not TTY) so termProvider attaches stdin.on("data") unconditionally.
  // The fix ensures stdin.pause() is always called during cleanup.
  it("run() non-headless with piped stdin — process exits after unmount", async () => {
    const result = await runScript(`
      import React from "react";
      import { Text } from "./src/index.js";
      import { run } from "./src/runtime/run.js";
      const handle = await run(React.createElement(Text, null, "hi"));
      handle.unmount();
      await handle.waitUntilExit();
    `)
    expect(result.timedOut, `process hung (event loop not released)\n${result.stderr}`).toBe(false)
    expect(result.exitCode).toBe(0)
  })

  it("createApp() non-headless with piped stdin — process exits after unmount", async () => {
    const result = await runScript(`
      import React from "react";
      import { Text } from "./src/index.js";
      import { createApp } from "./src/runtime/create-app.js";
      const app = createApp(() => (_set, _get) => ({}));
      function App() { return React.createElement(Text, null, "hi"); }
      const handle = await app.run(React.createElement(App));
      handle.unmount();
      await handle.waitUntilExit();
    `)
    expect(result.timedOut, `process hung (event loop not released)\n${result.stderr}`).toBe(false)
    expect(result.exitCode).toBe(0)
  })

  // Component with setInterval — useEffect cleanup must fire on unmount
  // to clear the timer. Without React tree unmount, the interval keeps
  // the event loop alive and the process hangs.
  it("run() with useEffect timers — process exits after unmount", async () => {
    const result = await runScript(`
      import React, { useState, useEffect } from "react";
      import { Text } from "./src/index.js";
      import { run } from "./src/runtime/run.js";
      function App() {
        const [count, setCount] = useState(0);
        useEffect(() => {
          const timer = setInterval(() => setCount(c => c + 1), 100);
          return () => clearInterval(timer);
        }, []);
        return React.createElement(Text, null, "count: " + count);
      }
      const handle = await run(React.createElement(App), { cols: 80, rows: 24 });
      handle.unmount();
      await handle.waitUntilExit();
    `)
    expect(result.timedOut, `process hung — useEffect cleanup didn't fire\n${result.stderr}`).toBe(false)
    expect(result.exitCode).toBe(0)
  })
})
