# Hots - area privada de comprovantes

Site em Next.js com login privado para equipe selecionada, upload de prints/gravacoes e visualizacao dos comprovantes em um painel interno.

## Setup rapido

1. Instale as dependencias:
   ```bash
   npm install
   ```
2. Crie seu arquivo de ambiente:
   - copie `.env.example` para `.env.local` (desenvolvimento) ou configure as mesmas variaveis no provedor de hospedagem.

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
3. Configure as variaveis de ambiente da `.env.example` no painel da plataforma.
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

- `MONGODB_URI`: string de conexao do MongoDB.
- `MONGODB_DB_NAME`: nome do banco (opcional, padrao `hots`).
- `JWT_SECRET`: chave para assinar token de autenticacao.
- `DISCORD_BOT_TOKEN`: token do bot com permissao de enviar mensagens/anexos.
- `DISCORD_UPLOADS_CHANNEL_ID`: ID do canal que recebe comprovantes e avatares.
