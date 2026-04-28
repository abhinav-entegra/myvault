/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./renderer/index.html", "./renderer/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: "#f5f5f7",
          surface: "rgba(255,255,255,0.72)",
          elevated: "#ffffff",
          border: "rgba(0,0,0,0.08)",
          borderStrong: "rgba(0,0,0,0.12)",
          muted: "#6e6e73",
          text: "#1d1d1f",
          accent: "#007aff",
        },
        apple: {
          blue: "#007aff",
          green: "#34c759",
          indigo: "#5856d6",
          orange: "#ff9500",
          pink: "#ff2d55",
          purple: "#af52de",
          red: "#ff3b30",
          teal: "#5ac8fa",
          yellow: "#ffcc00",
        },
        g: {
          blue: "#4285f4",
          red: "#ea4335",
          yellow: "#fbbc05",
          green: "#34a853",
        },
      },
      fontFamily: {
        sans: [
          "Poppins",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        float: "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      backdropBlur: {
        vault: "20px",
      },
    },
  },
  plugins: [],
};
