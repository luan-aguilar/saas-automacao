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

## ⏳ Pendências abertas (checar aqui primeiro)

- **Forçar troca de senha temporária de verdade** (segurança, severidade baixa): hoje `mustChangePassword` só mostra um aviso visual em `/profile` — não existe nenhum bloqueio real impedindo o usuário de continuar usando o resto do sistema com a senha temporária indefinidamente. Identificado numa auditoria de segurança (2026-09-05), adiado de propósito por mexer em `middleware.ts`/`auth.config.ts` (risco de regressão em login sem poder testar ao vivo) — fazer com calma, testando bem.
- **Sincronizar "mensagem lida no celular" pro SaaS**: o código em `CHATS_UPDATE` (webhook do Evolution API) já tenta isso, mas o Luan reportou (2026-09-05) que não está funcionando. Suspeita: o Baileys pode emitir um evento separado (`message-receipt.update`) pra confirmação de leitura, distinto do `chats.update` que o código escuta hoje — não corrigido às cegas. **Esperando o Luan colar aqui o log real `[WEBHOOK RECEBIDO]`** (Vercel → Logs, filtrar `/api/webhooks/whatsapp`, marcar uma mensagem como lida no celular e pegar a linha que aparece) pra corrigir a extração com base no payload de verdade, não em suposição.
- **Klan Tattoo ainda não ativada como cliente**: template pronto, preço real configurado, mas falta cadastrar em `/clients` e parear o WhatsApp. `recipientPhones` da notificação está com o número pessoal do Luan pra teste — trocar pelo do estúdio antes de ativar de vez.
- **Migração da KFG pra API oficial da Meta**: ver checklist completo na seção "Provedores de WhatsApp" abaixo — pendência é do Luan (configuração no Meta for Developers).

## Migração de schema — RESOLVIDA (2026-09-04)

A branch `pending-schema-migration` (provider Cloud API, `sessionVersion`, campos de credencial da Meta) foi revisada, mesclada na `master`, o `npx prisma db push` rodou contra o banco de produção certo (confirmado por Project Ref do Supabase, `rlbzgtolemhgbnzbumnn`) e o build (`tsc --noEmit` + `npm run build`) passou limpo antes do `git push`. Não há pendência de sincronização entre schema e banco no momento — se uma sessão futura criar novos campos em `schema.prisma`, o procedimento é sempre o mesmo: `db push` contra produção ANTES de dar `git push` do código que os usa (rodar `db push` sem confirmar o projeto certo do Postgres é o jeito de derrubar login/atendimento pra TODOS os tenants de uma vez, não só o mais recente).

Regra permanente pra evitar isso de novo: se `schema.prisma` mudou num commit que ainda não chegou no `origin/master`, rode `db push` antes do `git push`, e confirme visualmente que o `DATABASE_URL`/`DIRECT_URL` locais apontam pro projeto Supabase certo (comparar o trecho `postgres.<ref>` da connection string com o painel do Supabase) antes de rodar — o comando em si é seguro/idempotente quando a mudança é aditiva, o risco real é aplicar no banco errado e achar que está sincronizado.

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
| Klan Tattoo | Tatuagem + piercing (São Caetano do Sul, também organiza a Tattoo Week) | `klan-tattoo-template.ts` | Construído em 2026-09-04, layout do Construtor de Fluxos reorganizado em colunas, fórmula de preço (`tattoo-price/route.ts`) com valores REAIS (Flash Tattoo R$92 promo/R$120 cheio, 5 níveis de região). Notificação final agora inclui o link da foto de referência (`foto_referencia_url`, adicionado 2026-09-05, mesmo padrão do Home Concept). `recipientPhones` está com o número PESSOAL do Luan pra ele testar antes de trocar pelo do estúdio. **AINDA NÃO ATIVADO** — falta cadastrar como cliente em `/clients` e parear WhatsApp |

## Provedores de WhatsApp — Evolution API (não-oficial) x Cloud API (oficial da Meta)

Cada tenant tem `WhatsappConnection.provider` (`EVOLUTION` default | `CLOUD_API`), decidido caso a caso conforme o número do cliente:

