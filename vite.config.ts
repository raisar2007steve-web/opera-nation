import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: [".style.dev"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@babylonjs")) return "babylon";
          return undefined;
        },
      },
    },
  },
});
