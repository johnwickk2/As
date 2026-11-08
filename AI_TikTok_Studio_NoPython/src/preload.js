const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  createVideo: cfg => ipcRenderer.invoke("create-video", cfg),
  openOutput: () => ipcRenderer.invoke("open-output"),
  getOutputDir: () => ipcRenderer.invoke("get-output-dir"),
  onLog: callback => ipcRenderer.on("job-log", (_event, data) => callback(data))
});
