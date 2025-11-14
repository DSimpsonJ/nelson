/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
      },
      keyframes: {
        "fade-in-out": {
          "0%": { opacity: "0", transform: "translateY(-5px)" },
          "10%": { opacity: "1", transform: "translateY(0)" },
          "90%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(-5px)" },
        },
      },
      animation: {
        "fade-in-out": "fade-in-out 2.5s ease-in-out",
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        ".delay-0": { "animation-delay": "0s" },
        ".delay-200": { "animation-delay": "0.2s" },
        ".delay-400": { "animation-delay": "0.4s" },
        ".delay-600": { "animation-delay": "0.6s" },
        ".delay-800": { "animation-delay": "0.8s" },
      });
    },
  ],
};