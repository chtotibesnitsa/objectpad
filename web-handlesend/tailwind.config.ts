import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pearl canvas and graphite ink. Green and red only for live data. Everything else is greyscale glass.
        paper: "#ECEEF1",
        ink: "#0C0D10",
        graphite: "#1B1D22",
        obsidian: "#0B0C0F",
        stone: "#E6E8EC",
        line: "#DADDE3",
        muted: "#6A6E78",
        signal: "#1B1D22",
        azure: "#4A5261",
        up: "#12A150",
        down: "#E5484D",
        // Legacy token names, remapped to the calm palette so no page falls back to neon.
        sky: "#E4E9F2",
        moss: "#12A150",
        clay: "#E5484D",
        ember: "#1B1D22",
        lime: "#E8EAEE",
        volt: "#1B1D22",
        pink: "#1B1D22",
        iris: "#6A6E78",
        amber: "#6A6E78",
        aqua: "#9AA3B2",
        blush: "#C9CED8",
      },
      fontFamily: {
        display: ["Anybody", "Geist", "Arial", "sans-serif"],
        sans: ["Geist", "Arial", "Helvetica Neue", "sans-serif"],
        mono: ["Geist Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      borderRadius: { "4xl": "2rem", "5xl": "2.5rem" },
      boxShadow: {
        float: "0 30px 80px -40px rgba(20,24,40,.35), 0 2px 6px rgba(12,13,16,.05)",
        glass: "inset 0 1px 0 rgba(255,255,255,.95), 0 1px 2px rgba(12,13,16,.04), 0 18px 44px -24px rgba(20,24,40,.28)",
        glow: "0 0 0 1px rgba(255,255,255,.7), 0 12px 40px -12px rgba(20,24,40,.35)",
        lime: "0 12px 30px -14px rgba(12,13,16,.45)",
        // Legacy "brut" shadows now render as soft glass depth.
        brut: "inset 0 1px 0 rgba(255,255,255,.95), 0 18px 44px -24px rgba(20,24,40,.28)",
        "brut-lg": "inset 0 1px 0 rgba(255,255,255,.95), 0 30px 70px -34px rgba(20,24,40,.34)",
        "brut-sm": "0 1px 2px rgba(12,13,16,.06), 0 8px 18px -12px rgba(20,24,40,.25)",
      },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "marquee-rev": { from: { transform: "translateX(-50%)" }, to: { transform: "translateX(0)" } },
      },
      animation: {
        marquee: "marquee 70s linear infinite",
        "marquee-fast": "marquee 40s linear infinite",
        "marquee-rev": "marquee-rev 56s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
