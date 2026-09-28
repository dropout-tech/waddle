// Zeabur's own static file serving has intermittently been slow for the
// marketing site's videos (one 2MB request measured ~19.7s in production,
// stalling the first-visit intro for 10-30s). The files are byte-identical
// copies uploaded to a public Supabase Storage bucket (`marketing-media`,
// cache-control max-age=31536000), so we point playback there instead.
const CDN_VERSION = 'v1'

/**
 * Builds the public CDN URL for a marketing video or poster image.
 * `path` is the bucket-relative path, e.g. "promo-film/huddle-promo-720.mp4".
 *
 * Falls back to the old local path under /marketing/<path> when
 * NEXT_PUBLIC_SUPABASE_URL isn't set, so local dev without that env var
 * still resolves to a same-shaped URL.
 */
export function marketingMediaUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return `/marketing/${path}`
  return `${base}/storage/v1/object/public/marketing-media/${CDN_VERSION}/${path}`
}
