import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import postsNewsFallback from './data/posts-news.json'
import postsBtcFallback from './data/posts-btc.json'

const ACCENT = { news: '#2F6BFF', btc: '#F7931A' }
const HANDLE = { news: '@xnews.ai', btc: '@xbtc.ai' }
const NOUN   = { news: 'novidades de IA', btc: 'análises de Bitcoin' }
const TAG    = { news: 'IA · Notícia', btc: 'BTC · Análise' }
const BRAND  = { news: 'xnews', btc: 'xbtc' }
const SITE   = { news: 'https://xnews.aronpc.dev', btc: 'https://xbtc.aronpc.dev' }
const IG     = { news: 'https://instagram.com/xnews.ai', btc: 'https://instagram.com/xbtc.ai' }
const DESC   = {
  news: 'O radar diário de Inteligência Artificial — modelos, lançamentos e o que muda pra quem usa IA. Curado e resumido por IA, sem ruído.',
  btc:  'Bitcoin e cripto todo dia — preço, níveis, smart money e leitura de mercado. Curado e resumido por IA, sem hype.',
}
// Fonte dinâmica: GitHub raw (repo público). Cron commita posts-<perfil>.json → hub reflete
// sem esperar o rebuild do Pages (cache raw ~5min). O bundle já traz um snapshot dos posts,
// então o fetch é revalidação (SWR), não pré-requisito pra renderizar.
const RAW = (perfil) => `https://raw.githubusercontent.com/aronpc/xnet-hub/main/src/data/posts-${perfil}.json`
const PAGE = 8
const FETCH_TIMEOUT = 8000
// chave pública VAPID (injetada no build via env). Sem ela, o botão de push fica oculto.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

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

function parseHash() {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '')
  if (!h) return { id: null, n: null }
  const m = h.match(/^(.*?)(?:\.(\d+))?$/)
  return { id: m ? decodeURIComponent(m[1]) : h, n: m && m[2] ? parseInt(m[2], 10) : null }
}

/* ---------- SEO: título, meta, Open Graph, canonical e JSON-LD dinâmicos ---------- */
function upsert(sel, make) {
  let el = document.head.querySelector(sel)
  if (!el) { el = make(); document.head.appendChild(el) }
  return el
}
function setMeta(name, content, attr = 'name') {
  upsert(`meta[${attr}="${name}"]`, () => { const m = document.createElement('meta'); m.setAttribute(attr, name); return m }).setAttribute('content', content)
}
function setLink(rel, href) {
  upsert(`link[rel="${rel}"]`, () => { const l = document.createElement('link'); l.setAttribute('rel', rel); return l }).setAttribute('href', href)
}
function useSEO(perfil, posts, loaded, post) {
  useEffect(() => {
    const site = SITE[perfil]
    const title = post ? `${post.hook} · ${BRAND[perfil]}.ai` : `${BRAND[perfil]}.ai · ${NOUN[perfil]}`
    const desc = post ? (post.caption || DESC[perfil]) : DESC[perfil]
    const url = post ? `${site}/#${post.id}` : site + '/'
    document.title = title
    setMeta('description', desc)
    setMeta('theme-color', ACCENT[perfil])
    setLink('canonical', url)
    document.documentElement.style.setProperty('--accent', ACCENT[perfil])
    const og = [['og:type', post ? 'article' : 'website'], ['og:site_name', 'x Network'], ['og:title', title],
      ['og:description', desc], ['og:url', url], ['og:image', site + '/og.png']]
    og.forEach(([p, c]) => setMeta(p, c, 'property'))
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title); setMeta('twitter:description', desc); setMeta('twitter:image', site + '/og.png')
    let s = document.getElementById('ld-json')
    if (!s) { s = document.createElement('script'); s.id = 'ld-json'; s.type = 'application/ld+json'; document.head.appendChild(s) }
    if (post) {
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'NewsArticle',
        headline: post.hook, description: post.caption, datePublished: post.date, url,
        author: { '@type': 'Organization', name: HANDLE[perfil] },
        publisher: { '@type': 'Organization', name: 'x Network' } })
    } else if (loaded && posts.length) {
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: title, url,
        itemListElement: posts.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1,
          item: { '@type': 'NewsArticle', headline: p.hook, description: p.caption, datePublished: p.date, url: `${site}/#${p.id}` } })) })
    }
  }, [perfil, posts, loaded, post])
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

