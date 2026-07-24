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

## Deploy realizado (2026-07-23) — no ar ✅

Feito de ponta a ponta via `wrangler` autenticado + API da Cloudflare (conta **Conta ARON**,
`ab3acdeb0c5cde0c08606aac726ccad8`):

### 1. KV `SUBS` ligado ao projeto Pages `xnet-hub` ✅
Binding `SUBS` → **xnet-hub-subs** (`be9b546cdfc246438db0601bf890a9ab`) em **production e preview**
(via `PATCH .../pages/projects/xnet-hub`). `/api/subscribe` não responde mais `503`.

### 2. Worker `xnet-notifier` publicado ✅
`https://xnet-notifier.mqx.workers.dev` — cron `*/5 * * * *`, `nodejs_compat` ligado (a lib de
push usa `node:crypto`). Secrets gravados: `VAPID_PRIVATE_KEY` e `RUN_KEY` (o RUN_KEY também ficou
em `notifier/.dev.vars`, git-ignored). Disparo manual seed rodou sem notificar (topo inalterado).

### 3. Frontend publicado ✅
Merge no `main` (commit de merge `a0f26fa`) → build do Pages concluído. Bundle já carrega a chave
pública VAPID de `.env.production`.

> Se um dia precisar refazer: `cd notifier && CLOUDFLARE_ACCOUNT_ID=ab3acdeb0c5cde0c08606aac726ccad8 npx wrangler deploy`.
> O push pro GitHub aqui foi via HTTPS (`gh auth setup-git`) porque o remote SSH não resolve DNS neste ambiente.

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
