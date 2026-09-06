/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        matter: {
          bg: "#090D16",
          panel: "#0F172A",
          card: "#1E293B",
          border: "#334155",
          accent: "#10B981",
          accentSoft: "#6EE7B7",
        },
      },
      boxShadow: {
        "matter-card": "0 12px 40px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};
