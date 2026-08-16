# RoboZap SaaS — Plataforma de Automação de Robôs de WhatsApp com IA

Boilerplate full-stack (Next.js 14 App Router + TypeScript + Prisma) para uma plataforma
multi-tenant de automação de atendimento via WhatsApp com IA (OpenAI) e construtor de fluxos
visuais estilo n8n.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** para estilos
- **Prisma** + **PostgreSQL** (pensado para Supabase, mas funciona com qualquer Postgres)
- **NextAuth v5 (Auth.js)** — autenticação via credenciais + RBAC (MASTER / CLIENTE)
- **@xyflow/react (React Flow)** — construtor de fluxos visuais (drag-and-drop)
- **OpenAI SDK** — respostas de IA (a integração de chamada real fica a cargo de cada bloco de fluxo)
- Hospedagem alvo: **Vercel** + repositório no **GitHub**

## ⚠️ Importante sobre este scaffold

Este projeto foi gerado em um ambiente sandbox sem acesso à internet/registro npm, então
**as dependências ainda não foram instaladas nem o build foi executado**. Todo o código foi
revisado estaticamente (estrutura de imports e sintaxe TypeScript/JSX validadas), mas é
necessário rodar `npm install` na sua máquina antes do primeiro uso — veja "Como rodar" abaixo.

## Arquitetura multi-tenant

- Cada usuário (`User`) tem um `role`: `MASTER` ou `CLIENTE`.
- Um usuário **MASTER** gerencia (cria/ativa/desativa/reseta senha de) contas **CLIENTE** e
  também possui seu próprio robô, já que `Config`, `WhatsappConnection`, `Flow` e `Chat`
  pertencem a qualquer `User`, independente do papel.
- Middleware (`src/middleware.ts`) protege todas as rotas exceto `/login` e `/api/auth/*`, e
  restringe `/clients` apenas a usuários `MASTER`.

## Conexão com o WhatsApp (importante)

A Vercel roda em funções serverless — não é possível manter uma conexão WebSocket persistente
com o WhatsApp (via Baileys ou whatsapp-web.js) dentro dela. Por isso o schema e as rotas já
estão **preparados para integração via webhook**:

1. Um serviço externo (Node.js rodando em Railway, Fly.io, um VPS, etc.) mantém a sessão do
   WhatsApp para cada cliente.
2. Esse serviço chama `POST /api/whatsapp/qr` (veja `src/app/api/whatsapp/qr/route.ts`) sempre
   que um novo QR Code é gerado ou o status da conexão muda.
3. O frontend (`src/components/whatsapp/qr-display.tsx`) faz polling de
   `GET /api/whatsapp/status` a cada poucos segundos — pode ser trocado por Socket.IO para
   atualização instantânea (há um `socket.io-client` já nas dependências).
4. Atualmente, ao clicar em "Conectar", é gerado um **QR Code de exemplo (placeholder)**
   apenas para demonstrar a interface — troque pela chamada real ao seu serviço externo em
   `src/app/api/whatsapp/connect/route.ts`.

O mesmo vale para o envio real de mensagens no Live Chat (`src/app/api/chats/[id]/messages/route.ts`):
o envio humano manual já grava no banco, mas o disparo real via WhatsApp precisa ser
encaminhado ao serviço externo (há um `TODO` marcado no código).

## Estrutura de pastas

```
src/
  app/
    login/                    # tela de login (Server Action)
    (dashboard)/               # rotas autenticadas (Sidebar + Topbar)
      dashboard/                # visão geral
      flows/                     # construtor de fluxos (React Flow)
      chat/                      # central de atendimento (live chat)
      whatsapp/                  # pareamento via QR Code
      settings/                  # API Key da OpenAI + System Prompt
      clients/                   # gestão de clientes (somente MASTER)
    api/
      auth/[...nextauth]/       # NextAuth
      clients/                   # CRUD de clientes (MASTER)
      config/                    # salvar API Key + prompt
      flows/                     # CRUD de fluxos
      whatsapp/                  # connect / status / webhook de QR
      chats/                     # listagem, mensagens, toggle da IA
  components/
    layout/                    # Sidebar, Topbar, UserNav
    flows/                     # construtor visual + nodes customizados
    chat/                      # lista de conversas + painel de chat
    whatsapp/                  # exibição do QR Code
    clients/                   # tabela de clientes
    settings/                  # formulário de configurações
    ui/                        # componentes base (Button, Input, Card, Switch...)
  lib/                        # prisma client, criptografia, utils
  auth.ts / auth.config.ts     # configuração do NextAuth (v5)
  middleware.ts                # RBAC
prisma/
  schema.prisma                # modelo de dados multi-tenant
  seed.ts                      # cria o primeiro usuário MASTER
```

## Como rodar localmente

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Configure o `.env`:**
   ```bash
   cp .env.example .env
   ```
   Preencha `DATABASE_URL`/`DIRECT_URL` (ex: crie um projeto gratuito no
   [Supabase](https://supabase.com) e copie as connection strings), gere `AUTH_SECRET` com
   `openssl rand -base64 32` e `ENCRYPTION_KEY` com `openssl rand -hex 32`.

3. **Crie as tabelas no banco:**
   ```bash
   npm run db:push
   ```

4. **Crie o primeiro usuário MASTER (admin):**
   ```bash
   npm run db:seed
   ```
   As credenciais usadas são as definidas em `SEED_MASTER_EMAIL` / `SEED_MASTER_PASSWORD` no `.env`.

5. **Rode o projeto:**
   ```bash
   npm run dev
   ```
   Acesse `http://localhost:3000` e entre com o usuário MASTER criado no seed.

## Deploy na Vercel

1. Suba este projeto para um repositório no GitHub.
2. Importe o repositório na Vercel.
3. Configure as mesmas variáveis de ambiente do `.env` no painel da Vercel (lembre de usar a
   connection string **pooled** do Supabase em `DATABASE_URL` para funções serverless).
4. O comando de build já roda `prisma generate` automaticamente (`npm run build`).
5. Depois do primeiro deploy, rode `npm run db:seed` apontando para o banco de produção (localmente,
   com o `.env` de produção) para criar o usuário MASTER inicial.

## Próximos passos sugeridos

- Implementar o serviço externo de WhatsApp (Baileys é a opção mais usada e gratuita) e ligar
  os webhooks (`/api/whatsapp/qr`) e o envio de mensagens.
- Implementar o motor de execução dos fluxos (percorrer `nodes`/`edges` salvos em `Flow` a cada
  mensagem recebida, chamando a OpenAI no bloco "Resposta IA" e aplicando as condições).
- Trocar o polling por Socket.IO/Pusher para o Live Chat e o status do WhatsApp em tempo real.
- Adicionar tela de "troca de senha obrigatória" no primeiro login (`mustChangePassword`).
- Testes automatizados (Vitest/Playwright).
