const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { safeExternalUrl, isTrustedRendererUrl } = require("./security.cjs");

const isDev = !app.isPackaged;
const API_BASE = "http://127.0.0.1:3000";
let apiServer = null;

function startApiServer() {
  const serverPath = path.join(__dirname, "..", "scripts", "dev-server.mjs");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(`[dev-server] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[dev-server] ${d}`));
  child.on("exit", (code) => {
    if (code !== 0) console.error(`[dev-server] exited with code ${code}`);
  });
  return child;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, "..", "public", "blackletter-logo.svg"),
    backgroundColor: "#FFFAF3",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--api-base=${isDev ? "" : API_BASE}`],
    },
    titleBarStyle: "default",
    show: false,
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeExternalUrl(url);
    if (safeUrl) void shell.openExternal(safeUrl);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, { isDev, appRoot: path.join(__dirname, "..") })) event.preventDefault();
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("open-external", async (event, url) => {
    if (event.senderFrame !== event.sender.mainFrame) return false;
    if (!isTrustedRendererUrl(event.senderFrame.url, { isDev, appRoot: path.join(__dirname, "..") })) return false;
    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) return false;
    await shell.openExternal(safeUrl);
    return true;
  });
  if (!isDev) {
    apiServer = startApiServer();
  }
  createWindow();
});
app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  if (apiServer && !apiServer.killed) {
    apiServer.kill();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
