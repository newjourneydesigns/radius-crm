import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: "#0C2B1C",
        "felt-2": "#143824",
        "felt-3": "#1C4530",
        card: "#F5EFDE",
        "card-ink": "#252B20",
        "card-dim": "#6B7261",
        ink: "#EFE9D8",
        "ink-dim": "#9FB3A3",
        gold: "#E4B454",
        "gold-deep": "#B98A2F",
        ember: "#CE5B4E",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        chip: "0 6px 0 0 #B98A2F, 0 14px 24px rgba(0,0,0,.45)",
        "chip-down": "0 2px 0 0 #B98A2F, 0 6px 12px rgba(0,0,0,.45)",
        cardstock: "0 2px 0 rgba(0,0,0,.25), 0 10px 26px rgba(0,0,0,.35)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(228,180,84,.55)" },
          "80%": { boxShadow: "0 0 0 22px rgba(228,180,84,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(228,180,84,0)" },
        },
        "deal-in": {
          from: { opacity: "0", transform: "translateY(14px) rotate(-1deg)" },
          to: { opacity: "1", transform: "translateY(0) rotate(0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
        "deal-in": "deal-in .35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
