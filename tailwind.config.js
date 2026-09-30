/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./renderer/index.html", "./renderer/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: "#ffffff",
          sunken: "#f4f4f5",
          surface: "#ffffff",
          elevated: "#ffffff",
          border: "#e4e4e7",
          borderStrong: "#d4d4d8",
          muted: "#71717a",
          text: "#18181b",
          accent: "#f97316",
          accentDeep: "#ea580c",
          accentSoft: "rgba(249, 115, 22, 0.10)",
          warm: "#f59e0b",
          warmSoft: "rgba(245, 158, 11, 0.12)",
          danger: "#ef4444",
          success: "#10b981",
        },
        apple: {
          blue: "#f97316",
          green: "#10b981",
          yellow: "#f59e0b",
          red: "#ef4444",
        },
        g: {
          blue: "#f97316",
          green: "#10b981",
          yellow: "#f59e0b",
          red: "#ef4444",
        },
      },
      fontFamily: {
        sans: [
          "Instrument Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        hand: ["Caveat", "cursive"],
      },
      boxShadow: {
        card: "0 10px 30px -10px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        lift: "0 20px 40px -15px rgba(249, 115, 22, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06)",
        modal: "0 35px 90px -20px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.9)",
        accent: "0 10px 28px -8px rgba(249, 115, 22, 0.35)",
        warm: "0 10px 28px -8px rgba(245, 158, 11, 0.35)",
      },
      backdropBlur: {
        vault: "20px",
      },
      transitionTimingFunction: {
        vault: "cubic-bezier(0.25, 0.8, 0.25, 1)",
      },
      keyframes: {
        "vault-rise": {
          from: { opacity: "0", transform: "translateY(16px)", filter: "blur(8px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
        "vault-word-in": {
          from: { opacity: "0", transform: "translateY(110%)", filter: "blur(6px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
        "vault-modal-in": {
          from: { opacity: "0", transform: "translateY(18px) scale(0.985)", filter: "blur(6px)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)", filter: "blur(0)" },
        },
        "vault-toast-in": {
          from: { opacity: "0", transform: "translate(-50%, 12px)", filter: "blur(4px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)", filter: "blur(0)" },
        },
      },
      animation: {
        "vault-rise": "vault-rise 0.7s cubic-bezier(0.25, 0.8, 0.25, 1) both",
        "vault-modal": "vault-modal-in 0.32s cubic-bezier(0.25, 0.8, 0.25, 1) both",
        "vault-toast": "vault-toast-in 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) both",
      },
    },
  },
  plugins: [],
};
