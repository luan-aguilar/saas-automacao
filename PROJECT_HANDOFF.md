# RoboZap SaaS — Handoff de contexto (Cowork → Claude Code / VS Code)

Este documento resume tudo o que foi construído até agora numa sessão do Cowork (que rodava num sandbox na nuvem, sem acesso a `npm`/build). Os arquivos já estão sincronizados neste repositório — o objetivo deste handoff é só transferir o **contexto e as decisões**, já que o histórico de conversa em si não migra entre as duas ferramentas.

## Visão geral do projeto

**RoboZap SaaS** é uma plataforma multi-tenant para agências/donos de negócio venderem robôs de atendimento de WhatsApp com IA (OpenAI) para os próprios clientes finais. Cada cliente (`CLIENTE`) tem sua própria conexão de WhatsApp, configuração de IA e fluxos de automação; um usuário `MASTER` administra os tenants.

## Stack técnica

- Next.js 14 (App Router) + TypeScript
- Prisma ORM + PostgreSQL (Supabase)
- NextAuth v5 (beta) — Credentials provider, sessão JWT, RBAC (`MASTER` / `CLIENTE`)
- `@xyflow/react` (React Flow v12) — Construtor de Fluxos visual, estilo n8n
- **Evolution API v2** (self-hosted, `http://144.126.133.92:8080`) como gateway do WhatsApp (Baileys por trás)
- bcryptjs para hash de senha (não bcrypt nativo — compatibilidade com runtime serverless da Vercel)
- Deploy: Vercel

## Modelo de dados (`prisma/schema.prisma`)

- `User` — RBAC (`role`: MASTER/CLIENTE), status, `mustChangePassword`
- `Config` — system prompt geral da IA, chave OpenAI criptografada (AES-256-GCM), modelo, temperatura
- `WhatsappConnection` — status da conexão, `qrCode`, `externalSessionId` (nome da instância na Evolution API)
- `Flow` — `nodes`/`edges` do React Flow serializados como JSON, `isActive`
- `Chat` / `Message` — schema pronto para a Central de Atendimento (Live Chat), mas verificar o quanto da UI/endpoints já está implementado
- `AuditLog` — auditoria de ações do MASTER

## O que já está implementado e funcionando

1. **Autenticação e RBAC** — login com e-mail/senha normalizados (`.toLowerCase().trim()` em todos os pontos de leitura/escrita, para evitar falso negativo de login), sessão JWT, MASTER pode criar clientes com senha temporária.
2. **Conexão real com WhatsApp via Evolution API v2** (`src/lib/evolution-api.ts`, `src/app/api/whatsapp/*`):
   - Gerar QR Code: `POST /instance/create` com fallback em `GET /instance/connect/{instanceName}`.
   - Polling de status a cada 3s: `GET /instance/connectionState/{instanceName}`.
   - **Desconectar de verdade**: chama `logout` (fecha o socket) **e depois `delete`** (apaga a instância e destrói as credenciais em cache) — sem o `delete`, o Baileys reconectava sozinho poucos segundos depois usando o auth state salvo.
3. **Construtor de Fluxos visual** (`src/components/flows/*`) — drag-and-drop de blocos, undo/redo (Ctrl+Z/Shift+Z), atalhos de teclado, deleção de conexões (edges), 5 tipos de bloco:
   - `trigger`, `aiResponse`, `staticMessage` (agora com dois modos: **botões** até 3, ou **lista** até 10 itens com `id`/`title`/`description`), `condition`, `alertNotification`.
   - Template pronto **"Salão de Beleza / Estética"** (`src/lib/templates/beauty-salon-template.ts`), carregável com 1 clique no botão "Carregar Template: Salão de Beleza" no topo do Construtor.
4. **Envio de mensagem avulso** (`src/lib/whatsapp-service.ts` → `sendWhatsappMessage`) funciona quando chamado diretamente (ex: pelo bloco de Notificação/Alerta).

## ⚠️ O que NÃO está implementado (o gap mais importante)

Isto é o ponto crítico que você perguntou: **a automação ainda não roda de verdade em produção**, apesar do Construtor de Fluxos já salvar/carregar fluxos normalmente. Especificamente:

- **Não existe webhook recebendo mensagens do WhatsApp.** A Evolution API não está configurada para avisar a aplicação quando um contato manda mensagem (não há `POST /api/whatsapp/webhook` implementado e plugado). Sem isso, nenhum fluxo é disparado automaticamente quando alguém escreve pro robô.
- **`src/lib/flow-engine.ts` é essencialmente boilerplate.** Só o bloco `alertNotification` tem execução real implementada (`executeAlertNotificationNode` — interpola variáveis e envia via `sendWhatsappMessage`) — **e mesmo esse nunca é chamado em produção hoje**, porque nada dispara `executeFlowNode` (não há webhook nem cron acionando o motor).
  - **Bloco "Resposta IA" (`aiResponse`)**: TODO — não chama a OpenAI ainda. Só loga um aviso e retorna `ok: true`.
  - **Bloco "Mensagem Estática" (`staticMessage`)**: TODO — não envia a mensagem (nem os botões/lista) pelo WhatsApp ainda.
  - **Bloco "Condição" (`condition`)**: TODO — não avalia a condição nem escolhe qual aresta (`yes`/`no`) seguir.
