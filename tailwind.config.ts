import type { Config } from "tailwindcss";

// MediaMint brand teal is the only accent color in the app (per HRBP
// request — "do not use default colours"). Red/amber stay strictly
// semantic (exits/risk, attention/blocked) and are never used as a brand
// accent. Swap `teal.DEFAULT`/`teal.ink` for MediaMint's exact hex once
// provided — everything else derives from these two.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class", // opt-in only — the dashboard is deliberately light/white-mode
  theme: {
    extend: {
      colors: {
        teal: {
          soft: "#e2f0ee",
          softBorder: "#bcdad5",
          DEFAULT: "#0e6b62",
          ink: "#063f39",
        },
        risk: {
          red: "#ac4327",
          redSoft: "#f7e7e1",
          amber: "#93650f",
          amberSoft: "#f5edda",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#eaeeec",
        },
        ink: {
          DEFAULT: "#16211d",
          muted: "#57655f",
          faint: "#8a9691",
        },
        line: {
          DEFAULT: "#dbe2df",
          soft: "#e7ebe9",
        },
      },
      fontFamily: {
        display: ["Archivo", "IBM Plex Sans", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
