const { contextBridge, ipcRenderer } = require("electron");

const apiBaseArg = process.argv.find((a) => a.startsWith("--api-base="));
const apiBase = apiBaseArg ? apiBaseArg.split("=")[1] : "";

contextBridge.exposeInMainWorld("electronAPI", {
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  apiBase,
});
