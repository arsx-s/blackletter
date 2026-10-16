const { pathToFileURL } = require("url");

function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isTrustedRendererUrl(value, { isDev, appRoot }) {
  try {
    const url = new URL(value);
    if (isDev) return url.origin === "http://localhost:5173" || url.origin === "http://127.0.0.1:5173";
    return url.href === pathToFileURL(require("path").join(appRoot, "dist", "index.html")).href;
  } catch {
    return false;
  }
}

module.exports = { safeExternalUrl, isTrustedRendererUrl };
