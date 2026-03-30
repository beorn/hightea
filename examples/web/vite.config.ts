import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

const stub = resolve(__dirname, "stubs/node.js")

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@resvg/resvg-js"],
  },
  resolve: {
    alias: {
      // Only @resvg/resvg-js still needs a stub (native binary, not available in browser).
      // child_process, fs, os, tty, and process.env/stdout stubs are no longer needed —
      // silvery's canvas path uses lazy imports and typeof guards for all Node.js APIs.
      "@resvg/resvg-js": stub,
    },
  },
})
