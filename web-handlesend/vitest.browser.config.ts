import path from "path";

import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@tanstack/react-query', '@hookform/resolvers/zod', '@nkzw/create-context-hook', '@privy-io/react-auth', 'react-hook-form', 'sonner', 'viem/chains', 'zod'] },
  test: {
    globals: true,
    include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
