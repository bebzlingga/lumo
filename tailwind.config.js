/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        lumo: {
          canvas: "#FAF8F1",
          card: "#FFFDF8",
          surface: "#F4EEDF",
          ink: "#172016",
          muted: "#77786D",
          green: "#4E9B62",
          "green-dark": "#245E38",
          glow: "#F4C95D"
        }
      },
      borderRadius: {
        lumo: "12px"
      }
    }
  },
  plugins: []
};
