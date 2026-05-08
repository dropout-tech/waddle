import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Noto_Sans_TC } from 'next/font/google'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-tc',
})

export const metadata: Metadata = {
  title: 'Waddle | Unified Workspace',
  description:
    'Waddle — a unified workspace that merges task management, time-block scheduling, and daily journaling into a single split-screen interface. Take it slow, get it done.',
  generator: 'v0.app',
  applicationName: 'Waddle',
  appleWebApp: {
    capable: true,
    title: 'Waddle',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4d977' },
    { media: '(prefers-color-scheme: dark)', color: '#2a2a2a' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW" className="bg-background" suppressHydrationWarning>
      <head>
        {/* Set viewport class before hydration so CSS / hooks see the right
            value on first paint and avoid the desktop-flash on mobile. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(max-width:767px)').matches;document.documentElement.dataset.viewport=m?'mobile':'desktop';if(m)document.documentElement.classList.add('is-mobile');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geist.variable} ${geistMono.variable} ${notoSansTC.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
