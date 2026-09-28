import type { MetadataRoute } from 'next'

// Required so the manifest route can be emitted under `output: 'export'`.
// The content is fully static, so forcing static generation is safe for the
// web build too.
export const dynamic = 'force-static'

// Paper theme background (app/art-theme.css `--background`). Used for both the
// Android splash and the standalone status bar so the installed app opens on
// the same cream as the first painted frame. PwaSetup keeps the live
// <meta name="theme-color"> in sync with light/dark once the page runs.
const PAPER = '#f6f3e9'
const icon = (src: string, size: number, purpose: 'any' | 'maskable') => ({
  src,
  sizes: `${size}x${size}`,
  type: 'image/png',
  purpose,
})

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Huddle',
    short_name: 'Huddle',
    description:
      'Huddle — a unified workspace that merges task management, time-block scheduling, and daily journaling into a single split-screen interface.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // No `orientation` lock: the board has a proper ≥768px layout, so Android
    // tablets and desktop installs should be free to rotate.
    background_color: PAPER,
    theme_color: PAPER,
    lang: 'zh-TW',
    categories: ['productivity'],
    icons: [
      icon('/app-icon-192.png', 192, 'any'),
      icon('/app-icon-512.png', 512, 'any'),
      // Padded to the maskable safe zone (inner 80% circle) so Android's
      // adaptive masks don't crop the penguin.
      icon('/app-icon-maskable-192.png', 192, 'maskable'),
      icon('/app-icon-maskable-512.png', 512, 'maskable'),
    ],
    // Long-press shortcuts reuse the in-app deep links the iOS widgets use
    // (lib/widgets/model.ts widgetPath → components/widgets/use-widget-launch.ts).
    // Web build has no trailing slash, so the notebook is /notebook.
    shortcuts: [
      { name: '新增任務', short_name: '新增任務', url: '/?widget=new-task', icons: [{ src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: '日曆', short_name: '日曆', url: '/?widget=week', icons: [{ src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: '白板', short_name: '白板', url: '/?widget=whiteboard', icons: [{ src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: '記事本', short_name: '記事本', url: '/notebook', icons: [{ src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  }
}
