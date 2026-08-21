import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { SettingsForm } from "@/components/settings/settings-form";
import { GoogleIntegrationCard } from "@/components/settings/google-integration-card";

export default async function SettingsPage() {
  const session = await auth();
  const config = await prisma.config.findUnique({ where: { userId: getTenantId(session!.user) } });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Configurações</h2>
        <p className="text-sm text-muted-foreground">
          Configure a integração com a OpenAI e o comportamento padrão do robô.
        </p>
      </div>

      <div className="max-w-2xl">
        <SettingsForm
          initialConfig={
            config
              ? {
                  hasApiKey: Boolean(config.openaiApiKeyEncrypted),
                  apiKeyPreview: config.openaiApiKeyLast4 ? `sk-...${config.openaiApiKeyLast4}` : null,
                  systemPrompt: config.systemPrompt,
                  model: config.model,
                  temperature: config.temperature,
                  aiEnabledDefault: config.aiEnabledDefault,
                }
              : null
          }
        />
        <div className="mt-6">
          <GoogleIntegrationCard />
        </div>
      </div>
    </div>
  );
}
