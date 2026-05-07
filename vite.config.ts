import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiTarget = env.VITE_PROXY_TARGET ?? "http://localhost:8787";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          frame: new URL("./widget/frame.html", import.meta.url).pathname,
          supportly: new URL("./src/loader/supportly.ts", import.meta.url).pathname,
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === "supportly" ? "widget/supportly.js" : "widget/assets/[name]-[hash].js",
          chunkFileNames: "widget/assets/[name]-[hash].js",
          assetFileNames: "widget/assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
