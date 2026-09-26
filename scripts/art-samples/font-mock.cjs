// Dev-only helper for offline / slow-network previews.
// Usage: NEXT_FONT_GOOGLE_MOCKED_RESPONSES=$PWD/scripts/art-samples/font-mock.cjs pnpm dev
// Maps every next/font/google request to local() system fonts so the dev
// server never has to download ~400 Noto Sans TC slices from gstatic.
// Screenshots taken this way use PingFang TC instead of Noto Sans TC.
const LOCAL = {
  'Noto Sans TC': "local('PingFang TC')",
  Geist: "local('Helvetica Neue')",
  'Geist Mono': "local('Menlo')",
  'Barlow Condensed': "local('Avenir Next Condensed Heavy'), local('Arial Narrow Bold')",
}

module.exports = new Proxy(
  {},
  {
    get(_t, url) {
      if (typeof url !== 'string') return undefined
      const m = /family=([^:&]+)(?::[^&]*@([^&]+))?/.exec(url)
      const family = decodeURIComponent((m && m[1]) || 'Fallback').replace(/\+/g, ' ')
      let weights = ['400']
      if (m && m[2]) {
        weights = m[2]
          .split(';')
          .map((s) => s.split(',').pop())
          .map((w) => (w.includes('..') ? w.split('..')[0] : w))
      }
      const src = LOCAL[family] || "local('Helvetica Neue')"
      return weights
        .map(
          (w) =>
            `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:${src};}`,
        )
        .join('\n')
    },
    has() {
      return true
    },
  },
)
