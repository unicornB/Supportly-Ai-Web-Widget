import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8787";
const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        frame: resolve(rootDir, "widget/frame.html"),
        supportly: resolve(rootDir, "src/loader/supportly.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "supportly" ? "widget/supportly.js" : "widget/assets/[name]-[hash].js",
        chunkFileNames: "widget/assets/[name]-[hash].js",
        assetFileNames: "widget/assets/[name]-[hash][extname]",
      },
    },
  },
});
