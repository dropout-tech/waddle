// Every renderer, including floating panels, stays inside the app origin.
function windowOpenPolicy(raw, allowedOrigin, preload, platform = process.platform) {
  try {
    const target = new URL(raw)
    if (target.origin === allowedOrigin) return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        // Opt-in (settings, ?overFullscreen=1): a macOS 'panel' is the only way
        // to show above another app's full-screen Space — plain alwaysOnTop, even
        // with visibleOnFullScreen, stays on the desktop Space. The cost: a panel
        // never makes Huddle the active app, so ⌘C/⌘V/⌘A/⌘Z go to the frontmost
        // app instead (verified with a real keyboard), hence off by default.
        ...(target.pathname === '/floating-host.html'
          ? { alwaysOnTop: true, title: 'Huddle', ...(platform === 'darwin' && target.searchParams.get('overFullscreen') === '1' ? { type: 'panel' } : {}) }
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
