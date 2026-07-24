// POST /api/unsubscribe  { endpoint: string }
// Remove a inscrição do KV. Como não sabemos o perfil pela id, apagamos as duas chaves possíveis.
import { json, sha256 } from '../_shared.js'

export async function onRequestPost(context) {
  const { request, env } = context
  if (!env.SUBS) return json({ error: 'kv-unbound' }, 503)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad-json' }, 400) }

  const endpoint = body && (body.endpoint || (body.subscription && body.subscription.endpoint))
  if (!endpoint) return json({ error: 'no-endpoint' }, 400)

  const h = await sha256(endpoint)
  await Promise.all([
    env.SUBS.delete(`sub:news:${h}`),
    env.SUBS.delete(`sub:btc:${h}`),
  ])
  return json({ ok: true })
}
