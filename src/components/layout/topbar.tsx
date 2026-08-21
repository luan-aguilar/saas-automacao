import { UserNav } from "./user-nav";
import { Badge } from "@/components/ui/badge";

export function Topbar({
  title,
  name,
  email,
  role,
}: {
  title: string;
  name: string;
  email: string;
  role: string;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">{title}</h1>
        {role === "MASTER" && (
          <Badge variant="default" className="hidden sm:inline-flex">
            MASTER
          </Badge>
        )}
        {role === "FUNCIONARIO" && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            FUNCIONÁRIO
          </Badge>
        )}
      </div>
      <UserNav name={name} email={email} role={role} />
    </header>
  );
}
