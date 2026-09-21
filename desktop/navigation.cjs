// Every renderer, including floating panels, stays inside the app origin.
function windowOpenPolicy(raw, allowedOrigin, preload) {
  try {
    const target = new URL(raw)
    if (target.origin === allowedOrigin) return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        ...(target.pathname === '/floating-host.html' ? { alwaysOnTop: true, title: 'Huddle' } : {}),
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
