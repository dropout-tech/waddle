const { app, BrowserWindow, Menu, shell, ipcMain, Notification } = require('electron')
const path = require('node:path')

const PRODUCTION_URL = 'https://waddle.zeabur.app'
const appUrl = process.env.HUDDLE_APP_URL || PRODUCTION_URL
const allowedOrigin = new URL(appUrl).origin
const { createOAuth } = require('./oauth.cjs')
const { createNotifications } = require('./notifications.cjs')
const { windowOpenPolicy } = require('./navigation.cjs')
let win
let oauth
let pendingUrl
const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
function receive(raw) {
  if (!oauth) { pendingUrl = raw; return }
  const target = oauth.consume(raw)
  if (!target) return
  if (!win || win.isDestroyed()) createWindow(target)
  else { void win.loadURL(target); win.restore(); win.show(); win.focus() }
}
app.on('open-url', (event, url) => { event.preventDefault(); receive(url) })
app.on('second-instance', (_event, args) => {
  const url = args.find(value => value.startsWith('huddle-desktop://'))
  if (url) receive(url)
  else if (win) { win.show(); win.focus() }
})
function trusted(event) {
  return win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && new URL(event.senderFrame.url).origin === allowedOrigin
}
function safeExternal(url) {
  try { const u = new URL(url); if (['https:', 'http:', 'mailto:'].includes(u.protocol)) void shell.openExternal(u.href) } catch {}
}

function createWindow(targetUrl = appUrl) {
  win = new BrowserWindow({
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
      // Keep opted-in reminders and wall-clock timer checks alive while minimized.
      backgroundThrottling: false,
    },
  })

  win.loadURL(targetUrl)

  secureNavigation(win)
}

function secureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const policy = windowOpenPolicy(url, allowedOrigin, path.join(__dirname, 'preload.cjs'))
    if (policy.action === 'deny') safeExternal(url)
    return policy
  })
  const guardNavigation = (event, url) => {
    try { if (new URL(url).origin === allowedOrigin) return } catch {}
    event.preventDefault()
    safeExternal(url)
  }
  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-redirect', guardNavigation)
  // Floating panels inherit the same restrictions, including any nested popout.
  // OAuth IPC remains restricted to the original main window by trusted().
  window.webContents.on('did-create-window', child => secureNavigation(child))
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
  if (!locked) return
  if (process.platform === 'win32') app.setAppUserModelId('com.lazylazy.huddle.desktop')
  app.setAsDefaultProtocolClient('huddle-desktop')
  oauth = createOAuth({ file: path.join(app.getPath('userData'), 'pending-oauth.json'), origin: allowedOrigin, openExternal: url => shell.openExternal(url) })
  for (const [channel, handler] of Object.entries({
    'desktop-oauth-begin': () => oauth.begin(),
    'desktop-oauth-open': url => oauth.open(url),
    'desktop-oauth-cancel': () => oauth.cancel(),
  })) ipcMain.handle(channel, (event, arg) => {
    if (!trusted(event)) throw new Error('Untrusted OAuth caller')
    return handler(arg)
  })
  const notifications = createNotifications({ Notification, trusted, focus: () => {
    if (win && !win.isDestroyed()) { win.restore(); win.show(); win.focus() }
  } })
  ipcMain.handle('desktop-notification-clear', event => notifications.clear(event))
  ipcMain.handle('desktop-notification-status', event => notifications.status(event))
  ipcMain.handle('desktop-notification-show', (event, payload) => notifications.show(event, payload))
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  createWindow()
  const initial = pendingUrl || process.argv.find(value => value.startsWith('huddle-desktop://'))
  if (initial) receive(initial)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
