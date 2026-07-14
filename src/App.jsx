import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import postsNewsFallback from './data/posts-news.json'
import postsBtcFallback from './data/posts-btc.json'

const ACCENT = { news: '#2F6BFF', btc: '#F7931A' }
const HANDLE = { news: '@xnews.ai', btc: '@xbtc.ai' }
const NOUN   = { news: 'novidades de IA', btc: 'análises de Bitcoin' }
const TAG    = { news: 'IA · Notícia', btc: 'BTC · Análise' }
const BRAND  = { news: 'xnews', btc: 'xbtc' }
const SITE   = { news: 'https://xnews.aronpc.dev', btc: 'https://xbtc.aronpc.dev' }
const DESC   = {
  news: 'O radar diário de Inteligência Artificial — modelos, lançamentos e o que muda pra quem usa IA. Curado e resumido por IA, sem ruído.',
  btc:  'Bitcoin e cripto todo dia — preço, níveis, smart money e leitura de mercado. Curado e resumido por IA, sem hype.',
}
// Fonte dinâmica: GitHub raw (repo público). Cron commita posts-<perfil>.json → hub reflete
// sem rebuild do Pages (cache raw ~5min). Deploy do hub é MANUAL (só quando o design muda).
const RAW = (perfil) => `https://raw.githubusercontent.com/aronpc/xnet-hub/main/src/data/posts-${perfil}.json`
const PAGE = 8

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

/* ---------- SEO: título, meta, Open Graph, canonical e JSON-LD dinâmicos ---------- */
function upsert(sel, make) {
  let el = document.head.querySelector(sel)
  if (!el) { el = make(); document.head.appendChild(el) }
  return el
}
function setMeta(name, content, attr = 'name') {
  upsert(`meta[${attr}="${name}"]`, () => {
    const m = document.createElement('meta'); m.setAttribute(attr, name); return m
  }).setAttribute('content', content)
}
function setLink(rel, href) {
  upsert(`link[rel="${rel}"]`, () => {
    const l = document.createElement('link'); l.setAttribute('rel', rel); return l
  }).setAttribute('href', href)
}
function useSEO(perfil, posts, loaded) {
  useEffect(() => {
    const site = SITE[perfil], title = `${BRAND[perfil]}.ai · ${NOUN[perfil]}`, desc = DESC[perfil]
    document.title = title
    setMeta('description', desc)
    setMeta('theme-color', ACCENT[perfil])
    setLink('canonical', site + '/')
    document.documentElement.style.setProperty('--accent', ACCENT[perfil])
    const og = [['og:type', 'website'], ['og:site_name', 'x Network'], ['og:title', title],
      ['og:description', desc], ['og:url', site + '/'], ['og:image', site + '/og.png']]
    og.forEach(([p, c]) => setMeta(p, c, 'property'))
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title); setMeta('twitter:description', desc)
    setMeta('twitter:image', site + '/og.png')
    // JSON-LD (ItemList das edições) — só quando os dados reais chegam
    if (loaded && posts.length) {
      const ld = {
        '@context': 'https://schema.org', '@type': 'ItemList', name: title,
        description: desc, url: site + '/',
        itemListElement: posts.slice(0, 30).map((p, i) => ({
          '@type': 'ListItem', position: i + 1,
          item: { '@type': 'NewsArticle', headline: p.hook, description: p.caption,
            datePublished: p.date, url: `${site}/#${p.id}`,
            author: { '@type': 'Organization', name: HANDLE[perfil] } },
        })),
      }
      let s = document.getElementById('ld-json')
      if (!s) { s = document.createElement('script'); s.id = 'ld-json'; s.type = 'application/ld+json'; document.head.appendChild(s) }
      s.textContent = JSON.stringify(ld)
    }
  }, [perfil, posts, loaded])
}

