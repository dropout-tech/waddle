import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static, _next/image (Next internals)
     * - favicon, icon, apple-icon (public assets)
     * - any file with an extension (images, css, js, fonts...)
     *
     * Auth pages still go through the proxy so logged-in users get redirected away.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon-light|icon-dark|icon\\.svg|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf)$).*)',
  ],
}