- **EVOLUTION** (padrão, usado por Home Concept e qualquer tenant novo por padrão): self-hosted, Baileys por trás, NÃO OFICIAL. Cliente HTTP em `src/lib/evolution-api.ts`, recebe eventos em `POST /api/webhooks/whatsapp`. Confirmado: seguro pro uso atual (fluxos disparados pelo CLIENTE mandando mensagem primeiro — inbound), mas **disparo em massa/frio pra contatos sem histórico de conversa é receita pra banimento de número**. Se algum dia pedirem pra automatizar disparo em massa, NÃO construa sem alertar explicitamente sobre esse risco (já houve um caso real: Lucas tentou fechar isso com um cliente sem consultar Luan). Também não convive bem num número que JÁ está registrado na API oficial da Meta em outro lugar — derruba a sessão direto (foi o que aconteceu com a KFG).
- **CLOUD_API** (código completo e no ar desde 2026-09-04, ainda não ativado pra nenhum tenant): API oficial do WhatsApp Business Platform da Meta (Graph API). Cliente HTTP em `src/lib/whatsapp-cloud-api.ts` (enviar texto/botão/lista, baixar mídia), recebe eventos em `POST /api/webhooks/whatsapp-cloud` (rota SEPARADA da do Evolution — payloads sem nenhuma relação, verificação GET via `hub.challenge` + `WHATSAPP_CLOUD_VERIFY_TOKEN`). Credenciais por tenant: `cloudApiPhoneNumberId` + `cloudApiWabaId` + `cloudApiAccessTokenEncrypted` (criptografado, mesmo esquema AES-256-GCM da chave da OpenAI). `src/lib/whatsapp-service.ts` (`resolveSendTarget`) decide o provedor uma vez por envio — `flow-engine.ts` **e** a Central de Atendimento (`/chat`, envio manual por humano) não sabem/não precisam saber qual provedor está por trás, já usam a mesma função.

  ### ⚠️ Antes de migrar um número: ele fica EXCLUSIVO da API
  Confirmado com o Luan (2026-09-05): depois que um número entra na Cloud API oficial da Meta, ele **não pode mais ser usado no app do WhatsApp/WhatsApp Business do celular, nem no WhatsApp Web/Desktop**. É uma restrição da própria Meta, não contornável. Isso significa que a equipe do tenant (ex: KFG) passa a assumir conversas exclusivamente pela **Central de Atendimento (`/chat`) do próprio SaaS** — nunca mais pelo celular. **Alinhar isso explicitamente com o cliente ANTES de migrar** — se algum atendente depende de responder pelo celular pessoal, o fluxo de trabalho deles quebra.

  ### Checklist — o que falta pra migrar a KFG (nessa ordem)
  1. ~~`npx prisma db push` contra produção~~ — **feito em 2026-09-04**.
  2. ~~Código do cliente Graph API + webhook + integração no `whatsapp-service.ts`~~ — **feito, em produção desde 2026-09-04**.
  3. ~~Gerar `WHATSAPP_CLOUD_VERIFY_TOKEN`~~ — **feito em 2026-09-05, já está no `.env` local**. **Falta**: cadastrar essa MESMA variável na Vercel (Settings → Environment Variables do projeto).
  4. ~~Script pra configurar um tenant como `CLOUD_API` sem precisar de UI~~ — **feito**: `scripts/set-cloud-api-credentials.ts` (uso: `npx tsx scripts/set-cloud-api-credentials.ts <email> <phoneNumberId> <wabaId> <accessToken>`).
  5. **Pendência do Luan, ainda não feita**: terminar a configuração no Meta for Developers — App com produto WhatsApp ativado, WABA da KFG vinculada, System User com **token permanente** (não o token de teste de 24h), anotar `phone_number_id` + `WABA ID` + token.
  6. **Pendência do Luan**: alinhar com a KFG a mudança de fluxo de trabalho (ver aviso acima) — decisão de negócio, não técnica.
  7. Depois do passo 5: rodar o script do passo 4 com os 3 valores reais.
  8. Cadastrar a URL do webhook no painel da Meta (`https://saas-automacao-eight.vercel.app/api/webhooks/whatsapp-cloud`), colando o mesmo `WHATSAPP_CLOUD_VERIFY_TOKEN` no campo "Verify Token" — a verificação só passa se essa variável já estiver na Vercel (passo 3).
  9. **NOVO (2026-09-05, achado numa auditoria de segurança)**: pegar o **"App Secret"** do App na Meta (Configurações Básicas → Chave Secreta do App) e cadastrar como `WHATSAPP_CLOUD_APP_SECRET` na Vercel + `.env` local. **Sem essa variável, TODO POST desse webhook é rejeitado de propósito (fail-closed)** — antes disso o endpoint aceitava qualquer payload sem checar nada, permitindo forjar mensagem em nome de qualquer contato só sabendo o `phone_number_id` do tenant. Ver `hasValidMetaSignature` em `src/app/api/webhooks/whatsapp-cloud/route.ts`.
  10. Testar: mandar mensagem de um celular de teste pro número da KFG, confirmar que chega no `/chat` e que o fluxo/IA responde normalmente; testar também uma resposta manual de humano pelo `/chat`.

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
- **Sincronização com o WhatsApp do celular, depois de conectado**: parcial. `CHATS_DELETE` (apagar conversa no celular → apaga no SaaS também, adicionado 2026-09-05) e `CHATS_UPDATE` (contador de não lidas — existente, mas o Luan reportou que "marcar como lido" não está sincronizando, ver Pendências no topo) já são tratados no webhook do Evolution API (`src/app/api/webhooks/whatsapp/route.ts`). **Baixar o histórico completo de conversas antigas ao conectar pela primeira vez (tipo WhatsApp Web) continua NÃO existindo** — decisão consciente de adiar (tecnicamente possível via eventos `MESSAGES_SET`/`CHATS_SET`/`CONTACTS_SET` do Evolution API, mas a própria documentação deles avisa que isso dispara "milhares de payloads" de uma vez em produção, exigindo tratamento em lote — projeto à parte, não uma mudança pequena).
- **Mudar `WEBHOOK_EVENTS` em `src/lib/evolution-api.ts` não basta sozinho**: instâncias do Evolution API JÁ CONECTADAS (KFG, Home Concept) continuam com a lista de eventos antiga até alguém rodar `setWebhook` de novo — não acontece sozinho. Rodar `npx tsx scripts/resync-evolution-webhooks.ts` depois de qualquer mudança nessa lista, pra não exigir desconectar/reconectar o WhatsApp de ninguém.
- Sempre rodar `npx tsc --noEmit` e `npm run build` antes de dar push — schema muda com `prisma db push` (sem histórico de migração), não `migrate dev`.
- **Toda variável de ambiente nova cadastrada na Vercel também tem que ir pro `.env` local** (e vice-versa) — o Luan trabalha de mais de uma máquina e precisa que o `.env` seja um espelho completo do que está configurado em produção. Nunca considerar "cadastrei na Vercel" como passo final.
- **`/settings` (config de IA: prompt/modelo/chave da OpenAI) é MASTER/CLIENTE only** (corrigido 2026-09-05, era uma falha real — qualquer FUNCIONARIO logado conseguia reescrever o prompt da IA e trocar a chave da OpenAI do tenant). Ao criar uma rota/página nova que mexe em configuração sensível do tenant (credenciais, comportamento da IA), sempre checar `session.user.role !== "FUNCIONARIO"` explicitamente — nunca só "está logado". Ver auditoria de segurança de 2026-09-05 no histórico de commits (`fix(security): ...`) pra outros achados já corrigidos (assinatura `X-Hub-Signature-256` no webhook da API oficial da Meta, log de segredo mascarado no webhook do Evolution API).
- **Nunca logar um segredo/token compartilhado por inteiro** (ex: `WHATSAPP_SERVICE_TOKEN`) mesmo em log de debug — mascarar (só os últimos 4 caracteres, ver `maskSecret` em `src/app/api/webhooks/whatsapp/route.ts`) ou omitir. Esses webhooks são autenticados por UM segredo global compartilhado entre TODOS os tenants — vazar ele no log da Vercel comprometeria todo mundo de uma vez, não só um tenant.

