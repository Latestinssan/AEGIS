/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        abyss: {
          950: "#04050b",
          900: "#080a16",
          800: "#0d1122",
          700: "#141a33",
        },
        pulse: "#22d3ee",
        volt: "#a3e635",
        orchid: "#a78bfa",
        ember: "#fb923c",
        alarm: "#f43f5e",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        gridmove: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "48px 48px" },
        },
        scan: {
          "0%": { top: "-10%" },
          "100%": { top: "110%" },
        },
      },
      animation: {
        flicker: "flicker 2.4s ease-in-out infinite",
        floaty: "floaty 6s ease-in-out infinite",
        gridmove: "gridmove 1.2s linear infinite",
        scan: "scan 2.2s linear infinite",
      },
      boxShadow: {
        glow: "0 0 24px 0 rgba(34,211,238,0.35)",
        "glow-lg": "0 0 64px 0 rgba(34,211,238,0.25)",
        "glow-rose": "0 0 24px 0 rgba(244,63,94,0.35)",
        "glow-volt": "0 0 24px 0 rgba(163,230,53,0.35)",
      },
    },
  },
  plugins: [],
};