# Agenda Careliz

Aplicativo web e API para gestão de agenda e produção do ateliê Careliz.

## Estrutura do Projeto (Monorepo)

- `apps/api`: Backend em Express + Prisma (banco de dados).
- `apps/web`: Frontend em React (Vite).

## Deploy no Coolify

Para subir esse projeto no Coolify, utilizaremos a configuração Nixpacks/Buildpacks, pois é um monorepo Node.js.

### Passo a passo para configuração:

1. **Adicionar novo recurso no Coolify:**
   - Selecione a opção **"GitHub (Public / Private)"** e conecte seu repositório.

2. **Configuração Geral (Deploy App):**
   - **Build Pack:** Nixpacks
   - **Nixpacks Build Command:** `npm ci && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build`
   - **Nixpacks Start Command:** `npm start --workspace apps/api`

3. **Configuração do Banco de Dados (SQLite):**
   - O projeto atualmente utiliza SQLite (`file:./dev.db`). Para garantir que o banco não seja deletado a cada deploy, você precisará adicionar um **Persistent Storage** no Coolify:
     - Acesse a aba **Storage** no serviço recém criado.
     - Adicione um volume: `/app/apps/api/prisma/dev.db` mapeado para um diretório na máquina host ou um volume nomeado.

4. **Portas e Redes:**
   - O Express API escuta por padrão na porta `4000`. Configure a porta exportada no Coolify para `4000`.
   - Como o frontend Vite é React padrão, você precisará criar um serviço separado para ele apontando para a pasta `apps/web` e usando o Start Command `npm run dev:web` ou hospedar os arquivos estáticos gerados na pasta `dist` via Nginx ou similar.