/* ---------- lista de notícias (reusada no card e no detalhe) ---------- */
function Slides({ p, base, focusN, onCopy }) {
  return (
    <ol className="slides">
      {p.slides.map((s, i) => {
        const sid = `${p.id}.${i + 1}`
        return (
          <li key={i} id={sid} className={focusN === i + 1 ? 'slide-hit' : ''}>
            <span className="slide-num">{String(i + 1).padStart(2, '0')}</span>
            <div className="slide-body">
              <div className="slide-t">{s.title}</div>
              {s.body && <div className="slide-b">{s.body}</div>}
              <div className="slide-foot">
                {s.source && <a className="src" href={s.source} target="_blank" rel="noopener">fonte ↗</a>}
                <button className="anchor" onClick={() => onCopy(`${base}#${sid}`)} aria-label="copiar link desta notícia">🔗 link</button>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- card do feed (índice: preview clicável) ---------- */
function Card({ p, perfil, base, onCopy, go }) {
  const n = p.slides?.length || 0
  return (
    <article className="card" id={p.id}>
      <div className="card-top">
        <span className="kicker">{TAG[perfil]}</span>
        <span className="date">{fmtDate(p.date)}{p.time ? ` · ${p.time}` : ''}</span>
      </div>
      <h2 className="hook"><a className="hook-btn" href={`#${p.id}`} onClick={(e) => { e.preventDefault(); go('#' + p.id) }}>{p.hook}</a></h2>
      <p className="caption">{p.caption}</p>
      <div className="card-foot">
        {n > 0 && <a className="expand" href={`#${p.id}`} onClick={(e) => { e.preventDefault(); go('#' + p.id) }}>abrir · {n} notícia{n > 1 ? 's' : ''} →</a>}
        <ShareMenu text={`${p.hook} — ${HANDLE[perfil]}`} url={`${base}#${p.id}`} onCopy={onCopy} label="link desta edição" />
      </div>
    </article>
  )
}

/* ---------- vista de detalhe: só a edição e suas notícias ---------- */
function DetailView({ p, perfil, base, focusN, onCopy, prev, next, idx, count, go }) {
  useEffect(() => {
    const t = setTimeout(() => {
      const el = focusN ? document.getElementById(`${p.id}.${focusN}`) : null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else window.scrollTo({ top: 0 })
    }, 90)
    return () => clearTimeout(t)
  }, [p.id, focusN])
  return (
    <div className="detail">
      <button className="back" onClick={() => go('')}>← todas as {NOUN[perfil]}</button>
      <article className="card detail-card" id={p.id}>
        <div className="card-top">
          <span className="kicker">{TAG[perfil]}</span>
          <span className="date">{fmtDate(p.date)}{p.time ? ` · ${p.time}` : ''}{count ? ` · ${idx + 1}/${count}` : ''}</span>
        </div>
        <h1 className="hook detail-hook">{p.hook}</h1>
        <p className="caption">{p.caption}</p>
        {p.slides && <Slides p={p} base={base} focusN={focusN} onCopy={onCopy} />}
        <div className="card-foot">
          <span className="foot-note">{p.slides ? `${p.slides.length} notícia${p.slides.length > 1 ? 's' : ''}` : ''}</span>
          <ShareMenu text={`${p.hook} — ${HANDLE[perfil]}`} url={`${base}#${p.id}`} onCopy={onCopy} label="compartilhar" />
        </div>
      </article>
      <nav className="detail-nav">
        <button className="nav-btn" disabled={!prev} onClick={() => prev && go('#' + prev.id)}>
          {prev ? <><span className="na">← mais recente</span><span className="nd">{fmtDate(prev.date)}{prev.time ? ` · ${prev.time}` : ''}</span></> : '—'}
        </button>
        <button className="nav-btn r" disabled={!next} onClick={() => next && go('#' + next.id)}>
          {next ? <><span className="na">mais antiga →</span><span className="nd">{fmtDate(next.date)}{next.time ? ` · ${next.time}` : ''}</span></> : '—'}
        </button>
      </nav>
    </div>
  )
}

/* ---------- opt-in de notificações (Web Push / PWA) ---------- */
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
function iosState() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const standalone = (typeof navigator !== 'undefined' && navigator.standalone === true) ||
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
  return { iOS, standalone }
}
function NotifyButton({ perfil, flash }) {
  const supported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_PUBLIC
  const [state, setState] = useState('idle') // idle | on | denied | busy | hidden

  useEffect(() => {
    if (!supported) { setState('hidden'); return }
    let alive = true
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => { if (alive) setState(sub ? 'on' : (Notification.permission === 'denied' ? 'denied' : 'idle')) })
      .catch(() => {})
    return () => { alive = false }
  }, [supported])

  const enable = async () => {
    const { iOS, standalone } = iosState()
    if (iOS && !standalone) { flash('No iPhone: Compartilhar ⬆ → "Adicionar à Tela de Início", e ative por lá'); return }
    setState('busy')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'idle'); if (perm === 'denied') flash('Permissão bloqueada no navegador'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) })
      const r = await fetch('/api/subscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), perfil }),
      })
      if (!r.ok) throw new Error('subscribe')
      setState('on'); flash('Pronto — você recebe cada nova edição 🔔')
    } catch { setState('idle'); flash('Não deu pra ativar agora, tenta de novo') }
  }
  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/unsubscribe', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setState('idle'); flash('Notificações desativadas')
    } catch { setState('on') }
  }

  if (state === 'hidden') return null
  if (state === 'denied') return <button className="notify" disabled aria-label="Notificações bloqueadas">🔕 bloqueado</button>
  if (state === 'on') return <button className="notify on" onClick={disable} aria-label="Desativar notificações">🔔 ativado</button>
  return <button className="notify" onClick={enable} disabled={state === 'busy'} aria-label="Receber notificações">🔔 {state === 'busy' ? '…' : 'receber novidades'}</button>
}

