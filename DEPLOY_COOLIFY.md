# Guia de Deploy no Coolify

Este projeto é um monorepo contendo uma API Express (`apps/api`) e um Frontend React (`apps/web`). Existem duas maneiras principais de fazer o deploy no Coolify:

## Opção 1: Usando Docker Compose (Recomendado)

O projeto já contém os arquivos `Dockerfile.api`, `Dockerfile.web` e um `docker-compose.yml` na raiz.

1. No painel do Coolify, crie um novo recurso selecionando **Docker Compose**.
2. Cole o conteúdo do arquivo `docker-compose.yml` (ou aponte para este repositório caso conecte via GitHub).
3. O Docker Compose irá subir dois serviços:
   - **api**: A API rodando na porta `4000`. Ele irá rodar `prisma db push` automaticamente para garantir que o banco SQLite esteja pronto.
   - **web**: O Frontend rodando via Nginx na porta `80`.
4. **Volumes**: O `docker-compose.yml` já declara um volume `api_data:/app/prisma` para o serviço da API. Isso garante que o arquivo `dev.db` do SQLite não seja apagado a cada novo deploy.
5. Em **Domains**, configure o domínio da API e do Web (lembre-se de configurar o frontend para bater na URL correta da API, caso necessário alterar em `apps/web/src/lib/api.ts`).

## Opção 2: Deploy de serviços separados usando Nixpacks

Se preferir criar dois serviços separados conectando pelo GitHub no Coolify:

### Serviço 1: Backend (API)
1. Crie um novo serviço **GitHub (Public/Private)** e selecione o repositório.
2. Em **Build Pack**, escolha **Nixpacks**.
3. Em **Base Directory**, coloque `/`.
4. Em **Install Command**, use: `npm install`
5. Em **Build Command**, use: `npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace apps/api`
6. Em **Start Command**, use: `npm start --workspace apps/api`
7. Em **Ports**, exponha a porta `4000`.
8. Em **Storage**, adicione um volume mapeando `/app/apps/api/prisma` (ou onde o dev.db for gerado) para manter os dados salvos entre deploys.

### Serviço 2: Frontend (Web)
1. Crie outro serviço do GitHub apontando para o mesmo repositório.
2. Em **Build Pack**, escolha **Nixpacks** ou **Static (Nginx)** dependendo do suporte do Coolify para sites estáticos em subpastas.
3. Em **Build Command**: `npm install && npm run build --workspace apps/web`
4. Em **Publish Directory** (se for Static): `apps/web/dist`
5. Em **Start Command** (se for Node/Nixpacks): O frontend é estático, então a melhor forma é usar Dockerfile ou Static. Se o Coolify pedir, você pode usar um servidor estático como `npx serve -s apps/web/dist -l 5173`.
