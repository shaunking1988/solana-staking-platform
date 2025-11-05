/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // always dark, no system light mode
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          700: "#1E293B", // muted blue-gray
          800: "#16213E", // deeper blue
          850: "#0F1B33", // custom mid-dark blue
          900: "#0A0F1F", // almost black navy
        },
        accent: {
          blue: "#2563EB", // vivid blue
          green: "#10B981", // rewards green
          purple: "#7C3AED", // optional accent
        },
      },
    },
  },
  plugins: [],
};