- **Não existe "sessão de fluxo" persistida por conversa** — ou seja, nada guarda em qual node cada contato está parado, nem as variáveis já coletadas (ex: `{{nome}}`, `{{foto_atual_url}}`) entre uma mensagem e outra. Isso precisa ser modelado (provavelmente uma tabela nova, ou reaproveitando `Chat`).

**Resumindo a resposta direta à pergunta:** sim — hoje o Construtor de Fluxos é só a camada de **desenho e persistência** do fluxo. A "IA", as "mensagens estáticas" e as "condições" ainda não fazem nada quando alguém manda mensagem de verdade pro WhatsApp, porque falta (a) o webhook de entrada e (b) a implementação de cada executor em `flow-engine.ts`.

## Próximos passos sugeridos (em ordem de dependência)

1. Criar `POST /api/whatsapp/webhook` e configurar a Evolution API para chamá-lo no evento de mensagem recebida (`MESSAGES_UPSERT` ou equivalente no v2).
2. Modelar e persistir o "estado da conversa" por contato/tenant (node atual + variáveis coletadas até então).
3. Implementar de verdade os executores em `flow-engine.ts`:
   - `aiResponse`: chamar a OpenAI usando `Config.systemPrompt` (ou `customPrompt` do bloco) + histórico da conversa.
   - `staticMessage`: enviar texto + botões/lista via Evolution API (`/message/sendButtons` ou `/message/sendList`, dependendo do `interactiveType`).
   - `condition`: avaliar `operator`/`value` contra a variável indicada e escolher a aresta `yes`/`no`.
4. Ligar tudo no motor: dado o `Flow` ativo do tenant + uma mensagem recebida, andar pelo grafo `nodes`/`edges` a partir do node atual da sessão.
5. Persistir as mensagens trocadas em `Chat`/`Message` para alimentar a Central de Atendimento (Live Chat).

## Arquivos-chave

| Arquivo | O que é |
|---|---|
| `src/lib/evolution-api.ts` | Cliente HTTP da Evolution API v2 (criar instância, QR, status, enviar texto, logout, delete) |
| `src/lib/whatsapp-service.ts` | Camada de envio usada pelo motor de fluxo (chama `evolution-api.ts`) |
| `src/lib/flow-engine.ts` | Motor de execução dos fluxos — **maior parte ainda é TODO**, ver seção acima |
| `src/app/api/whatsapp/connect/route.ts` | Gera QR Code / conecta instância |
| `src/app/api/whatsapp/status/route.ts` | Polling de status (usado pelo front a cada 3s) |
| `src/app/api/whatsapp/disconnect/route.ts` | Desconecta de verdade (logout + delete da instância) |
| `src/components/flows/flow-builder.tsx` | Canvas do Construtor de Fluxos (React Flow), undo/redo, salvar, carregar template |
| `src/components/flows/node-config-drawer.tsx` | Painel lateral de configuração de cada tipo de bloco |
| `src/components/flows/nodes/types.ts` | Tipos de dados de cada bloco (`TriggerData`, `AiResponseData`, `StaticMessageData`, etc.) |
| `src/lib/templates/beauty-salon-template.ts` | Template pronto do fluxo "Salão de Beleza" (nodes + edges + system prompt da IA) |
| `src/auth.ts` / `src/auth.config.ts` | NextAuth v5 — login, RBAC, callbacks JWT/session |
| `prisma/schema.prisma` | Modelo de dados completo |

## Convenções e decisões importantes (não quebrar sem necessidade)

- `instanceNameFor(userId)` é determinístico — sempre gera o mesmo nome de instância na Evolution API para um dado tenant, então pode ser recalculado a qualquer momento (não precisa ser guardado com medo de "perder" o valor).
- E-mails sempre normalizados com `.toLowerCase().trim()` antes de comparar ou gravar no banco (login, seed, criação de cliente) — Postgres compara string exata.
- NextAuth v5 beta tem um bug de tipos no callback `session`: `token.id`/`token.role`/`token.mustChangePassword` chegam como `unknown` mesmo com a extensão de tipos declarada — por isso há casts explícitos (`as string`, `as Role`, `as boolean`) em `src/auth.config.ts`. Não remover sem testar o build.
- Limite de 3 botões / 10 itens de lista por mensagem (limite da própria API do WhatsApp) — validado no front (`flow-builder.tsx`) antes de permitir salvar o fluxo.
- O ambiente onde este handoff foi gerado não tinha acesso ao registro do npm (sandbox restrito), então nenhum `npm run build`/`npm install` foi rodado lá — toda validação de sintaxe foi feita com `tsc --noEmit` isolado. Vale rodar um build completo por aqui antes de ir pra produção com qualquer mudança nova.

## O que peço para você fazer agora

Leia os arquivos-chave listados acima (principalmente `flow-engine.ts`, `evolution-api.ts` e o schema do Prisma) para se situar na estrutura real do projeto. **Não modifique nada ainda** — só quero confirmar que você entendeu o estado atual antes de começarmos a implementar o motor de execução dos fluxos (os próximos passos sugeridos acima).
