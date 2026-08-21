import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
  const session = await auth();

  // Busca direto no banco (em vez de confiar só no claim do JWT da sessão)
  // para o aviso de "senha temporária" abaixo sempre refletir o estado atual
  // — o token da sessão só é regravado no próximo login, então continuaria
  // mostrando o aviso mesmo depois do usuário já ter trocado a senha aqui.
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-semibold">Meu Perfil</h2>
        <p className="text-sm text-muted-foreground">Seus dados de acesso à plataforma.</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da conta</CardTitle>
            <CardDescription>Informações do seu cadastro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">Nome</span>
              <span className="font-medium">{user?.name}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">E-mail</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tipo de acesso</span>
              <Badge variant={user?.role === "MASTER" ? "default" : "outline"}>
                {user?.role === "MASTER" ? "MASTER" : user?.role === "FUNCIONARIO" ? "Funcionário" : "Cliente"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <ChangePasswordForm mustChangePassword={user?.mustChangePassword ?? false} />
      </div>
    </div>
  );
}
