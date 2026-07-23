// Pages Function → rota GET /manifest.webmanifest
// Manifest de PWA por perfil (derivado do host), pra o "instalar" ficar branded por site.
const BRAND = { news: 'xnews', btc: 'xbtc' }
const NOUN = { news: 'novidades de IA', btc: 'análises de Bitcoin' }
const ACCENT = { news: '#2F6BFF', btc: '#F7931A' }
const BG = '#0B0E14'

function perfilFromHost(host) {
  return (host || '').toLowerCase().includes('xbtc') ? 'btc' : 'news'
}

export async function onRequestGet(context) {
  const perfil = perfilFromHost(new URL(context.request.url).hostname)
  const manifest = {
    name: `${BRAND[perfil]}.ai · ${NOUN[perfil]}`,
    short_name: `${BRAND[perfil]}.ai`,
    description: `O radar diário — ${NOUN[perfil]}, curado e resumido por IA.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BG,
    theme_color: ACCENT[perfil],
    lang: 'pt-BR',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
