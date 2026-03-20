/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          orange: "#9b72f5",
          blue:   "#3d8ef0",
          pink:   "#f72585",   /* vivid magenta */
          lemon:  "#b5ea2e",   /* warm yellow-green */
        },
        bg: "var(--bg)",
        fg: "var(--fg)",
      },
      animation: {
        'floating': 'floating 20s infinite alternate',
      },
      keyframes: {
        floating: {
          'from': { transform: 'translate(0, 0) scale(1)' },
          'to':   { transform: 'translate(100px, 50px) scale(1.1)' },
        }
      }
    },
  },
  plugins: [],
}