/* ---------- compartilhamento ---------- */
function shareTargets(text, url) {
  const t = encodeURIComponent(text), u = encodeURIComponent(url)
  return [
    { k: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { k: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    { k: 'tg', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
  ]
}
function ShareMenu({ text, url, onCopy, label = 'compartilhar' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('click', off)
    return () => document.removeEventListener('click', off)
  }, [open])
  const onShare = async (e) => {
    e.stopPropagation()
    if (navigator.share) { try { await navigator.share({ title: text, text, url }); return } catch {} }
    setOpen(v => !v)
  }
  return (
    <div className="share-wrap" ref={ref}>
      <button className="share" onClick={onShare} aria-label={label} aria-haspopup="menu" aria-expanded={open}>↗ {label}</button>
      {open && (
        <div className="share-menu" role="menu">
          <button role="menuitem" onClick={(e) => { e.stopPropagation(); onCopy(url); setOpen(false) }}>Copiar link</button>
          {shareTargets(text, url).map(s => (
            <a key={s.k} role="menuitem" href={s.href} target="_blank" rel="noopener" onClick={() => setOpen(false)}>{s.label}</a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- card ---------- */
function Card({ p, perfil, base, focus, onCopy }) {
  const [open, setOpen] = useState(() => focus.id === p.id)
  useEffect(() => { if (focus.id === p.id) setOpen(true) }, [focus, p.id])
  const editionUrl = `${base}#${p.id}`
  return (
    <article className="card" id={p.id}>
      <div className="card-top">
        <span className="kicker">{TAG[perfil]}</span>
        <span className="date">{fmtDate(p.date)}{p.time ? ` · ${p.time}` : ''}</span>
      </div>
      <h2 className="hook">
        <button className="hook-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>{p.hook}</button>
      </h2>
      <p className="caption">{p.caption}</p>
      {open && p.slides && (
        <ol className="slides">
          {p.slides.map((s, i) => {
            const sid = `${p.id}.${i + 1}`
            const hit = focus.id === p.id && focus.n === i + 1
            return (
              <li key={i} id={sid} className={hit ? 'slide-hit' : ''}>
                <span className="slide-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="slide-body">
                  <div className="slide-t">{s.title}</div>
                  {s.body && <div className="slide-b">{s.body}</div>}
                  <div className="slide-foot">
                    {s.source && <a className="src" href={s.source} target="_blank" rel="noopener">fonte ↗</a>}
                    <button className="anchor" title="copiar link desta notícia"
                      onClick={() => onCopy(`${base}#${sid}`)} aria-label="copiar link desta notícia">🔗 link</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <div className="card-foot">
        {p.slides && <button className="expand" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'ver menos' : `ver ${p.slides.length} pontos`}</button>}
        <ShareMenu text={`${p.hook} — ${HANDLE[perfil]}`} url={editionUrl} onCopy={onCopy} label="link desta edição" />
      </div>
    </article>
  )
}

function Skeleton() {
  return (
    <div className="card sk" aria-hidden="true">
      <div className="sk-line w40" /><div className="sk-line w80 tall" /><div className="sk-line w100" /><div className="sk-line w60" />
    </div>
  )
}

function parseHash() {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '')
  if (!h) return { id: null, n: null }
  const m = h.match(/^(.*?)(?:\.(\d+))?$/)
  return { id: m ? m[1] : h, n: m && m[2] ? parseInt(m[2], 10) : null }
}

export default function App() {
  const perfil = perfilFromHost()
  const fallback = perfil === 'btc' ? postsBtcFallback : postsNewsFallback
  const [data, setData] = useState(fallback)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [focus, setFocus] = useState(parseHash)
  const [toast, setToast] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const base = (typeof location !== 'undefined' ? location.origin + location.pathname : '')

  useEffect(() => {
    let done = false
    fetch(RAW(perfil), { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(j => { if (!done) { setData(j); setLoaded(true) } })
      .catch(() => { if (!done) { setData(fallback); setLoaded(true) } })
    return () => { done = true }
  }, [perfil])

  const posts = data.posts || []
  useSEO(perfil, posts, loaded)

  // busca
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(p => {
      const hay = [p.hook, p.caption, ...(p.slides || []).flatMap(s => [s.title, s.body])].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [posts, query])
  useEffect(() => { setVisible(PAGE) }, [query, perfil])

  // reage ao hash (permalink de edição/notícia)
  useEffect(() => {
    const onHash = () => setFocus(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // garante que o alvo do permalink esteja visível (paginação) e scrolla até ele
  useEffect(() => {
    if (!focus.id) return
    const idx = filtered.findIndex(p => p.id === focus.id)
    if (idx >= 0 && idx + 1 > visible) setVisible(idx + 2)
    const t = setTimeout(() => {
      const el = document.getElementById(focus.n ? `${focus.id}.${focus.n}` : focus.id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    return () => clearTimeout(t)
  }, [focus, filtered, loaded])

  // scroll infinito + header compacto
  const sentinel = useRef(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setVisible(v => Math.min(v + PAGE, filtered.length)) }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const copy = useCallback((url) => {
    try { navigator.clipboard?.writeText(url) } catch {}
    if (url.includes('#')) history.replaceState(null, '', url.slice(url.indexOf('#')))
    setToast('Link copiado'); setTimeout(() => setToast(''), 1800)
  }, [])

  const shown = filtered.slice(0, visible)
  const other = perfil === 'news' ? 'btc' : 'news'

  return (
    <div className="app" style={{ ['--accent']: ACCENT[perfil] }}>
      <header className={'hero' + (scrolled ? ' compact' : '')}>
        <a className="brandline" href="#top" aria-label={`${BRAND[perfil]}.ai — topo`}>
          <span className="dot" />
          <span className="brandword"><span className="x">{BRAND[perfil][0]}</span>{BRAND[perfil].slice(1)}<span className="dim">.ai</span></span>
        </a>
        <p className="sub">{loaded ? `${posts.length} ${NOUN[perfil]}` : 'carregando…'}</p>
        <div className="searchbar">
          <input type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={`Buscar em ${NOUN[perfil]}…`} aria-label="Buscar" />
          {query && <button className="clear" onClick={() => setQuery('')} aria-label="limpar busca">×</button>}
        </div>
      </header>

      <main className="feed" id="top">
        {!loaded && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
        {loaded && shown.length === 0 && (
          <p className="empty">{query ? `Nada encontrado para “${query}”.` : 'Nenhum post ainda. Em breve.'}</p>
        )}
        {shown.map(p => <Card key={p.id} p={p} perfil={perfil} base={base} focus={focus} onCopy={copy} />)}
        {query && loaded && filtered.length > 0 && (
          <p className="count">{filtered.length} resultado{filtered.length > 1 ? 's' : ''}</p>
        )}
        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {visible < filtered.length && (
          <button className="more" onClick={() => setVisible(v => Math.min(v + PAGE, filtered.length))}>
            Carregar mais ({filtered.length - visible})
          </button>
        )}
      </main>

      <footer className="foot">
        <span>{HANDLE[perfil]} · gerado por IA</span>
        <a className="xnet" href={SITE[other]}>ver {HANDLE[other]} →</a>
      </footer>

      {scrolled && <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="voltar ao topo">↑</button>}
      <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}
