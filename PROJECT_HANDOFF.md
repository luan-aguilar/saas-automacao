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
- **Gateway do WhatsApp: dois provedores possíveis por tenant** (`WhatsappConnection.provider`) — ver seção própria abaixo.
- OpenAI (chave própria por tenant, criptografada em `Config.openaiApiKeyEncrypted`)
- bcryptjs (não bcrypt nativo — roda em serverless da Vercel sem binário nativo)

## ⚠️ PENDÊNCIA CRÍTICA — migração de schema não aplicada no banco de produção

Existem commits locais (não dados de `git push`) que mudam `prisma/schema.prisma` — o Luan não tem o `.env` (acesso ao Postgres) na máquina onde essas sessões rodam, só no computador de casa. **Antes de dar push desses commits pro `origin/master`**, é obrigatório rodar `npx prisma db push` contra o banco de produção (com o `.env` de casa) — sem isso, `authorize()` em `src/auth.ts` (login, usado por TODO mundo — MASTER, KFG, Home Concept) quebra global, porque busca o usuário sem `select` e o Prisma Client novo espera colunas que ainda não existem no Postgres real.

Se você é uma sessão nova e vê commits locais à frente de `origin/master` tocando `schema.prisma`: NÃO dê push sem antes confirmar com o Luan se o `db push` já rodou. Ver `git log` e comparar com `git log origin/master` pra saber exatamente quais commits estão pendentes.

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
| Home Concept (Igor) | Salão de beleza | `beauty-salon-template.ts` | Rodando estável no Evolution API (número nunca teve nenhum serviço oficial da Meta ativo) |
| KFG | Revenda de veículos | `kfg-template.ts` | Pago (R$2.000 implantação + R$199/mês, valor antigo — rever agora que Luan está sozinho). **Migrando pra CLOUD_API (2026-09-04)** — ver seção de provedores abaixo, número deles já estava registrado num serviço oficial da Meta por terceiros, incompatível com Evolution API (desconectava direto) |
| Klan Tattoo | Tatuagem + piercing (São Caetano do Sul, também organiza a Tattoo Week) | `klan-tattoo-template.ts` | Construído em 2026-09-04, layout do Construtor de Fluxos reorganizado em colunas, fórmula de preço (`tattoo-price/route.ts`) com valores REAIS (Flash Tattoo R$92 promo/R$120 cheio, 5 níveis de região). `recipientPhones` está com o número PESSOAL do Luan pra ele testar antes de trocar pelo do estúdio. **AINDA NÃO ATIVADO** — falta cadastrar como cliente em `/clients` e parear WhatsApp |

## Provedores de WhatsApp — Evolution API (não-oficial) x Cloud API (oficial da Meta)

Cada tenant tem `WhatsappConnection.provider` (`EVOLUTION` default | `CLOUD_API`), decidido caso a caso conforme o número do cliente:

- **EVOLUTION** (padrão, usado por Home Concept e qualquer tenant novo por padrão): self-hosted, Baileys por trás, NÃO OFICIAL. Cliente HTTP em `src/lib/evolution-api.ts`, recebe eventos em `POST /api/webhooks/whatsapp`. Confirmado: seguro pro uso atual (fluxos disparados pelo CLIENTE mandando mensagem primeiro — inbound), mas **disparo em massa/frio pra contatos sem histórico de conversa é receita pra banimento de número**. Se algum dia pedirem pra automatizar disparo em massa, NÃO construa sem alertar explicitamente sobre esse risco (já houve um caso real: Lucas tentou fechar isso com um cliente sem consultar Luan). Também não convive bem num número que JÁ está registrado na API oficial da Meta em outro lugar — derruba a sessão direto (foi o que aconteceu com a KFG).
- **CLOUD_API** (em construção, 2026-09-04, pra KFG): API oficial do WhatsApp Business Platform da Meta (Graph API). Cliente HTTP em `src/lib/whatsapp-cloud-api.ts`, recebe eventos em `POST /api/webhooks/whatsapp-cloud` (rota SEPARADA da do Evolution — payloads sem nenhuma relação). Credenciais por tenant: `cloudApiPhoneNumberId` + `cloudApiWabaId` + `cloudApiAccessTokenEncrypted` (criptografado, mesmo esquema AES-256-GCM da chave da OpenAI). `src/lib/whatsapp-service.ts` (`resolveSendTarget`) decide o provedor uma vez por envio — `flow-engine.ts` não sabe/não precisa saber qual provedor está por trás.
  - **Pendências antes de ativar a KFG**: (1) `npx prisma db push` (ver pendência crítica no topo); (2) Luan terminar a configuração no Meta for Developers (App + WABA + System User com token permanente) e me passar `phoneNumberId`/`wabaId`/token; (3) cadastrar `WHATSAPP_CLOUD_VERIFY_TOKEN` na Vercel E no webhook da Meta; (4) popular `WhatsappConnection` da KFG com `provider: CLOUD_API` + as credenciais (ainda não existe UI pra isso — decisão consciente de não construir uma tela só pro primeiro caso de uso, fazer isso direto no banco/script quando chegar a hora).
  - **Custo real, não só técnico**: a partir de 01/10/2026 a Meta cobra por mensagem de resposta livre dentro da janela de atendimento (`categoria "service"` — hoje grátis). Isso muda a margem de vender robô pra clientes na API oficial — considerar isso ao fechar preço.
  - **Se quiser virar plataforma self-service tipo ChatGuru** (onboarding de QUALQUER cliente futuro direto pela API oficial, sem repetir esse processo manual): existe o programa "Tech Provider" + "Embedded Signup" da Meta — pesquisado, mas NÃO iniciado ainda (decisão de esperar validar o caso da KFG primeiro).

