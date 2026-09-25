import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Heavy libraries that only lazy screens need: kept out of the first download so phones start fast. */
const THREE = /node_modules[\\/](three|three-stdlib|@react-three|troika-[^\\/]+|maath|camera-controls|meshline|stats-gl|detect-gpu|@monogrid|@mediapipe|hls\.js|its-fine|suspend-react|react-reconciler|react-use-measure|tunnel-rat|zustand)[\\/]/;
const WALLET = /node_modules[\\/](@privy-io|@walletconnect|@reown|@coinbase|@metamask|@wagmi|wagmi|@solana|@solana-program|@safe-global|@base-org|@hcaptcha|@marsidev|libphonenumber-js|@lit|lit|lit-html|lit-element|@simplewebauthn|jose|@headlessui|@heroicons|@floating-ui|styled-components|@emotion|mipd|x402)[\\/]/;
/** On-chain reads used by coin pages and the ticker (viem and its crypto deps): shared, cached separately. */
const CHAIN = /node_modules[\\/](viem|ox|abitype|@noble|@scure|isows|ws)[\\/]/;

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
  // Expose both VITE_* (Vite default) and EXPO_PUBLIC_* (cross-platform public-env convention).
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // A few large, cacheable chunks instead of one 6 MB file: 3D and wallet code load only when a screen needs them.
        // Everything else small is merged so the deploy never has hundreds of tiny files.
        advancedChunks: {
          minSize: 40_000,
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@tanstack|lucide-react|clsx|tailwind-merge|@nkzw)[\\/]/, priority: 50 },
            { name: "three", test: THREE, priority: 30 },
            { name: "wallet", test: WALLET, priority: 20 },
            { name: "chain", test: CHAIN, priority: 25 },
          ],
        },
      },
    },
  },
}));
