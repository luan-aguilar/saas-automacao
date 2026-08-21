"use client";

import Image from "next/image";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SparkBackground } from "@/components/login/spark-background";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <SparkBackground />
      <Card className="relative z-10 w-full max-w-sm shadow-[0_0_40px_-8px_hsl(var(--primary)/0.35),0_4px_24px_-8px_rgba(0,0,0,0.7)]">
        <CardHeader className="items-center text-center">
          <Image
            src="/logo-digital-analytics.png"
            alt={APP_NAME}
            width={88}
            height={88}
            priority
            className="mb-2 drop-shadow-[0_0_12px_hsl(var(--gold)/0.4)]"
          />
          <CardTitle className="text-xl">{APP_NAME}</CardTitle>
          <p className="text-sm font-medium text-primary">{APP_TAGLINE}</p>
          <CardDescription>Entre com seu e-mail e senha para acessar o painel</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" placeholder="voce@empresa.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required />
            </div>
            {state?.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <SubmitButton />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
