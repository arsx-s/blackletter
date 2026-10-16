import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Loopback by default. This server proxies /api to the relay, which holds
    // the provider credential, so binding every interface would publish that
    // relay to the local network. Set BLACKLETTER_DEV_HOST to widen it
    // deliberately.
    host: process.env.BLACKLETTER_DEV_HOST || "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  preview: {
    host: process.env.BLACKLETTER_DEV_HOST || "127.0.0.1",
    port: 4173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          graph: ["reactflow"],
        },
      },
    },
  },
});
