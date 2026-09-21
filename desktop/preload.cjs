const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('huddleDesktop', {
  platform: process.platform,
  isDesktop: true,
  clearNotifications: () => ipcRenderer.invoke('desktop-notification-clear'),
  notificationStatus: () => ipcRenderer.invoke('desktop-notification-status'),
  showNotification: payload => ipcRenderer.invoke('desktop-notification-show', payload),
  beginOAuth: () => ipcRenderer.invoke('desktop-oauth-begin'),
  openOAuth: url => ipcRenderer.invoke('desktop-oauth-open', url),
  cancelOAuth: () => ipcRenderer.invoke('desktop-oauth-cancel'),
})
