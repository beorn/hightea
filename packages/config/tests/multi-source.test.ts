import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.ts"
import type { Config } from "../src/types.ts"

let tmpDir: string
let projectDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvery-config-multi-"))
  projectDir = join(tmpDir, "project")
  await mkdir(join(projectDir, "subdir/nested"), { recursive: true })
  await mkdir(join(projectDir, ".testapp"), { recursive: true })
})

describe("multi-source — discovery", () => {
  it("requires either path or appName", async () => {
    await expect(loadConfig({} as never)).rejects.toThrow(/path.*appName/)
  })

  it("loads global from explicit globalPath", async () => {
    const globalPath = join(tmpDir, "global.yaml")
    await writeFile(globalPath, "ai:\n  acp:\n    default: from-global\n")
    const config = await loadConfig({ appName: "testapp", globalPath, searchProject: false })
    expect(config.get("ai.acp.default")).toBe("from-global")
    expect(config.globalPath).toBe(globalPath)
    expect(config.projectPath).toBeNull()
    config.unwatch()
  })

  it("walks up from cwd to find project config", async () => {
    const projectFile = join(projectDir, ".testapp", "config.yaml")
    await writeFile(projectFile, "ai:\n  acp:\n    default: from-project\n")
    const cwd = join(projectDir, "subdir/nested")
    const config = await loadConfig({
      appName: "testapp",
      cwd,
      globalPath: join(tmpDir, "no-global.yaml"),
      createIfMissing: true,
    })
    expect(config.get("ai.acp.default")).toBe("from-project")
    expect(config.projectPath).toBe(projectFile)
    config.unwatch()
  })

  it("merges global + project with project taking precedence", async () => {
    const globalPath = join(tmpDir, "global.yaml")
    const projectFile = join(projectDir, ".testapp", "config.yaml")
    await writeFile(
      globalPath,
      `ai:
  acp:
    default: from-global
    claude-work: "claude-code?account=work"
    codex: "codex"
`,
    )
    await writeFile(
      projectFile,
      `ai:
  acp:
    default: from-project
    project-only: "gemini?model=2.5-pro"
`,
    )
    const config = await loadConfig({
      appName: "testapp",
      cwd: projectDir,
      globalPath,
    })
    // Project overrides global default
    expect(config.get("ai.acp.default")).toBe("from-project")
    // Global-only entries still visible
    expect(config.get("ai.acp.claude-work")).toBe("claude-code?account=work")
    expect(config.get("ai.acp.codex")).toBe("codex")
    // Project-only entries visible
    expect(config.get("ai.acp.project-only")).toBe("gemini?model=2.5-pro")
    config.unwatch()
  })

  it("works with no project config found", async () => {
    const globalPath = join(tmpDir, "global.yaml")
    await writeFile(globalPath, "ai:\n  acp:\n    default: solo\n")
    const config = await loadConfig({
      appName: "testapp",
      cwd: projectDir,
      globalPath,
    })
    expect(config.get("ai.acp.default")).toBe("solo")
    expect(config.projectPath).toBeNull()
    config.unwatch()
  })

  it("respects searchProject: false", async () => {
    const projectFile = join(projectDir, ".testapp", "config.yaml")
    await writeFile(projectFile, "ai:\n  acp:\n    default: should-be-ignored\n")
    const globalPath = join(tmpDir, "global.yaml")
    await writeFile(globalPath, "ai:\n  acp:\n    default: from-global\n")
    const config = await loadConfig({
      appName: "testapp",
      cwd: projectDir,
      globalPath,
      searchProject: false,
    })
    expect(config.get("ai.acp.default")).toBe("from-global")
    expect(config.projectPath).toBeNull()
    config.unwatch()
  })
})

describe("multi-source — scoped writes", () => {
  let config: Config
  let globalPath: string
  let projectFile: string

  beforeEach(async () => {
    globalPath = join(tmpDir, "global.yaml")
    projectFile = join(projectDir, ".testapp", "config.yaml")
    await writeFile(globalPath, "ai:\n  acp:\n    default: from-global\n")
    await writeFile(projectFile, "ai:\n  acp:\n    only-in-project: foo\n")
    config = await loadConfig({
      appName: "testapp",
      cwd: projectDir,
      globalPath,
    })
  })

  afterEach(() => {
    config.unwatch()
  })

  it("set without scope defaults to global", async () => {
    config.set("ai.acp.new-key", "global-value")
    await config.save()
    const text = await readFile(globalPath, "utf8")
    expect(text).toContain("new-key: global-value")
    const projectText = await readFile(projectFile, "utf8")
    expect(projectText).not.toContain("new-key")
  })

  it("set with scope: 'local' writes to project file", async () => {
    config.set("ai.acp.local-key", "project-value", "local")
    await config.save({ scope: "local" })
    const projectText = await readFile(projectFile, "utf8")
    expect(projectText).toContain("local-key: project-value")
    const globalText = await readFile(globalPath, "utf8")
    expect(globalText).not.toContain("local-key")
  })

  it("set local then global writes to both files independently", async () => {
    config.set("ai.acp.global-only", "g", "global")
    config.set("ai.acp.local-only", "l", "local")
    await config.save({ scope: "global" })
    await config.save({ scope: "local" })
    const g = await readFile(globalPath, "utf8")
    const p = await readFile(projectFile, "utf8")
    expect(g).toContain("global-only: g")
    expect(g).not.toContain("local-only")
    expect(p).toContain("local-only: l")
    expect(p).not.toContain("global-only")
  })

  it("project value overrides global in get()", async () => {
    config.set("ai.acp.contested", "global-wins", "global")
    config.set("ai.acp.contested", "project-wins", "local")
    expect(config.get("ai.acp.contested")).toBe("project-wins")
  })

  it("unset with scope only removes from that source", async () => {
    config.set("ai.acp.shared", "g-value", "global")
    config.set("ai.acp.shared", "p-value", "local")
    expect(config.get("ai.acp.shared")).toBe("p-value")
    config.unset("ai.acp.shared", "local")
    expect(config.get("ai.acp.shared")).toBe("g-value")
  })
})

describe("multi-source — lazy project file creation", () => {
  it("creates project file on first --local write when none existed", async () => {
    const globalPath = join(tmpDir, "global.yaml")
    await writeFile(globalPath, "ai:\n  acp:\n    default: g\n")
    const config = await loadConfig({
      appName: "testapp",
      cwd: projectDir,
      globalPath,
    })
    expect(config.projectPath).toBeNull()
    config.set("ai.acp.new", "local-value", "local")
    expect(config.projectPath).not.toBeNull()
    expect(config.projectPath!).toContain(".testapp/config.yaml")
    await config.save({ scope: "local" })
    const text = await readFile(config.projectPath!, "utf8")
    expect(text).toContain("new: local-value")
    config.unwatch()
  })
})
