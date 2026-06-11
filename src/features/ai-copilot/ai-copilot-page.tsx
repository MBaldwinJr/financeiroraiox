import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, User } from "lucide-react";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { askFinanceAI } from "@/features/ai-copilot/ai-copilot.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Por que meu lucro caiu em março?",
  "Qual categoria mais cresceu?",
  "Quanto gastei com Marketing no trimestre?",
  "Qual foi meu melhor mês?",
  "Quais despesas posso reduzir?",
];

export function AiCopilotPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const ask = useServerFn(askFinanceAI);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (newMessages: ChatMessage[]) =>
      ask({ data: { companyId: companyId!, year, messages: newMessages } }),
    onSuccess: ({ content }) => {
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro na IA"),
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mutation.isPending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !companyId || mutation.isPending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    mutation.mutate(next);
  }

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa para conversar com a IA.</p>;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> IA Financeira
        </h1>
        <p className="text-sm text-muted-foreground">
          Copiloto que analisa sua DRE de {year} e responde perguntas em linguagem natural.
        </p>
      </header>

      <Card className="glass-card flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-4 p-0">
          <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Sugestões para começar:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="h-auto whitespace-normal py-2 text-left"
                      onClick={() => send(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  m.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    m.role === "user" ? "bg-accent" : "bg-primary",
                  )}
                >
                  {m.role === "user" ? (
                    <User className="h-4 w-4 text-accent-foreground" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "user"
                      ? "bg-accent/30 text-foreground"
                      : "bg-secondary/40 text-foreground",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary-foreground" />
                </div>
                <div className="rounded-2xl bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">
                  Analisando seus dados…
                </div>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border bg-card/40 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo sobre suas finanças…"
              disabled={mutation.isPending}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || mutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
