import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

const Message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  messages: z.array(Message).min(1).max(20),
});

type DreGroup =
  | "revenue"
  | "cmv"
  | "supplier"
  | "freight"
  | "fixed"
  | "variable"
  | "operational"
  | "other";

interface TxRow {
  date: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  category: { name: string; dre_group: DreGroup } | null;
}

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function fmt(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const askFinanceAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente. Configure a chave para usar a IA.");

    // Pull yearly aggregates as context
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;
    const txs = await fetchAllRows<TxRow>((from, to) =>
      context.supabase
        .from("transactions")
        .select("date, amount_cents, kind, category:categories(name, dre_group)")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", yearStart)
        .lt("date", yearEnd)
        .range(from, to) as unknown as PromiseLike<{ data: TxRow[] | null; error: { message: string } | null }>,
    );
    const monthly = Array.from({ length: 12 }, () => ({ revenue: 0, expense: 0 }));
    const byCategory = new Map<string, number>();
    for (const tx of txs) {
      const m = Number(tx.date.slice(5, 7)) - 1;
      if (tx.kind === "revenue") monthly[m].revenue += tx.amount_cents;
      else {
        monthly[m].expense += tx.amount_cents;
        if (tx.category) {
          byCategory.set(
            tx.category.name,
            (byCategory.get(tx.category.name) ?? 0) + tx.amount_cents,
          );
        }
      }
    }
    const topCategories = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => `${name}: ${fmt(value)}`)
      .join("\n");

    const monthlyLines = monthly
      .map(
        (m, i) =>
          `${MONTHS[i]}/${data.year} — Receita ${fmt(m.revenue)} | Despesa ${fmt(m.expense)} | Lucro ${fmt(m.revenue - m.expense)}`,
      )
      .join("\n");

    const systemPrompt = `Você é o Copiloto Financeiro da Finance Vision BI. Responda em português, de forma clara, objetiva e baseada APENAS nos dados fornecidos abaixo. Use bullets, números formatados em BRL e mencione meses específicos quando aplicável. Quando não houver dados suficientes, diga explicitamente.

DADOS DO ANO ${data.year}:
${monthlyLines}

TOP 10 DESPESAS POR CATEGORIA:
${topCategories || "(sem despesas)"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...data.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429)
        throw new Error("Limite de requisições atingido. Aguarde alguns segundos e tente novamente.");
      if (response.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos ao workspace para continuar.");
      const text = await response.text();
      throw new Error(`Erro da IA (${response.status}): ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "Sem resposta.";
    return { content };
  });
