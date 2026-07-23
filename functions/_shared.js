// Helpers compartilhados pelas Pages Functions de inscrição.

export function perfilFromHost(host) {
  return (host || '').toLowerCase().includes('xbtc') ? 'btc' : 'news'
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// sha256(endpoint) em hex — chave estável e curta por inscrição
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
