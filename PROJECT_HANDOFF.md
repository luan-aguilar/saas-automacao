# saas-automacao — Handoff de contexto

Este documento existe pra qualquer sessão nova do Claude Code (rodando de outro computador, sem a conversa anterior) se situar rápido. Mantenha-o atualizado sempre que algo relevante mudar — é o que substitui a "memória" entre máquinas diferentes.

## Quem é o dono deste projeto

Luan constrói este SaaS sozinho hoje. Havia uma sociedade de 3 (Luan + Lucas, comercial/vendas + Raphael, tráfego pago) que se desfez em setembro/2026 — Lucas fechou um contrato de R$4.000 sem consultar Luan e ofereceu uma divisão injusta (R$1.500 dele vs. R$1.000+R$1.000+R$500 pros outros três, sem mensalidade), ameaçando trocar de dev quando Luan questionou. Luan saiu da sociedade. Toda a infraestrutura (repositório, Vercel, banco, WhatsApp, chaves de API) está nas contas PESSOAIS do Luan — ele não precisa de permissão de ninguém pra continuar.

Luan também mantém um segundo projeto solo, **capturarleads** (`D:\projetos\capturarleads`) — gera landing pages automáticas pra prospectar clientes sem site. Os dois produtos miram o mesmo tipo de cliente (pequenos negócios locais) e podem ser vendidos juntos.

## Visão geral do produto

Plataforma multi-tenant de automação de atendimento no WhatsApp com IA (OpenAI), vendida por Luan pra donos de negócio. Cada tenant (`role: CLIENTE`) tem sua própria conexão de WhatsApp, configuração de IA e Construtor de Fluxos visual (estilo n8n, drag-and-drop). Um `MASTER` (o próprio Luan) administra os tenants.

## Stack técnica

- Next.js 14 (App Router) + TypeScript, deploy na Vercel (git-linked, push na `master` publica sozinho)
- Prisma ORM + PostgreSQL (Supabase) — **sem pasta de migrações tracked, usa `npx prisma db push`** (não `migrate dev`)
- NextAuth v5 (beta) — Credentials, sessão JWT, RBAC (`MASTER` / `CLIENTE` / `FUNCIONARIO`)
- `@xyflow/react` (React Flow v12) — Construtor de Fluxos visual
- **Evolution API v2** (self-hosted, Baileys por trás) como gateway do WhatsApp — API NÃO OFICIAL. Ver seção de riscos abaixo.
- OpenAI (chave própria por tenant, criptografada em `Config.openaiApiKeyEncrypted`)
- bcryptjs (não bcrypt nativo — roda em serverless da Vercel sem binário nativo)

## Estado atual: TUDO FUNCIONANDO EM PRODUÇÃO

Ao contrário de handoffs antigos deste arquivo, o motor de fluxos está **completo e rodando de verdade** com clientes reais pagando (ver "Tenants ativos" abaixo). Cobertura:

- Webhook `POST /api/webhooks/whatsapp` recebe mensagens reais da Evolution API e dispara o motor.
- `src/lib/flow-engine.ts` executa todos os tipos de bloco: `trigger`, `aiResponse` (chama a OpenAI de verdade, contrato JSON forçado — ver `AI_JSON_CONTRACT`), `staticMessage` (texto/botões/lista), `condition`, `keywordCatalog`, `alertNotification`, `webhook` (POST externo, resposta JSON vira variáveis do fluxo), `googleCalendarSlots`/`googleCalendarBook`.
- `FlowSession` persiste em qual node cada contato está parado + as variáveis já coletadas, por tenant+contato.
- Fotos recebidas do cliente são baixadas/salvas (`MediaAsset`) e servidas publicamente em `/api/media/[id]` — mas a IA só "enxerga" a imagem de verdade se o node tiver `analyzeAttachedImages: true` (flag novo, opt-in — ver seção abaixo).
- Central de Atendimento (`/chat`), Kanban (`/pipeline`), gestão de clientes MASTER (`/clients`), Construtor de Fluxos (`/flows`) — tudo implementado e em uso.

## Tenants ativos (clientes reais)

