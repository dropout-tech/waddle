import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Noto_Sans_TC } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { NativeShell } from '@/components/native/native-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { FocusTimerProvider } from '@/components/timer/focus-timer-provider'

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
  title: 'Huddle | Unified Workspace',
  description:
    'Huddle — a unified workspace that merges task management, time-block scheduling, and daily journaling into a single split-screen interface. Take it slow, get it done.',
  generator: 'v0.app',
  applicationName: 'Huddle',
  appleWebApp: {
    capable: true,
    title: 'Huddle',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: dark)',
      },
      { url: '/app-icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/app-icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
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
        {/* Opt-in dark mode: defaults to light (the product's light-first
            stance) and only switches when the user explicitly toggles it, so
            no dark-OS surprise. `attribute="class"` writes `.dark` on <html>,
            which the dark tokens in globals.css and NativeShell's status-bar
            observer both key off. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <NativeShell />
          <AuthProvider>
            {/* Cross-route focus timer state — mounted above the router
                outlet so a running session (and its BGM) survives
                navigating to any route, not just while MainLayout happens
                to be mounted. See focus-timer-provider.tsx. */}
            <FocusTimerProvider>{children}</FocusTimerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
