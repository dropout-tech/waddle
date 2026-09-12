const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')

const PRODUCTION_URL = 'https://waddle.zeabur.app'
const appUrl = process.env.HUDDLE_APP_URL || PRODUCTION_URL
const allowedOrigin = new URL(appUrl).origin

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#fdf8ec',
    title: 'Huddle',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: process.platform !== 'darwin',
    icon: path.join(__dirname, '..', 'assets', 'icon-only.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  win.loadURL(appUrl)

  win.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url)
    if (target.origin === allowedOrigin) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    if (target.origin === allowedOrigin) return

    // OAuth must finish in the desktop window so its callback can restore the
    // Huddle session. Everything else opens in the user's default browser.
    if (target.hostname.endsWith('google.com') || target.hostname.endsWith('appleid.apple.com')) return
    event.preventDefault()
    void shell.openExternal(url)
  })
}

const template = [
  ...(process.platform === 'darwin'
    ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }]
    : []),
  { label: '編輯', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  { label: '顯示', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  { label: '視窗', submenu: [{ role: 'minimize' }, { role: 'close' }] },
]

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