## Convenções e decisões importantes (não quebrar sem necessidade)

- **Cada template de cliente é um arquivo próprio e independente** (`beauty-salon-template.ts`, `kfg-template.ts`, `klan-tattoo-template.ts`) — nenhum importa lógica de negócio dos outros (só helpers genéricos de `flow-helpers.ts`: `conditionNode`, `plainTextNode`, `edge`). Ao criar um 4º template, siga o mesmo padrão: arquivo próprio, registrar em `src/lib/templates/registry.ts`.
- **`Chat.connectedPhoneNumber`** (adicionado 2026-09-04): grava qual número de WhatsApp do tenant estava conectado quando a conversa nasceu. Resolve um bug real onde reconectar com um número DIFERENTE (ex: outra pessoa pareando o próprio número pessoal na mesma conta MASTER) deixava o histórico do número antigo visível. **TODO lugar que lista/conta `Chat` por tenant precisa filtrar por esse campo batendo com `WhatsappConnection.phoneNumber` atual** — já corrigido em `GET /api/chats`, `chat/page.tsx`, `pipeline/page.tsx` e `dashboard/page.tsx` (2026-09-04, 3 desses tinham ficado pra trás quando o campo foi criado — SSR sem esse filtro mostrava o histórico antigo por alguns segundos até o polling do client corrigir sozinho). Sempre que criar um `Chat` novo em código, stampar esse campo (ver `logInboundMessageAndGetChat` em `flow-engine.ts` e o handler `fromMe` em `route.ts` do webhook).
- **Status de WhatsApp em `/clients` (lista do MASTER)**: consulta a Evolution API AO VIVO a cada carregamento da página (não só o campo cacheado no banco) — o webhook `CONNECTION_UPDATE` da Evolution API às vezes falha em entregar (API não-oficial), deixando o status cacheado desatualizado. Ver `clients/page.tsx`.
- **Botão "Deslogar de todas as sessões"** (`/profile`, só visível pra MASTER, adicionado 2026-09-04): incrementa `User.sessionVersion`, invalidando toda sessão JWT antiga daquele usuário (cobre o caso dos ex-sócios ainda terem login/senha do MASTER de antes da separação). Checagem contra o banco só roda pra role MASTER, e só na instância Node do NextAuth (`src/auth.ts`) — o middleware Edge (`auth.config.ts`) nunca importa Prisma, continua intocado. Não afeta CLIENTE/FUNCIONARIO.
- **`AiResponseData.analyzeAttachedImages`** (adicionado 2026-09-04): opt-in, `false`/ausente por padrão. Quando `true`, o node anexa a foto mais recente do contato como entrada visual DE VERDADE na chamada da OpenAI (`image_url`), não só o texto do link. **Nunca ligue isso num node de um template já em produção sem confirmar com o Luan antes** — muda o que o modelo efetivamente processa.
- E-mails sempre normalizados com `.toLowerCase().trim()` antes de comparar/gravar.
- `instanceNameFor(userId)` é determinístico — recalculável a qualquer momento.
- Sincronização de histórico ao conectar (tipo WhatsApp Web) **não existe ainda** — o webhook só processa mensagens novas a partir do momento da conexão. Feature real, ainda não construída.
- Sempre rodar `npx tsc --noEmit` e `npm run build` antes de dar push — schema muda com `prisma db push` (sem histórico de migração), não `migrate dev`.

## Arquivos-chave

| Arquivo | O que é |
|---|---|
| `src/lib/flow-engine.ts` | Motor de execução dos fluxos — completo, todos os tipos de bloco implementados, agnóstico de provedor de WhatsApp |
| `src/lib/evolution-api.ts` | Cliente HTTP da Evolution API v2 (provedor não-oficial) |
| `src/lib/whatsapp-cloud-api.ts` | Cliente HTTP da API oficial da Meta (Graph API) — em construção pra KFG |
| `src/lib/whatsapp-service.ts` | Camada de envio única (`resolveSendTarget` escolhe Evolution ou Cloud API por tenant) |
| `src/app/api/webhooks/whatsapp/route.ts` | Recebe eventos da Evolution API (mensagens, status de conexão) |
| `src/app/api/webhooks/whatsapp-cloud/route.ts` | Recebe eventos da API oficial da Meta (rota separada, payload diferente) |
| `src/app/api/webhooks/tattoo-price/route.ts` | Calcula preço de tatuagem pro fluxo da Klan (valores REAIS, confirmados 2026-09-04) |
| `src/app/api/profile/logout-all-sessions/route.ts` | Botão MASTER de logout de todas as sessões (`sessionVersion`) |
| `src/components/flows/nodes/types.ts` | Tipos de dados de cada bloco do Construtor de Fluxos |
| `src/lib/templates/*.ts` | Um arquivo por cliente/segmento — ver tabela de tenants acima |
| `src/lib/templates/registry.ts` | Catálogo dos templates — registrar aqui ao criar um novo |
| `prisma/schema.prisma` | Modelo de dados completo |

## Se você é uma sessão nova começando aqui

Leia este arquivo inteiro antes de mexer em qualquer coisa. Se o Luan pedir pra continuar algo específico, pergunte o que ele quer fazer — não presuma que é continuar exatamente de onde uma conversa anterior parou, ele pode ter mudado de prioridade.
