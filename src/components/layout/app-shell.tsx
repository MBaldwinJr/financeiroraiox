import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileBarChart,
  ListChecks,
  Wallet,
  Layers,
  BookOpen,
  Upload,
  Settings,
  LogOut,
  Plus,
  Building2,
  ChevronDown,
  ChartLine,
  TrendingUp,
  TrendingDown,
  Waves,
  Target,
  FileText,
  Sparkles,
  Activity,
  Gauge as GaugeIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyStore } from "@/stores/company-store";
import { supabase } from "@/integrations/supabase/client";
import { listMyCompanies, createCompany } from "@/features/companies/companies.functions";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV_MAIN = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dre", label: "DRE", icon: FileBarChart },
  { to: "/fluxo-caixa", label: "Fluxo de Caixa", icon: Waves },
  { to: "/receitas", label: "Receitas", icon: TrendingUp },
  { to: "/despesas", label: "Despesas", icon: TrendingDown },
  { to: "/centros-custos", label: "Centros de Custos", icon: Layers },
  { to: "/contas", label: "Contas Bancárias", icon: Wallet },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/analises", label: "Análises", icon: Activity },
  { to: "/ia", label: "IA Financeira", icon: Sparkles },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const NAV_OPS = [
  { to: "/raio-x", label: "Raio-X Financeiro", icon: GaugeIcon },
  { to: "/lancamentos", label: "Lançamentos", icon: ListChecks },
  { to: "/cadastros", label: "Cadastros", icon: BookOpen },
  { to: "/importar", label: "Importar", icon: Upload },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="ml-64 flex-1">
        <Topbar />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="px-6 py-6 lg:px-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ChartLine className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Finance Vision</p>
          <p className="text-xs text-muted-foreground">Pro</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        <NavSection title="Principal" items={NAV_MAIN} path={path} />
        <div className="my-3 h-px bg-sidebar-border" />
        <NavSection title="Operações" items={NAV_OPS} path={path} />
      </nav>


      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </aside>
  );
}

type NavItem = { to: string; label: string; icon: typeof ChartLine };

function NavSection({
  title,
  items,
  path,
}: {
  title: string;
  items: ReadonlyArray<NavItem>;
  path: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </p>
      {items.map((item) => {
        const active = path === item.to || path.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to as never}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
            {active && (
              <motion.span
                layoutId="active-indicator"
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}


function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md lg:px-8">
      <CompanySwitcher />
      <div className="text-xs text-muted-foreground numeric">
        {new Date().toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
      </div>
    </header>
  );
}

function CompanySwitcher() {
  const fetchCompanies = useServerFn(listMyCompanies);
  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => fetchCompanies(),
  });
  const { activeCompanyId, setActiveCompanyId } = useCompanyStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!data?.length) return;
    if (!activeCompanyId || !data.find((c) => c.id === activeCompanyId)) {
      setActiveCompanyId(data[0].id);
    }
  }, [data, activeCompanyId, setActiveCompanyId]);

  const active = data?.find((c) => c.id === activeCompanyId);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Building2 className="h-4 w-4" />
            {isLoading ? "Carregando…" : (active?.name ?? "Selecione")}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Minhas empresas</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(data ?? []).map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => {
                setActiveCompanyId(c.id);
                queryClient.invalidateQueries();
              }}
            >
              <Building2 className="mr-2 h-4 w-4" />
              {c.name}
              <span className="ml-auto text-xs text-muted-foreground">{c.role}</span>
            </DropdownMenuItem>
          ))}
          {data && data.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma empresa ainda.</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewCompanyDialog />
    </div>
  );
}

function NewCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useServerFn(createCompany);
  const queryClient = useQueryClient();
  const { setActiveCompanyId } = useCompanyStore();
  const mutation = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: (company) => {
      toast.success("Empresa criada!");
      setActiveCompanyId(company.id);
      queryClient.invalidateQueries();
      setOpen(false);
      setName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Nova empresa">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            mutation.mutate(name.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Nome da empresa</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Auto Center Silva"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando…" : "Criar empresa"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/40">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {email.slice(0, 1).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{email || "Usuário"}</p>
            <p className="truncate text-[10px] text-muted-foreground">Conta</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await queryClient.cancelQueries();
            queryClient.clear();
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
