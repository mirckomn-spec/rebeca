# Hots - area privada de comprovantes

Site em Next.js com login privado para equipe selecionada, upload de prints/gravacoes e visualizacao dos comprovantes em um painel interno.

## Setup rapido

1. Instale as dependencias:
   ```bash
   npm install
   ```
2. Configure as variaveis de ambiente:
   - **Hospedagem:** painel Environment Variables (Vercel, Netlify, etc.).
   - **Local:** crie `.env.local` na raiz do projeto com as mesmas chaves.

## Rodar em desenvolvimento

```bash
npm run dev
```

## Rodar em producao

```bash
npm run build
npm run start
```

## Deploy (GitHub + hospedagem)

1. Suba o projeto para o GitHub.
2. Conecte o repositorio na sua plataforma de deploy (ex.: Vercel).
3. Configure as variaveis de ambiente no painel da plataforma (veja lista abaixo).
4. Faça o deploy com:
   - Build command: `npm run build`
   - Start command: `npm run start`

## Como funciona o login

- Nao existe cadastro publico.
- Login fixo e unico:
  - Usuario: `bel`
  - Senha: `bel94838`

## Comprovantes

- Upload de `image/*` e `video/*` no dashboard.
- Metadados ficam na collection `proofs`.
- Arquivos novos sao enviados para um canal do Discord e o sistema salva a URL.

## Variaveis de ambiente

- `MONGODB_URI`: string de conexao do MongoDB (obrigatoria em producao).
- `MONGODB_DB_NAME`: nome do banco (opcional, padrao `hots`).
- `JWT_SECRET`: chave para assinar token de autenticacao.
- `DISCORD_BOT_TOKEN`: token do bot com permissao de enviar mensagens/anexos.
- `DISCORD_UPLOADS_CHANNEL_ID`: ID do canal que recebe comprovantes e avatares.

## Login ok mas volta para a home com `?erro=banco`

Isso **nao e falha de senha**. O login criou a sessao, mas ao abrir `/painel` ou `/dashboard` o servidor nao conectou no MongoDB.

No **Vercel** (Environment Variables), confira:

1. `MONGODB_URI` preenchida (ex.: `mongodb+srv://usuario:senha@cluster....mongodb.net/`)
2. Senha com caracteres especiais (`@`, `#`, etc.) deve estar **URL-encoded** na URI.
3. Variaveis marcadas para **Production** (e Preview, se testar preview).
4. **Redeploy** apos salvar.

No **MongoDB Atlas**:

1. **Database Access**: usuario com senha correta.
2. **Network Access**: adicione `0.0.0.0/0` (Allow access from anywhere) — necessario para Vercel, pois os IPs mudam.
3. Cluster ativo e URI copiada do botao **Connect**.
