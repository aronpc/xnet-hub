# Plano — Notificações a cada atualização do site

> Status: proposta técnica (planejamento). Canais escolhidos: **Web Push (PWA)** + **RSS**.
> Gatilho: **Cloudflare Worker com Cron Trigger** vigiando o JSON raw — sem tocar no cron
> externo que publica os posts.

## 1. Contexto e restrições

- **Frontend**: SPA estática (React + Vite) na **Cloudflare Pages**, um único bundle servindo
  dois domínios — `xnews.aronpc.dev` (perfil `news`) e `xbtc.aronpc.dev` (perfil `btc`). O
  perfil é derivado do host em runtime (`perfilFromHost`).
- **Conteúdo**: publicado por um **cron externo** (fora deste repo) que commita
  `src/data/posts-{news,btc}.json` no `main`. O site lê o raw do GitHub como revalidação SWR.
- **"Atualização no site"** = **um post novo no topo do array `posts`** do JSON (o mais recente
  é `posts[0]`).
- **Não há** hoje: backend, service worker, manifest/PWA nem qualquer disparo server-side.

### Implicações de projeto

1. O gatilho não pode assumir acesso ao cron externo → um **Worker próprio** faz *polling* do
   raw JSON e detecta o diff. Intervalo de 5 min casa com o cache do raw (~5 min).
2. Web Push exige **PWA** (service worker + manifest) e um backend pra guardar inscrições e
   assinar os envios (VAPID). Cloudflare cobre isso com **Pages Functions** (endpoints) + um
   **Worker** (cron).
3. RSS não precisa de rebuild do Pages: servimos via **Pages Function** lendo o JSON atual, então
   o feed reflete o post novo assim que o cron commita.

## 2. Arquitetura proposta

```
                     ┌───────────────────────────────────────────┐
                     │  Cloudflare Pages (SPA + Pages Functions)  │
  usuário ──HTTP──▶  │  /              → SPA React                │
                     │  /feed.xml      → Function (RSS do JSON)   │
                     │  /api/subscribe → Function (grava no KV)   │
                     │  /api/unsubscribe → Function               │
                     └──────────────┬────────────────────────────┘
                                    │  KV (compartilhado)
                                    │  sub:{perfil}:{hash}  = subscription
                                    │  last:{perfil}        = último id notificado
                     ┌──────────────┴────────────────────────────┐
   Cron (5min) ────▶ │  Worker `notifier` (scheduled handler)     │
                     │  1. fetch raw posts-{news,btc}.json        │
                     │  2. compara posts[0].id com last:{perfil}  │
                     │  3. se novo → Web Push p/ todas inscrições │
                     │  4. limpa inscrições mortas (410 Gone)     │
                     └────────────────────────────────────────────┘
```

Dois deployables, ambos versionados neste repo:
- **Pages** (já existe) + pasta `functions/` (endpoints request/response).
- **Worker** `notifier/` com `wrangler.toml` próprio e o Cron Trigger (o `scheduled` handler não
  existe em Pages Functions, por isso é um Worker separado). Compartilha o mesmo **KV namespace**.

## 3. Componentes a construir

### 3.1 PWA shell
- `public/manifest.webmanifest` — `name`, `short_name`, `theme_color`, `display: standalone`,
  ícones (reaproveitar `favicon.svg` + gerar PNG 192/512 a partir do `og.png`/favicon). Como o
  bundle é compartilhado, o `name`/`theme_color` podem ser ajustados por perfil via `<link>`
  dinâmico (mesmo padrão do `useSEO`).
- `public/sw.js` — service worker com:
  - `push` → `showNotification(title, { body, icon, badge, data: { url } })`.
  - `notificationclick` → foca aba aberta ou abre `data.url` (a permalink `#id`).
  - `pushsubscriptionchange` → re-inscreve e re-`POST /api/subscribe`.
- Registro do SW em `src/main.jsx` (só em produção / se `'serviceWorker' in navigator`).

### 3.2 UI de opt-in (`src/App.jsx`)
- Botão **"🔔 receber novidades"** no header (perto do subtítulo) e/ou footer.
- Fluxo (sempre disparado por **gesto do usuário**, nunca no load):
  1. checa suporte (`'PushManager' in window`, `Notification`);
  2. `Notification.requestPermission()`;
  3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
     (chave pública VAPID vinda de `import.meta.env.VITE_VAPID_PUBLIC_KEY`);
  4. `POST /api/subscribe` com `{ subscription, perfil }`.
- Estados: `default` / `granted+subscribed` / `denied` / `unsupported`. Opção de desativar
  (`unsubscribe`).
- **iOS**: Web Push só funciona com o site **instalado** na tela inicial (iOS 16.4+). Detectar
  `navigator.standalone`/`display-mode: standalone`; se for iOS Safari não instalado, mostrar dica
  "Adicione à tela inicial pra ativar as notificações" em vez do prompt.

### 3.3 Pages Functions (`functions/`)
- `functions/api/subscribe.js` (POST) — valida o corpo, grava
  `sub:{perfil}:{sha256(endpoint)}` = subscription no KV. Idempotente.
