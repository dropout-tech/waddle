const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('huddleDesktop', {
  platform: process.platform,
  isDesktop: true,
})
