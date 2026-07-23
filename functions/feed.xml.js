// Pages Function → rota GET /feed.xml
// Deriva o perfil do host (xbtc → btc, senão news), lê os posts (raw do GitHub pra ficar
// fresco sem esperar rebuild; cai no snapshot do bundle se o raw falhar) e devolve RSS 2.0.
import newsData from '../src/data/posts-news.json'
import btcData from '../src/data/posts-btc.json'

const SITE = { news: 'https://xnews.aronpc.dev', btc: 'https://xbtc.aronpc.dev' }
const HANDLE = { news: '@xnews.ai', btc: '@xbtc.ai' }
const TITLE = { news: 'xnews.ai · novidades de IA', btc: 'xbtc.ai · análises de Bitcoin' }
const DESC = {
  news: 'O radar diário de Inteligência Artificial — modelos, lançamentos e o que muda pra quem usa IA. Curado e resumido por IA, sem ruído.',
  btc: 'Bitcoin e cripto todo dia — preço, níveis, smart money e leitura de mercado. Curado e resumido por IA, sem hype.',
}
const BUNDLE = { news: newsData, btc: btcData }
const RAW = (p) => `https://raw.githubusercontent.com/aronpc/xnet-hub/main/src/data/posts-${p}.json`
const MAX_ITEMS = 30
const FETCH_TIMEOUT = 5000

function perfilFromHost(host) {
  const h = (host || '').toLowerCase()
  if (h.includes('xbtc')) return 'btc'
  return 'news'
}

// escape mínimo pra atributos/URLs e nós de texto sem CDATA
function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
// CDATA seguro (fecha e reabre em caso improvável de "]]>")
function cdata(s) {
  return `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

// data ("2026-07-23") + time opcional ("10h32") → RFC-822 em GMT, assumindo -03:00 (America/Sao_Paulo)
function pubDate(date, time) {
  const m = /^(\d{1,2})h(\d{2})$/.exec(time || '')
  const clock = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '12:00'
  const d = new Date(`${date}T${clock}:00-03:00`)
  return isNaN(d) ? new Date(`${date}T12:00:00Z`).toUTCString() : d.toUTCString()
}

async function loadPosts(perfil) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const r = await fetch(RAW(perfil), { cf: { cacheTtl: 300 }, signal: ctrl.signal })
    if (r.ok) {
      const j = await r.json()
      if (j?.posts?.length) return j.posts
    }
  } catch { /* cai no fallback */ } finally { clearTimeout(t) }
  return BUNDLE[perfil]?.posts || []
}

export async function onRequestGet(context) {
  const perfil = perfilFromHost(new URL(context.request.url).hostname)
  const site = SITE[perfil]
  const posts = (await loadPosts(perfil)).slice(0, MAX_ITEMS)

  const items = posts.map((p) => {
    const url = `${site}/#${p.id}`
    return `    <item>
      <title>${cdata(p.hook)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="false">${xmlEscape(p.id)}</guid>
      <pubDate>${pubDate(p.date, p.time)}</pubDate>
      <description>${cdata(p.caption || p.hook)}</description>
    </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(TITLE[perfil])}</title>
    <link>${xmlEscape(site + '/')}</link>
    <atom:link href="${xmlEscape(site + '/feed.xml')}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(DESC[perfil])}</description>
    <language>pt-BR</language>
    <generator>${xmlEscape(HANDLE[perfil])}</generator>
${items}
  </channel>
</rss>
`

  return new Response(rss, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      // fresco, mas com folga pra CDN (casa com o cache do raw ~5min)
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  })
}