function Skeleton() {
  return (<div className="card sk" aria-hidden="true"><div className="sk-line w40" /><div className="sk-line w80 tall" /><div className="sk-line w100" /><div className="sk-line w60" /></div>)
}

export default function App() {
  const perfil = perfilFromHost()
  const fallback = perfil === 'btc' ? postsBtcFallback : postsNewsFallback
  const [data, setData] = useState(fallback)
  // o bundle já traz os posts: só há o que esperar se ele vier vazio.
  const [loaded, setLoaded] = useState(() => (fallback.posts?.length || 0) > 0)
  const [fetching, setFetching] = useState(true)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [focus, setFocus] = useState(parseHash)
  const [toast, setToast] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const base = (typeof location !== 'undefined' ? location.origin + location.pathname : '')

  useEffect(() => {
    let done = false
    const ctrl = new AbortController()
    // sem isto um raw pendurado (rede/proxy que não responde nem falha) trava a UI pra sempre
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
    fetch(RAW(perfil), { cache: 'no-cache', signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(j => { if (!done && j?.posts?.length) setData(j) })
      .catch(() => {})
      .finally(() => { clearTimeout(t); if (!done) { setLoaded(true); setFetching(false) } })
    return () => { done = true; clearTimeout(t); ctrl.abort() }
  }, [perfil])

  const posts = data.posts || []
  const focusedIdx = focus.id ? posts.findIndex(p => p.id === focus.id) : -1
  const focusedPost = focusedIdx >= 0 ? posts[focusedIdx] : null
  useSEO(perfil, posts, loaded, focusedPost)

  useEffect(() => {
    const onHash = () => { setFocus(parseHash()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((hash) => {
    const h = (hash || '').replace(/^#/, '')
    if (h) { if (decodeURIComponent(location.hash.replace(/^#/, '')) !== h) location.hash = h; else setFocus(parseHash()) }
    else { history.pushState('', '', location.pathname + location.search); setFocus({ id: null, n: null }) }
    window.scrollTo({ top: 0 })
  }, [])

  const copy = useCallback((url) => {
    try { navigator.clipboard?.writeText(url) } catch {}
    setToast('Link copiado'); setTimeout(() => setToast(''), 1800)
  }, [])

  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3400) }, [])

  // busca
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(p => [p.hook, p.caption, ...(p.slides || []).flatMap(s => [s.title, s.body])].join(' ').toLowerCase().includes(q))
  }, [posts, query])
  useEffect(() => { setVisible(PAGE) }, [query, perfil])

  // scroll infinito + header compacto (só no feed)
  const sentinel = useRef(null)
  useEffect(() => {
    if (focusedPost) return
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setVisible(v => Math.min(v + PAGE, filtered.length)) }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length, focusedPost])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 240)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ----- VISTA DE DETALHE (edição isolada) -----
  if (focusedPost) {
    return (
      <div className="app" style={{ ['--accent']: ACCENT[perfil] }}>
        <DetailView p={focusedPost} perfil={perfil} base={base} focusN={focus.n} onCopy={copy}
          prev={posts[focusedIdx - 1] || null} next={posts[focusedIdx + 1] || null}
          idx={focusedIdx} count={posts.length} go={go} />
        <footer className="foot">
          <a className="ig" href={IG[perfil]} target="_blank" rel="noopener">{HANDLE[perfil]}</a>
        <a className="rss" href="/feed.xml" target="_blank" rel="noopener" aria-label="Assinar RSS">RSS</a>
          <a className="xnet" href={SITE[perfil === 'news' ? 'btc' : 'news']}>ver {HANDLE[perfil === 'news' ? 'btc' : 'news']} →</a>
        </footer>
        <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
      </div>
    )
  }
  // edição pedida na URL que não está no bundle: espera a revalidação antes de desistir dela
  if (focus.id && fetching) {
    return <div className="app" style={{ ['--accent']: ACCENT[perfil] }}><div className="detail"><Skeleton /></div></div>
  }

  // ----- FEED (índice) -----
  const shown = filtered.slice(0, visible)
  const other = perfil === 'news' ? 'btc' : 'news'
  return (
    <div className="app" style={{ ['--accent']: ACCENT[perfil] }}>
      <header className={'hero' + (scrolled ? ' compact' : '')}>
        <a className="brandline" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label={`${BRAND[perfil]}.ai — topo`}>
          <span className="dot" />
          <span className="brandword"><span className="x">{BRAND[perfil][0]}</span>{BRAND[perfil].slice(1)}<span className="dim">.ai</span></span>
        </a>
        <p className="sub">{loaded ? `${posts.length} ${NOUN[perfil]}` : 'carregando…'}</p>
        <div className="hero-actions">
          <NotifyButton perfil={perfil} flash={flash} />
        </div>
        <div className="searchbar">
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Buscar em ${NOUN[perfil]}…`} aria-label="Buscar" />
          {query && <button className="clear" onClick={() => setQuery('')} aria-label="limpar busca">×</button>}
        </div>
      </header>

      <main className="feed" id="top">
        {!loaded && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
        {loaded && shown.length === 0 && <p className="empty">{query ? `Nada encontrado para “${query}”.` : 'Nenhum post ainda. Em breve.'}</p>}
        {shown.map(p => <Card key={p.id} p={p} perfil={perfil} base={base} onCopy={copy} go={go} />)}
        {query && loaded && filtered.length > 0 && <p className="count">{filtered.length} resultado{filtered.length > 1 ? 's' : ''}</p>}
        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {visible < filtered.length && <button className="more" onClick={() => setVisible(v => Math.min(v + PAGE, filtered.length))}>Carregar mais ({filtered.length - visible})</button>}
      </main>

      <footer className="foot">
        <a className="ig" href={IG[perfil]} target="_blank" rel="noopener">{HANDLE[perfil]}</a>
        <a className="rss" href="/feed.xml" target="_blank" rel="noopener" aria-label="Assinar RSS">RSS</a>
        <a className="xnet" href={SITE[other]}>ver {HANDLE[other]} →</a>
      </footer>

      {scrolled && <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="voltar ao topo">↑</button>}
      <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}
