import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'

// Paths that should never be auth-gated:
// - /login /signup /auth /forgot-password — the auth flow itself
// - /manifest.webmanifest, /robots.txt, /sitemap.xml, /sw.js, icons, etc.
//   These are fetched by the browser without cookies (PWA manifest fetch
//   in particular is sent without credentials by default), so redirecting
//   them to /login produces an HTML response where the browser expected
//   JSON / image / etc. — that's the "Manifest: Syntax error" you see in
//   the console.
const PUBLIC_PATHS = ['/login', '/signup', '/auth', '/forgot-password']
const PUBLIC_FILE_REGEX = /\.(?:webmanifest|json|ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|map|txt|xml)$/i

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isPublicFile = PUBLIC_FILE_REGEX.test(pathname)

  if (!user && !isPublicPath && !isPublicFile) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
