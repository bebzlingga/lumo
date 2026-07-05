import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Bright, friendly accent ramp (Duolingo-ish green) + supporting hues.
        brand: {
          50: "#eefdf3",
          100: "#d6f9e2",
          200: "#aff0c6",
          300: "#79e3a3",
          400: "#42cd7d",
          500: "#1eb862",
          600: "#12934e",
          700: "#127441",
          800: "#145c37",
          900: "#124b2f"
        }
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "sans-serif"
        ]
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(16, 24, 40, 0.25)",
        glow: "0 0 0 6px rgba(30, 184, 98, 0.16), 0 12px 34px -10px rgba(30, 184, 98, 0.55)"
      }
    }
  },
  plugins: []
} satisfies Config;
