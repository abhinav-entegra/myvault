const path = require("path");

const react = require("@vitejs/plugin-react");

const { defineConfig } = require("vite");

module.exports = defineConfig({
  plugins: [react()],

  root: path.resolve(__dirname),

  base: "./",

  build: {
    outDir: path.resolve(__dirname, "..", "renderer-dist"),

    emptyDir: true,

    emptyOutDir: true,

    assetsDir: "assets",

    rollupOptions: {
      output: {
        manualChunks: undefined,

      },

    },

  },

  server: {
    host: "127.0.0.1",

    port: 5173,

    strictPort: true,

  },

});