## Sistema de UI (toast / confirm dialog / skeleton) — adicionado 2026-09-05

Nenhuma lib externa — mesmo espírito hand-rolled dos outros primitivos em `src/components/ui/` (`Record<Variant,string>` + `cn()`, sem Radix/cva). Chamáveis de QUALQUER client component sem precisar de Provider:

- **Toast** (`src/lib/toast-store.ts` + `src/components/ui/toaster.tsx`, montado uma vez em `src/app/layout.tsx`): `toast({ title, description?, variant?, durationMs? })`. Fixado em `top-16` (abaixo da Topbar de 56px — `top-0` sobrepunha o nome/e-mail do usuário no canto superior direito).
- **Confirm dialog** (`src/lib/confirm-store.ts` + `src/components/ui/confirm-dialog.tsx`): substitui `window.confirm()` (quebrava o tema escuro) — `await confirm({ title?, description, confirmLabel?, cancelLabel?, variant? })`, mesma assinatura de uso (`if (!(await confirm(...))) return;`). Nenhum `window.confirm()` sobra no código.
- **Skeleton** (`src/components/ui/skeleton.tsx`): placeholder de carregamento genérico (`animate-pulse`), usado no lugar de texto solto "Carregando..." ou de piscar conteúdo errado.

Onde já estão conectados (não é exaustivo, é o padrão a seguir em telas novas): erro de arrastar card no Kanban, salvar/carregar template no Construtor de Fluxos, ativar/desativar/resetar senha em Equipe e Clientes, desconectar Google, ligar/desligar IA (geral e por conversa) no Chat, mensagens carregando no Chat.

