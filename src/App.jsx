import { useState, useEffect } from 'react'
import postsNewsFallback from './data/posts-news.json'
import postsBtcFallback from './data/posts-btc.json'

const ACCENT = { news: '#2F6BFF', btc: '#F7931A' }
const HANDLE = { news: '@xnews.ai', btc: '@xbtc.ai' }
const NOUN   = { news: 'novidades de IA', btc: 'análises de Bitcoin' }
const TAG    = { news: 'IA · Notícia', btc: 'BTC · Análise' }
// Fonte dinâmica: GitHub raw (repo público). Cron commita posts-<perfil>.json → hub reflete
// sem rebuild do Pages (cache raw ~5min). Deploy do hub é MANUAL (só quando o design muda).
const RAW = (perfil) => `https://raw.githubusercontent.com/aronpc/xnet-hub/main/src/data/posts-${perfil}.json`

function perfilFromHost() {
  const h = (typeof location !== 'undefined' ? location.hostname : '') || ''
  if (h.includes('xbtc')) return 'btc'
  if (h.includes('xnews')) return 'news'
  const qs = (typeof location !== 'undefined' ? location.search : '')
  return qs.includes('perfil=btc') ? 'btc' : 'news'
}

function fmtDate(iso) {
  try {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch { return iso }
}

function Card({ p, perfil, accent }) {
  const [open, setOpen] = useState(() => (typeof location !== 'undefined' && location.hash === '#' + p.id))
  const share = () => {
    const url = `${location.origin}${location.pathname}#${p.id}`
    try { navigator.clipboard?.writeText(url) } catch (e) {}
    if (location.hash !== '#' + p.id) { location.hash = p.id }
  }
  return (
    <article className="card" id={p.id}>
      <div className="card-top">
        <span className="kicker" style={{ color: accent }}>{TAG[perfil]}</span>
        <span className="date">{fmtDate(p.date)}{p.time ? ` · ${p.time}` : ''}</span>
      </div>
      <h2 className="hook" onClick={() => setOpen(!open)}>{p.hook}</h2>
      <p className="caption">{p.caption}</p>
      {open && p.slides && (
        <ol className="slides">
          {p.slides.map((s, i) => (
            <li key={i}>
              <span className="slide-num" style={{ color: accent }}>{String(i + 1).padStart(2, '0')}</span>
              <div className="slide-body">
                <div className="slide-t">{s.title}</div>
                {s.body && <div className="slide-b">{s.body}</div>}
                {s.source && <a className="src" href={s.source} target="_blank" rel="noopener" style={{ color: accent }}>fonte ↗</a>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="card-foot">
        {p.slides && <button className="expand" onClick={() => setOpen(!open)}>{open ? 'ver menos' : `ver ${p.slides.length} pontos`}</button>}
        <button className="share" onClick={share}>🔗 link desta edição</button>
      </div>
    </article>
  )
}

export default function App() {
  const perfil = perfilFromHost()
  const accent = ACCENT[perfil], handle = HANDLE[perfil]
  const fallback = perfil === 'btc' ? postsBtcFallback : postsNewsFallback
  const [data, setData] = useState(fallback)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let done = false
    fetch(RAW(perfil), { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(j => { if (!done) { setData(j); setLoaded(true) } })
      .catch(() => { if (!done) { setData(fallback); setLoaded(true) } })
    return () => { done = true }
  }, [perfil])

  const posts = data.posts || []
  return (
    <div className="app" style={{ ['--accent']: accent }}>
      <header className="hero">
        <div className="dot" />
        <div className="brandword">
          <span style={{ color: accent }}>x</span>{perfil === 'news' ? 'news' : 'btc'}<span className="dim">.ai</span>
        </div>
        <p className="sub">{posts.length} {NOUN[perfil]}{loaded ? '' : ' · carregando…'}</p>
      </header>

      <main className="feed">
        {posts.length === 0 && <p className="empty">Nenhum post ainda. Em breve.</p>}
        {posts.map(p => <Card key={p.id} p={p} perfil={perfil} accent={accent} />)}
      </main>

      <footer className="foot">
        <span>{handle} · gerado por IA</span>
        <a className="xnet" href={perfil === 'news' ? 'https://xbtc.aronpc.dev' : 'https://xnews.aronpc.dev'}>ver {perfil === 'news' ? '@xbtc.ai' : '@xnews.ai'} →</a>
      </footer>
    </div>
  )
}
