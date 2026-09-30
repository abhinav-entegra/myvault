"use strict";

/**
 * Procedural exact dashboard logo generation for icons.
 * Run: `node scripts/generate-app-icon.cjs` or `npm run generate-icons`
 */

const { execSync } = require("child_process");
const path = require("path");

console.log("Generating app icons matching dashboard logo...");
execSync("npx electron scripts/render-logo.cjs", {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
});
