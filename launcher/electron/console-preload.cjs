"use strict";

// This bridge belongs only to the local desktop console. The Teams WebContentsView
// deliberately does not use this preload (see browser-host.cjs).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("teamBot", {
  listProjects: () => ipcRenderer.invoke("projects:list"),
  saveProjects: (projects) => ipcRenderer.invoke("projects:save", projects),
});
