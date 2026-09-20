const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('huddleDesktop', {
  platform: process.platform,
  isDesktop: true,
  beginOAuth: () => ipcRenderer.invoke('desktop-oauth-begin'),
  openOAuth: url => ipcRenderer.invoke('desktop-oauth-open', url),
  cancelOAuth: () => ipcRenderer.invoke('desktop-oauth-cancel'),
})
