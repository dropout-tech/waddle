// Every renderer, including floating panels, stays inside the app origin.
function windowOpenPolicy(raw, allowedOrigin, preload, platform = process.platform) {
  try {
    const target = new URL(raw)
    if (target.origin === allowedOrigin) return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        // macOS 'panel' (NSWindowStyleMaskNonactivatingPanel) is what lets the
        // floating hub show above another app's full-screen Space; plain
        // alwaysOnTop only floats within the desktop Space it was opened on.
        ...(target.pathname === '/floating-host.html'
          ? { alwaysOnTop: true, title: 'Huddle', ...(platform === 'darwin' ? { type: 'panel' } : {}) }
          : {}),
        webPreferences: {
          preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    }
  } catch {}
  return { action: 'deny' }
}
module.exports = { windowOpenPolicy }
