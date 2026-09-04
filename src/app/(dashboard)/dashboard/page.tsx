import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, MessageSquareText, Workflow, Users } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = getTenantId(session!.user);
  const role = session!.user.role;

  // Mesmo filtro de `GET /api/chats` (ver doc de `Chat.connectedPhoneNumber`
  // em schema.prisma) — sem isso, os contadores de conversas somavam também
  // o histórico de um número antigo reconectado por outra pessoa (ex: o
  // ex-sócio que usou o próprio WhatsApp pessoal nesta conta antes).
  const connection = await prisma.whatsappConnection.findUnique({
    where: { userId },
    select: { phoneNumber: true },
  });
  const chatFilter = connection?.phoneNumber
    ? { userId, connectedPhoneNumber: connection.phoneNumber }
    : { userId, id: { in: [] } }; // sem número conectado, nenhum chat é legítimo

  const [flowsCount, chatsCount, openChatsCount, clientsCount] = await Promise.all([
    prisma.flow.count({ where: { userId } }),
    prisma.chat.count({ where: chatFilter }),
    prisma.chat.count({ where: { ...chatFilter, status: "OPEN" } }),
    role === "MASTER" ? prisma.user.count({ where: { role: "CLIENTE" } }) : Promise.resolve(0),
  ]);

  const cards = [];
  if (role !== "FUNCIONARIO") {
    cards.push({ label: "Fluxos criados", value: flowsCount, icon: Workflow, href: "/flows" });
  }
  cards.push(
    { label: "Conversas abertas", value: openChatsCount, icon: MessageSquareText, href: "/chat" },
    { label: "Total de conversas", value: chatsCount, icon: Bot, href: "/chat" }
  );

  if (role === "MASTER") {
    cards.push({ label: "Clientes ativos", value: clientsCount, icon: Users, href: "/clients" });
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Visão Geral</h2>
        <p className="text-sm text-muted-foreground">
          Bem-vindo de volta, {session!.user.name}. Aqui está um resumo do seu robô.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-semibold">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primeiros passos</CardTitle>
          <CardDescription>Configure seu robô em poucos minutos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StepItem step={1} title="Configure sua IA" description="Adicione sua API Key da OpenAI e o prompt do robô em Configurações." href="/settings" />
          <StepItem step={2} title="Conecte o WhatsApp" description="Escaneie o QR Code para parear seu número na tela de Conexão WhatsApp." href="/whatsapp" />
          <StepItem step={3} title="Monte seu fluxo" description="Use o Construtor de Fluxos para desenhar a jornada de atendimento." href="/flows" />
          <StepItem step={4} title="Acompanhe as conversas" description="Use a Central de Atendimento para intervir manualmente quando precisar." href="/chat" />
        </CardContent>
      </Card>
    </div>
  );
}

function StepItem({
  step,
  title,
  description,
  href,
}: {
  step: number;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
