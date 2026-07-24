// POST /api/subscribe  { subscription: PushSubscription(JSON), perfil?: 'news'|'btc' }
// Grava a inscrição no KV (binding SUBS) sob sub:{perfil}:{sha256(endpoint)}.
import { perfilFromHost, json, sha256 } from '../_shared.js'

export async function onRequestPost(context) {
  const { request, env } = context
  if (!env.SUBS) return json({ error: 'kv-unbound' }, 503)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad-json' }, 400) }

  const sub = body && body.subscription
  if (!sub || !sub.endpoint || !sub.keys) return json({ error: 'invalid-subscription' }, 400)

  const perfil = body.perfil === 'btc' || body.perfil === 'news'
    ? body.perfil
    : perfilFromHost(new URL(request.url).hostname)

  const key = `sub:${perfil}:${await sha256(sub.endpoint)}`
  await env.SUBS.put(key, JSON.stringify(sub))
  return json({ ok: true, perfil }, 201)
}
