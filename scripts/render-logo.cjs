const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
    },
  });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 512px; height: 512px; background: transparent; overflow: hidden; }
</style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" fill="none">
    <defs>
      <linearGradient id="mv-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fb923c" />
        <stop offset="50%" stop-color="#f97316" />
        <stop offset="100%" stop-color="#ea580c" />
      </linearGradient>
      <filter id="mv-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#c2410c" flood-opacity="0.32" />
      </filter>
    </defs>
    <rect width="32" height="32" rx="7" fill="#ffffff" />
    <g filter="url(#mv-logo-shadow)">
      <path
        d="M16 2.8C16.8 7.6 18.5 10 23.5 10.8C18.5 11.6 16.8 14 16 18.8C15.2 14 13.5 11.6 8.5 10.8C13.5 10 15.2 7.6 16 2.8Z"
        fill="url(#mv-logo-grad)"
      />
      <path
        d="M23.5 10.8C22.6 15.6 24.1 18.2 28.5 20.6C23.8 21.4 21.4 23.8 20.6 28.5C19.8 23.8 17.4 21.4 12.7 20.6C17.1 18.2 18.6 15.6 17.8 10.8C20.5 13.1 21.5 13.1 23.5 10.8Z"
        fill="url(#mv-logo-grad)"
        opacity="0.9"
      />
      <path
        d="M8.5 10.8C11.2 13.1 12.2 13.1 14.9 10.8C14.1 15.6 15.6 18.2 20 20.6C15.3 21.4 12.9 23.8 12.1 28.5C11.3 23.8 8.9 21.4 4.2 20.6C8.6 18.2 10.1 15.6 9.3 10.8"
        fill="url(#mv-logo-grad)"
        opacity="0.8"
      />
      <circle cx="16" cy="16" r="3" fill="#ffffff" />
      <circle cx="16" cy="16" r="1.5" fill="#ea580c" />
    </g>
  </svg>
</body>
</html>`;

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

  setTimeout(async () => {
    try {
      const img = await win.webContents.capturePage();
      const pngBuf = img.toPNG();
      
      const appIcon = path.join(__dirname, "..", "app", "icon.png");
      const pubIcon = path.join(__dirname, "..", "renderer", "public", "app-icon.png");
      const pubLogo = path.join(__dirname, "..", "renderer", "public", "logo-mark.png");
      const distLogo = path.join(__dirname, "..", "renderer-dist", "logo-mark.png");
      const distIcon = path.join(__dirname, "..", "renderer-dist", "app-icon.png");

      fs.writeFileSync(appIcon, pngBuf);
      fs.writeFileSync(pubIcon, pngBuf);
      fs.writeFileSync(pubLogo, pngBuf);
      if (fs.existsSync(path.dirname(distLogo))) {
        fs.writeFileSync(distLogo, pngBuf);
        fs.writeFileSync(distIcon, pngBuf);
      }
      console.log("RENDER SUCCESS: Exactly matched dashboard logo!");
    } catch (err) {
      console.error("RENDER FAILED:", err);
    } finally {
      app.quit();
    }
  }, 400);
});
