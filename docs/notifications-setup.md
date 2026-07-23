# Setup — Web Push (PWA) + RSS

Guia dos passos manuais na Cloudflare pra ligar as notificações. O código já está no repo:

- **RSS**: `functions/feed.xml.js` → `/feed.xml` (não precisa de config; funciona no deploy).
- **PWA**: `public/sw.js`, `functions/manifest.webmanifest.js`, registro em `src/main.jsx`.
- **Inscrição**: `functions/api/subscribe.js` e `functions/api/unsubscribe.js` (precisam do KV).
- **Disparo**: Worker `notifier/` com Cron Trigger (precisa do KV + VAPID).

## 1. Gerar as chaves VAPID (uma vez)

```bash
npx web-push generate-vapid-keys
# guarde Public Key e Private Key
```

## 2. Criar o KV namespace (compartilhado Pages + Worker)

```bash
cd notifier
npx wrangler kv namespace create SUBS
# copie o id retornado
```

- Cole o `id` em `notifier/wrangler.toml` (campo `id` do bloco `[[kv_namespaces]]`).
- No painel do **Pages** → projeto → *Settings* → *Bindings* (ou *Functions* → *KV namespace bindings*):
  adicione um binding **`SUBS`** apontando pro **mesmo** namespace.

## 3. Configurar o frontend (Pages)

No painel do Pages → *Settings* → *Environment variables* (Production **e** Preview):

| Variável | Valor |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | a **Public Key** do passo 1 |

> É uma env de **build** (Vite injeta no bundle). Refaça o deploy após adicionar.
> Sem ela, o botão "🔔 receber novidades" fica oculto — o RSS continua funcionando.

## 4. Configurar e publicar o Worker `notifier`

```bash
cd notifier
npm install

# segredos (não vão pro repo)
npx wrangler secret put VAPID_PRIVATE_KEY   # Private Key do passo 1
npx wrangler secret put VAPID_PUBLIC_KEY    # Public Key (ou deixe como [vars] no wrangler.toml)
npx wrangler secret put RUN_KEY             # opcional, protege o gatilho manual /run

# confira VAPID_SUBJECT (mailto) no wrangler.toml e publique
npx wrangler deploy
```

O Cron dispara a cada 5 min. **Na 1ª execução ele só registra o estado (`last:{perfil}`) sem
notificar** — o primeiro push sai no próximo post novo depois disso.

### Dev local do Worker

Crie `notifier/.dev.vars` (git-ignored):

```
VAPID_SUBJECT=mailto:aronpeyroteo@gmail.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
RUN_KEY=teste123
```

```bash
npx wrangler dev
# em outra aba: curl "http://localhost:8787/run?key=teste123"
```

## 5. Validar

1. `https://xnews.aronpc.dev/feed.xml` e `https://xbtc.aronpc.dev/feed.xml` → RSS de cada perfil.
2. Abra o site (Android/desktop), clique **🔔 receber novidades**, aceite a permissão.
   - Confirme no KV que surgiu uma chave `sub:{perfil}:...`.
3. Force um disparo: `curl "https://xnet-notifier.<subdominio>.workers.dev/run?key=RUN_KEY"`
   com um post novo publicado → a notificação deve chegar e abrir a permalink ao clicar.

## Notas

- **iOS** (16.4+): Web Push só funciona com o site **instalado** na tela inicial. A UI já mostra a
  dica; sem instalar, o botão não ativa no Safari iOS.
- **Permissão** é pedida só no clique do botão (nunca no load).
- **Anti-spam**: notifica só a edição mais recente por execução; seed silencioso na 1ª run.
- **Custo**: dentro do free tier da Cloudflare pro volume esperado.