- `functions/api/unsubscribe.js` (POST) — remove a chave.
- `functions/feed.xml.js` (GET) — deriva o perfil do host, lê o `posts-{perfil}.json` (raw ou do
  próprio bundle), gera RSS 2.0 (`<item>` por edição: `title=hook`, `description=caption`,
  `link=SITE/#id`, `guid=id`, `pubDate`). `Content-Type: application/rss+xml`,
  `Cache-Control` curto (~5 min).
- Binding do **KV** e da env no `wrangler.toml`/painel do Pages.

### 3.4 Worker `notifier/` (Cron Trigger)
- `wrangler.toml`: `[triggers] crons = ["*/5 * * * *"]`, binding do KV, secret `VAPID_PRIVATE_KEY`
  e var `VAPID_PUBLIC_KEY` + `VAPID_SUBJECT` (mailto).
- `scheduled` handler, para cada perfil em `['news','btc']`:
  1. `fetch` do raw `posts-{perfil}.json`;
  2. `novo = posts[0].id`; se `novo === last:{perfil}` → nada a fazer;
  3. **primeira execução** (sem `last`) → apenas grava `last` **sem** notificar (evita blast);
  4. senão → envia Web Push a todas as inscrições `sub:{perfil}:*` com payload pequeno
     (title=hook, body=trecho do caption, url=`SITE/#id`), depois grava `last = novo`;
  5. resposta `410 Gone`/`404` → apaga a inscrição do KV.
- Assinatura Web Push via lib **compatível com Workers** (Web Crypto), ex.
  `@block65/webcrypto-web-push` — a lib `web-push` do Node **não** roda no runtime dos Workers.
- Payload sob o limite (~4 KB).

### 3.5 Descoberta e SEO
- `<link rel="alternate" type="application/rss+xml" href="/feed.xml">` no `index.html` e/ou no
  `useSEO`.
- Link visível "RSS" no footer.

## 4. Modelo de dados (KV)

| Chave | Valor | Escrito por | Lido por |
|---|---|---|---|
| `sub:{perfil}:{sha256(endpoint)}` | `PushSubscription` (JSON) | `/api/subscribe` | Worker cron |
| `last:{perfil}` | `id` do último post notificado | Worker cron | Worker cron |

Listagem por prefixo `sub:{perfil}:` para o fan-out. (KV basta; D1 só se quiser métricas/consulta
relacional depois.)

## 5. Segredos e configuração

- Gerar par **VAPID** (`npx web-push generate-vapid-keys`).
  - Pública → env de build `VITE_VAPID_PUBLIC_KEY` (Pages) **e** var do Worker.
  - Privada → **secret** do Worker (`wrangler secret put VAPID_PRIVATE_KEY`). Nunca no repo.
- Um **KV namespace** compartilhado, ligado ao Pages e ao Worker.
- `.dev.vars` para dev local (git-ignored).

## 6. Fases de entrega

1. **Fase 1 — RSS** (baixo risco, valor imediato): `functions/feed.xml.js` + link de descoberta.
   Já entrega "acompanhar atualizações" via leitor/automação, sem PWA.
2. **Fase 2 — Infra push**: VAPID + KV + `wrangler.toml` do Worker; manifest + `sw.js`; registro
   do SW.
3. **Fase 3 — Opt-in**: UI do botão + `/api/subscribe` + `/api/unsubscribe`; validar que a
   inscrição chega no KV (ainda sem envios).
4. **Fase 4 — Disparo**: Worker cron com diff + envio + limpeza de inscrições mortas; seed do
   `last` na primeira run.
5. **Fase 5 — Polimento**: dica de "instalar" no iOS, estado de desativar, contagem de inscritos,
   agrupar "N novas edições" quando cair mais de um post entre execuções.

## 7. Riscos e decisões em aberto

- **iOS**: exige PWA instalado (16.4+) — comunicar claramente na UI; sem isso o botão não resolve
  pra Safari iOS.
- **Permissão**: só pedir em gesto do usuário; pedir no load derruba conversão e irrita.
- **Anti-spam**: notificar **só a edição mais recente** por run (ou "N novas edições"), nunca
  reenviar histórico. Seed silencioso na 1ª execução é obrigatório.
- **Rebuild vs raw**: RSS via Function lê o JSON atual → fresco sem esperar o Pages.
- **Um Pages, dois domínios**: as Functions e o KV são compartilhados; cada domínio chama a própria
  Function e o perfil sai do host. Confirmar que `xnews` e `xbtc` são o **mesmo** projeto Pages
  (o bundle compartilhado indica que sim).
- **Custo**: dentro do free tier da Cloudflare para o volume esperado (KV + Worker cron + Pages
  Functions).

## 8. Definição de pronto

- [ ] `/feed.xml` válido nos dois domínios, refletindo o post mais recente.
- [ ] Botão de opt-in inscreve e a subscription aparece no KV.
- [ ] Post novo commitado → push chega em Android/desktop em ≤ ~5 min.
- [ ] Clicar na notificação abre a permalink correta do post.
- [ ] Inscrições mortas somem do KV (sem erros acumulando).
- [ ] Nenhum segredo no repositório.
