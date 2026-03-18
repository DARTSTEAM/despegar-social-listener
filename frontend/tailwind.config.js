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
          orange: "#ff7e4b",
          blue: "#0070f3",
          pink: "#ff0080",
          lemon: "#ccff00",
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
          'to': { transform: 'translate(100px, 50px) scale(1.1)' },
        }
      }
    },
  },
  plugins: [],
}
