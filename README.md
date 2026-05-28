# Hots - area privada de comprovantes

Site em Next.js hospedado na **Vercel** via **GitHub** (`git push`).

**Producao:** https://bel-gamma.vercel.app

## Deploy (GitHub → Vercel)

1. Faca alteracoes na pasta `rebeca`.
2. Commit e push:
   ```bash
   git add .
   git commit -m "sua mensagem"
   git push
   ```
3. A Vercel faz build e publica automaticamente (nao precisa rodar `npm run dev` nem abrir localhost).

Configuracao na Vercel (projeto conectado ao repo):

- **Framework:** Next.js
- **Root Directory:** `rebeca` (se o repo tiver a pasta `rebeca` na raiz)
- **Build Command:** `npm run build`
- **Output:** padrao Next.js

## Variaveis de ambiente (painel Vercel)

Configure em **Settings → Environment Variables** (Production):

| Variavel | Obrigatoria |
|----------|-------------|
| `MONGODB_URI` | Sim |
| `JWT_SECRET` | Sim |
| `MONGODB_DB_NAME` | Nao (padrao: `hots`) |
| `DISCORD_BOT_TOKEN` | Se usar upload Discord |
| `DISCORD_UPLOADS_CHANNEL_ID` | Se usar upload Discord |

Opcional (dominio proprio):

- `NEXT_PUBLIC_SITE_URL` = `https://seu-dominio.com`

Depois de alterar variaveis: **Redeploy**.

## Testar se o banco esta ok (producao)

Abra apos o deploy:

`https://bel-gamma.vercel.app/api/health/db`

- `connected: true` → MongoDB OK
- `connected: false` → veja o campo `hint` e ajuste `MONGODB_URI` / Atlas (rede `0.0.0.0/0`)

## Login

- Usuario admin: `bel`
- Senha: definida em `ALLOWED_USERS` no codigo (usuario `bel`)

## Desenvolvimento local (opcional)

So use se quiser testar na sua maquina. **Nao e necessario para publicar o site.**

```bash
npm install
# crie .env.local com as mesmas variaveis da Vercel
npm run dev
```

O site em producao **nao** usa localhost; usa o dominio da Vercel automaticamente.
