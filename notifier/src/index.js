// Worker `xnet-notifier` — Cron Trigger.
// A cada disparo: lê o JSON raw de cada perfil, detecta post novo (posts[0].id != last:{perfil})
// e envia Web Push a todas as inscrições daquele perfil. Limpa inscrições mortas (404/410).
import { buildPushPayload } from '@block65/webcrypto-web-push'

const PERFIS = ['news', 'btc']
const SITE = { news: 'https://xnews.aronpc.dev', btc: 'https://xbtc.aronpc.dev' }
const HANDLE = { news: '@xnews.ai', btc: '@xbtc.ai' }
const RAW = (p) => `https://raw.githubusercontent.com/aronpc/xnet-hub/main/src/data/posts-${p}.json`

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env))
  },
  // gatilho manual protegido, útil pra testar: GET /run?key=RUN_KEY
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/run' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {
      const report = await run(env)
      return Response.json(report)
    }
    return new Response('xnet-notifier', { status: 200 })
  },
}

async function run(env) {
  const report = {}
  for (const perfil of PERFIS) {
    try { report[perfil] = await handlePerfil(env, perfil) }
    catch (e) { report[perfil] = { error: String(e) } }
  }
  return report
}

async function handlePerfil(env, perfil) {
  const res = await fetch(RAW(perfil), { cf: { cacheTtl: 0 } })
  if (!res.ok) return { skipped: `raw ${res.status}` }
  const data = await res.json()
  const posts = data.posts || []
  if (!posts.length) return { skipped: 'sem posts' }

  const latest = posts[0]
  const lastKey = `last:${perfil}`
  const last = await env.SUBS.get(lastKey)

  if (last === latest.id) return { unchanged: latest.id }
  // primeira execução: registra o estado sem notificar (evita blast do histórico)
  if (!last) { await env.SUBS.put(lastKey, latest.id); return { seeded: latest.id } }

  const sent = await notify(env, perfil, latest)
  await env.SUBS.put(lastKey, latest.id)
  return { notified: latest.id, ...sent }
}

async function notify(env, perfil, post) {
  const payload = JSON.stringify({
    title: `${HANDLE[perfil]} · nova edição`,
    body: (post.hook || '').slice(0, 140),
    url: `${SITE[perfil]}/#${post.id}`,
    tag: post.id,
    icon: `${SITE[perfil]}/favicon.svg`,
    badge: `${SITE[perfil]}/favicon.svg`,
  })
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  }
  const message = { data: payload, options: { ttl: 3600, urgency: 'normal' } }

  let ok = 0, gone = 0, failed = 0
  // KV list pagina de 1000 em 1000; percorre tudo
  let cursor
  do {
    const page = await env.SUBS.list({ prefix: `sub:${perfil}:`, cursor })
    for (const k of page.keys) {
      const raw = await env.SUBS.get(k.name)
      if (!raw) continue
      let sub
      try { sub = JSON.parse(raw) } catch { continue }
      try {
        const push = await buildPushPayload(message, sub, vapid)
        const r = await fetch(sub.endpoint, push)
        if (r.status === 404 || r.status === 410) { await env.SUBS.delete(k.name); gone++ }
        else if (r.ok) ok++
        else failed++
      } catch { failed++ }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return { ok, gone, failed }
}
