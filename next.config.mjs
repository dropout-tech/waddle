/** @type {import('next').NextConfig} */

// When BUILD_TARGET=capacitor we produce a fully static export (`out/`) that
// gets bundled offline into the native iOS shell. The web build keeps its
// server-hosted form (security headers, no trailing slash). Both builds share
// the same client-rendered app — auth gating is handled client-side (see
// components/auth/auth-guard.tsx), so neither relies on server middleware.
const isCapacitor = process.env.BUILD_TARGET === 'capacitor'

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
              ],
            },
          ]
        },
      }),
}

export default nextConfig
