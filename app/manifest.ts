import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Waddle | Unified Workspace',
    short_name: 'Waddle',
    description:
      'Waddle — a unified workspace that merges task management, time-block scheduling, and daily journaling into a single split-screen interface.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fdf8ec',
    theme_color: '#f4d977',
    lang: 'zh-TW',
    icons: [
      {
        src: '/icon-light-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
