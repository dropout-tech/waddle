/** @type {import('next').NextConfig} */

// When BUILD_TARGET=capacitor we produce a fully static export (`out/`) that
// gets bundled offline into the native iOS shell. The web build keeps its
// server-hosted form (security headers, no trailing slash). Both builds share
// the same client-rendered app — auth gating is handled client-side (see
// components/auth/auth-guard.tsx), so neither relies on server middleware.
const isCapacitor = process.env.BUILD_TARGET === 'capacitor'
const isDev = process.env.NODE_ENV !== 'production'

// Supabase project origin: same host serves the REST/Auth API (https) and the
// Realtime websocket (wss). Next.js loads .env.local before this file runs,
// so NEXT_PUBLIC_SUPABASE_URL is available here; the literal fallback matches
// .env.local's current value so a build never silently drops the connect-src
// entry if the env var is missing for some reason.
const supabaseOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jnikcndiexjojgvicohf.supabase.co').replace(/\/$/, '')
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws')

// Content-Security-Policy for the server-hosted web build only (see note on
// headers() below — it doesn't apply to the Capacitor static export).
// Sources actually used by the app (verified by grep before writing this):
//  - Fonts: Geist/Noto Sans TC/Barlow Condensed are committed under app/fonts/
//    and served from /_next/static, so no fonts.gstatic.com/fonts.googleapis.com
//    needed — at runtime or at build time.
//  - Images: local /public assets, plus data: (inline SVG data URIs in the
//    scratchpad) and blob: (object URLs for uploads/exports), plus the
//    Supabase Storage origin (notebook-images bucket public URLs).
//  - Media: promo video/loop files are all served from /public, same-origin.
//  - Frames: floating-hub embeds same-origin routes (/float/note,
//    /float/scratchpad) only.
//  - Network: Supabase REST/Auth (https) and Realtime (wss).
// No nonce plumbing exists in this app's Next.js setup, so script-src needs
// 'unsafe-inline'; 'unsafe-eval' is added only in dev (React Fast Refresh /
// webpack eval-source-maps need it, production doesn't).
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  // Google sign-in profile photos (user_metadata.avatar_url → lh3.googleusercontent.com).
  `img-src 'self' data: blob: ${supabaseOrigin} https://*.googleusercontent.com`,
  `font-src 'self' data:`,
  // Marketing videos (intro gate, promo film, promo loop) stream from the Supabase CDN bucket marketing-media.
  `media-src 'self' ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`,
  `frame-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `frame-ancestors 'self'`,
  `form-action 'self'`,
].join('; ')

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  ...(isCapacitor
    ? {
        // Static export for Capacitor. trailingSlash makes the WKWebView resolve
        // `/login/` → `/login/index.html` cleanly from the bundled file server.
        output: 'export',
        trailingSlash: true,
      }
    : {
        // headers() only applies to the server-hosted web build; it is ignored
        // under `output: 'export'`, so we omit it there to avoid a build warning.
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
                { key: 'Content-Security-Policy', value: cspDirectives },
              ],
            },
            {
              // The PWA service worker must never be served stale by an HTTP
              // or CDN cache, or a fixed worker could fail to roll out.
              source: '/sw.js',
              headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
            },
          ]
        },
      }),
}

export default nextConfig