| Tenant | Segmento | Template | Situação |
|---|---|---|---|
| Home Concept (Igor) | Salão de beleza | `beauty-salon-template.ts` | Rodando, começou como favor/case, virou fonte de indicações |
| KFG | Revenda de veículos | `kfg-template.ts` | Pago (R$2.000 implantação + R$199/mês, valor antigo — rever agora que Luan está sozinho) |
| Klan Tattoo | Tatuagem + piercing (São Caetano do Sul, também organiza a Tattoo Week) | `klan-tattoo-template.ts` | **Construído em 2026-09-04, AINDA NÃO ATIVADO** — falta: cadastrar como cliente em `/clients`, parear WhatsApp, ajustar fórmula de preço (`src/app/api/webhooks/tattoo-price/route.ts` — valores são PLACEHOLDER), preencher número de notificação (`recipientPhones` vazio no template) |

## ⚠️ Risco conhecido — Evolution API é NÃO OFICIAL

Confirmado: WhatsApp roda via Baileys/Evolution API (não é a Business API oficial da Meta). Isso é seguro pro uso atual (fluxos disparados por CLIENTE mandando mensagem primeiro — inbound), mas **disparo em massa/frio pra contatos sem histórico de conversa é receita pra banimento de número**. Se algum dia pedirem pra automatizar disparo em massa (ex: follow-up de leads frios em lote), NÃO construa sem alertar explicitamente sobre esse risco — já houve um caso real (Lucas tentou fechar isso com um cliente sem consultar Luan).

## Convenções e decisões importantes (não quebrar sem necessidade)

- **Cada template de cliente é um arquivo próprio e independente** (`beauty-salon-template.ts`, `kfg-template.ts`, `klan-tattoo-template.ts`) — nenhum importa lógica de negócio dos outros (só helpers genéricos de `flow-helpers.ts`: `conditionNode`, `plainTextNode`, `edge`). Ao criar um 4º template, siga o mesmo padrão: arquivo próprio, registrar em `src/lib/templates/registry.ts`.
- **`Chat.connectedPhoneNumber`** (adicionado 2026-09-04): grava qual número de WhatsApp do tenant estava conectado quando a conversa nasceu. `GET /api/chats` filtra por isso — resolve um bug real onde reconectar com um número DIFERENTE (ex: outra pessoa pareando o próprio número pessoal na mesma conta MASTER) deixava o histórico do número antigo visível. Sempre que criar um `Chat` novo em código, stampar esse campo (ver `logInboundMessageAndGetChat` em `flow-engine.ts` e o handler `fromMe` em `route.ts` do webhook).
- **`AiResponseData.analyzeAttachedImages`** (adicionado 2026-09-04): opt-in, `false`/ausente por padrão. Quando `true`, o node anexa a foto mais recente do contato como entrada visual DE VERDADE na chamada da OpenAI (`image_url`), não só o texto do link. **Nunca ligue isso num node de um template já em produção sem confirmar com o Luan antes** — muda o que o modelo efetivamente processa.
- E-mails sempre normalizados com `.toLowerCase().trim()` antes de comparar/gravar.
- `instanceNameFor(userId)` é determinístico — recalculável a qualquer momento.
- Sincronização de histórico ao conectar (tipo WhatsApp Web) **não existe ainda** — o webhook só processa mensagens novas a partir do momento da conexão. Feature real, ainda não construída.
- Sempre rodar `npx tsc --noEmit` e `npm run build` antes de dar push — schema muda com `prisma db push` (sem histórico de migração), não `migrate dev`.

## Arquivos-chave

| Arquivo | O que é |
|---|---|
| `src/lib/flow-engine.ts` | Motor de execução dos fluxos — completo, todos os tipos de bloco implementados |
| `src/lib/evolution-api.ts` | Cliente HTTP da Evolution API v2 |
| `src/lib/whatsapp-service.ts` | Camada de envio (chama `evolution-api.ts`) |
| `src/app/api/webhooks/whatsapp/route.ts` | Recebe eventos da Evolution API (mensagens, status de conexão) |
| `src/app/api/webhooks/tattoo-price/route.ts` | Calcula estimativa de preço de tatuagem pro fluxo da Klan (fórmula PLACEHOLDER) |
| `src/components/flows/nodes/types.ts` | Tipos de dados de cada bloco do Construtor de Fluxos |
| `src/lib/templates/*.ts` | Um arquivo por cliente/segmento — ver tabela de tenants acima |
| `src/lib/templates/registry.ts` | Catálogo dos templates — registrar aqui ao criar um novo |
| `prisma/schema.prisma` | Modelo de dados completo |

## Se você é uma sessão nova começando aqui

Leia este arquivo inteiro antes de mexer em qualquer coisa. Se o Luan pedir pra continuar algo específico, pergunte o que ele quer fazer — não presuma que é continuar exatamente de onde uma conversa anterior parou, ele pode ter mudado de prioridade.
