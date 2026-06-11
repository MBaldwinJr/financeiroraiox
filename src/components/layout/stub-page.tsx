import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

interface StubPageProps {
  readonly title: string;
  readonly description: string;
  readonly hint?: string;
  readonly redirectTo?: string;
  readonly redirectLabel?: string;
}

export function StubPage({ title, description, hint, redirectTo, redirectLabel }: StubPageProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20">
            <Construction className="h-6 w-6 text-accent" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">Em breve</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {hint ?? "Esta seção está em desenvolvimento. Em breve trará dados e ferramentas dedicadas."}
            </p>
          </div>
          {redirectTo && (
            <Button asChild variant="outline">
              <Link to={redirectTo as never}>{redirectLabel ?? "Ir para área relacionada"}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
