import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});

