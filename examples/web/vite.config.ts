import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

const stub = resolve(__dirname, "stubs/node.js")

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": "{}",
    "process.stdout": "undefined",
    "process.stderr": "undefined",
  },
  build: { target: "esnext" },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@resvg/resvg-js"],
  },
  resolve: {
    alias: {
      "@resvg/resvg-js": stub,
      child_process: stub,
      fs: stub,
      os: stub,
      path: stub,
      tty: stub,
      "node:child_process": stub,
      "node:fs": stub,
      "node:os": stub,
      "node:path": stub,
      "node:tty": stub,
    },
  },
})
