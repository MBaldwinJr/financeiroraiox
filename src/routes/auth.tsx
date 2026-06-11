import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Sparkles, Wallet, ChartLine, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Entrar — Finance Vision Pro" }],
  }),
  component: AuthPage,
});

const credSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});
type CredForm = z.infer<typeof credSchema>;

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ChartLine className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Finance Vision Pro</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Sua planilha de DRE,
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              transformada em inteligência.
            </span>
          </h1>
          <p className="max-w-md text-muted-foreground">
            Dashboard executivo, DRE dinâmico, fluxo de caixa e gráficos premium — tudo em
            tempo real para decisões financeiras melhores.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[
              { icon: Sparkles, label: "DRE Automático" },
              { icon: Wallet, label: "Multiempresa" },
              { icon: ChartLine, label: "BI em tempo real" },
            ].map((f) => (
              <div key={f.label} className="glass-card rounded-xl p-3 text-center">
                <f.icon className="mx-auto mb-2 h-5 w-5 text-primary" />
                <p className="text-xs text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-xs text-muted-foreground">© Finance Vision Pro</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center lg:text-left">
            <h2 className="text-2xl font-bold">Acesse sua conta</h2>
            <p className="text-sm text-muted-foreground">Entre ou crie uma nova empresa.</p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const r = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (r.error) {
                toast.error("Falha ao entrar com Google");
                setLoading(false);
                return;
              }
              if (r.redirected) return;
              navigate({ to: "/dashboard", replace: true });
            }}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84Z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
              />
            </svg>
            Continuar com Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">ou com email</span>
            </div>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <CredentialsForm
                cta="Entrar"
                loading={loading}
                onSubmit={async ({ email, password }) => {
                  setLoading(true);
                  const { error } = await supabase.auth.signInWithPassword({ email, password });
                  setLoading(false);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  navigate({ to: "/dashboard", replace: true });
                }}
              />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <CredentialsForm
                cta="Criar conta"
                loading={loading}
                onSubmit={async ({ email, password }) => {
                  setLoading(true);
                  const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: window.location.origin },
                  });
                  setLoading(false);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  toast.success("Conta criada! Entrando…");
                  const { error: signInErr } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (!signInErr) navigate({ to: "/dashboard", replace: true });
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function CredentialsForm({
  cta,
  loading,
  onSubmit,
}: {
  cta: string;
  loading: boolean;
  onSubmit: (data: CredForm) => Promise<void>;
}) {
  const form = useForm<CredForm>({
    resolver: zodResolver(credSchema),
    defaultValues: { email: "", password: "" },
  });
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="email" type="email" className="pl-9" {...form.register("email")} />
        </div>
        {form.formState.errors.email && (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="password" type="password" className="pl-9" {...form.register("password")} />
        </div>
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={loading || form.formState.isSubmitting}>
        {cta}
      </Button>
    </form>
  );
}