## Bugs de UX corrigidos (2026-09-05, não repetir)

- **Central de Atendimento (`chat-panel.tsx`) não remonta ao trocar de conversa** (sem `key` por `chat.id`) — dois efeitos colaterais já corrigidos, mas o padrão importa pra quem mexer nesse componente de novo: (1) mensagens da conversa ANTERIOR ficavam visíveis por um instante sob o nome do contato novo (corrigido: zera `messages` + liga um `messagesLoading` ANTES do fetch novo começar, mostra skeleton); (2) o scroll pro fim usava `behavior: "smooth"` mesmo no carregamento inicial (dezenas de mensagens de uma vez), causando descida visível do topo — agora só a primeira renderização de uma conversa usa scroll instantâneo, mensagens seguintes (chegando com a conversa já aberta) continuam com scroll suave.
- **Toggle de IA por conversa**: a mensagem de sistema ("IA reativada.../IA pausada...") já era criada na hora, no banco — o atraso percebido era só o polling de 4s da tela pra buscar mensagens novas. Corrigido com um reload forçado (reaproveita o `reloadSignal` que já existia) + toast de "aguarde" que fecha sozinho quando a busca CONFIRMA que recarregou — cuidado ao mexer aqui: o callback que fecha o toast (`onMessagesLoaded`) só pode disparar na busca FORÇADA, nunca no polling periódico de fundo, senão um polling que termina por coincidência um instante antes fecha o toast cedo demais (bug real que já aconteceu e foi corrigido).
- **Botão Ativo/Inativo do Construtor de Fluxos** virou um `Switch` com rótulo explícito e efeito IMEDIATO (rota `PATCH /api/flows/:id` dedicada, só troca `isActive`, não mexe em nodes/edges) — antes era um `Button` ambíguo (o texto mostrava o estado atual ou era uma ação a executar?) que só mudava estado local até clicar em "Salvar fluxo" também, sem deixar claro se esse segundo clique era necessário.
- **QR Code do WhatsApp** (`qr-display.tsx`) expira em 60s no servidor mas ficava "morto" na tela sem nenhum aviso — agora mostra "QR Code expirado" + botão de gerar novo + contador regressivo.

## Arquivos-chave

| Arquivo | O que é |
|---|---|
| `src/lib/flow-engine.ts` | Motor de execução dos fluxos — completo, todos os tipos de bloco implementados, agnóstico de provedor de WhatsApp |
| `src/lib/evolution-api.ts` | Cliente HTTP da Evolution API v2 (provedor não-oficial) |
| `src/lib/whatsapp-cloud-api.ts` | Cliente HTTP da API oficial da Meta (Graph API) — completo, aguardando credenciais reais da KFG |
| `scripts/set-cloud-api-credentials.ts` | Configura um tenant como `CLOUD_API` (sem UI) — rodar quando a KFG tiver as credenciais da Meta |
| `scripts/resync-evolution-webhooks.ts` | Atualiza a lista de eventos assinados de conexões Evolution API já existentes, sem exigir reconectar |
| `src/lib/toast-store.ts` / `src/components/ui/toaster.tsx` | Sistema de toast (ver seção própria acima) |
| `src/lib/confirm-store.ts` / `src/components/ui/confirm-dialog.tsx` | Substitui `window.confirm()` (ver seção própria acima) |
| `src/components/flows/node-colors.ts` | Cor de cada tipo de bloco do Construtor de Fluxos — fonte única, nunca hardcode cor de node em outro lugar |
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
