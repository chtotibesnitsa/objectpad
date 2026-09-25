import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Expose both VITE_* (Vite default) and EXPO_PUBLIC_* (Rork's cross-platform
  // public-env convention, written by tools like getOrCreateAuthConfig).
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // The wallet SDKs emit hundreds of tiny lazy chunks, which makes
        // deploy uploads flaky. Collapse everything into one bundle.
        inlineDynamicImports: true,
      },
    },
  },
}));
