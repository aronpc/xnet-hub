# Setup — Web Push (PWA) + RSS

## Já configurado (feito via automação / commitado)

- **RSS** (`functions/feed.xml.js`) → `/feed.xml`. Funciona no deploy, sem config.
- **PWA**: `public/sw.js`, `functions/manifest.webmanifest.js`, registro em `src/main.jsx`.
- **Inscrição**: `functions/api/{subscribe,unsubscribe}.js` (usam o binding KV `SUBS`).
- **Chaves VAPID** geradas. Pública (não é segredo) já em:
  - `notifier/wrangler.toml` (`VAPID_PUBLIC_KEY`)
  - `.env.production` (`VITE_VAPID_PUBLIC_KEY`) → o build do Pages injeta no bundle sozinho.
- **KV namespace** `xnet-hub-subs` criado (id `be9b546cdfc246438db0601bf890a9ab`), já apontado
  no `notifier/wrangler.toml`.
- **Chave privada VAPID**: fora do git, em `notifier/.dev.vars` (git-ignored). Não commitar.

## Falta você fazer (precisa das suas credenciais Cloudflare)

Três passos, todos exigem `wrangler` autenticado (`npx wrangler login`) ou o painel.

### 1. Ligar o KV `SUBS` ao projeto Pages
Painel → projeto Pages → **Settings → Functions → KV namespace bindings** (Production e Preview):
- Variable name: `SUBS`
- KV namespace: **xnet-hub-subs** (`be9b546cdfc246438db0601bf890a9ab`)

Sem isso, `/api/subscribe` responde `503 kv-unbound`.

### 2. Publicar o Worker `notifier` + gravar o segredo
```bash
cd notifier
npm install
npx wrangler login                      # se ainda não estiver autenticado
npx wrangler secret put VAPID_PRIVATE_KEY   # cole o valor de notifier/.dev.vars
npx wrangler secret put RUN_KEY             # opcional (protege GET /run); troque o placeholder
npx wrangler deploy
```
O Cron dispara a cada 5 min. **Na 1ª execução ele só registra `last:{perfil}` sem notificar**;
o primeiro push sai no próximo post novo.

### 3. Redeploy do Pages
Pra o frontend pegar `.env.production` e o binding `SUBS`, force um novo deploy (qualquer push já
serve, ou "Retry deployment" no painel).

## Validar

1. `https://xnews.aronpc.dev/feed.xml` e `https://xbtc.aronpc.dev/feed.xml` → RSS de cada perfil.
2. Abrir o site (Android/desktop) → **🔔 receber novidades** → aceitar. Confere no KV que surgiu
   `sub:{perfil}:...`.
3. Disparo manual: `curl "https://xnet-notifier.<subdominio>.workers.dev/run?key=RUN_KEY"` com um
   post novo publicado → a notificação chega e abre a permalink ao clicar.

## Notas

- **iOS** (16.4+): Web Push só com o site **instalado** na tela inicial. A UI já mostra a dica.
- **Permissão** é pedida só no clique do botão (nunca no load).
- **Anti-spam**: notifica só a edição mais recente por execução; seed silencioso na 1ª run.
- **Girar as chaves VAPID** (se um dia vazar a privada): gere um novo par, atualize
  `VAPID_PUBLIC_KEY` (wrangler.toml + `.env.production`) e o secret `VAPID_PRIVATE_KEY`, e redeploy.
  As inscrições antigas param de receber e os usuários reativam.

### Dev local do Worker
```bash
cd notifier && npm install
npx wrangler dev                        # usa notifier/.dev.vars
curl "http://localhost:8787/run?key=<RUN_KEY do .dev.vars>"
```
