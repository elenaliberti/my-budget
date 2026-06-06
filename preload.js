const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('budget', {
  load:         ()       => ipcRenderer.invoke('data:load'),
  save:         (data)   => ipcRenderer.invoke('data:save', data),
  openLocation: ()       => ipcRenderer.invoke('data:open-location'),
  exportPath:   ()       => ipcRenderer.invoke('data:export-path'),
})
