
-- Fase 1: Reestruturação contábil (CPC/IFRS)

-- 1. Enums contábeis
DO $$ BEGIN
  CREATE TYPE public.account_class AS ENUM (
    'revenue', 'deduction', 'cogs',
    'selling_expense', 'admin_expense', 'other_operating_expense',
    'depreciation', 'financial_result', 'tax_on_profit',
    'non_operating', 'balance_sheet'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dre_line AS ENUM (
    'receita_bruta', 'deducoes', 'receita_liquida',
    'cmv', 'lucro_bruto',
    'despesa_comercial', 'despesa_administrativa', 'despesa_operacional',
    'ebitda', 'depreciacao', 'ebit',
    'resultado_financeiro', 'lair',
    'ir_csll', 'lucro_liquido',
    'nao_aplicavel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colunas em categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS account_class public.account_class,
  ADD COLUMN IF NOT EXISTS dre_line public.dre_line,
  ADD COLUMN IF NOT EXISTS is_balance_sheet BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codigo TEXT,
  ADD COLUMN IF NOT EXISTS ordem INT NOT NULL DEFAULT 0;

-- 3. Coluna competência em transactions (regime de competência para DRE)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS competencia DATE;

UPDATE public.transactions
   SET competencia = date
 WHERE competencia IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN competencia SET NOT NULL,
  ALTER COLUMN competencia SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_transactions_competencia
  ON public.transactions(company_id, competencia)
  WHERE deleted_at IS NULL;

-- 4. Backfill do plano de contas (reclassificação por nome)
-- Receitas
UPDATE public.categories SET
  account_class = 'revenue', dre_line = 'receita_bruta', is_balance_sheet = false, ordem = 10
WHERE kind = 'revenue';

-- Contas PATRIMONIAIS que estavam indevidamente na DRE
UPDATE public.categories SET
  account_class = 'balance_sheet', dre_line = 'nao_aplicavel', is_balance_sheet = true, ordem = 999
WHERE name IN ('Fornecedores', 'Compras de Veículos', 'Compras de Imóveis', 'Parcelas de Empréstimos');

-- Deduções da Receita
UPDATE public.categories SET
  account_class = 'deduction', dre_line = 'deducoes', is_balance_sheet = false, ordem = 20
WHERE name IN ('Descontos');

-- CMV
UPDATE public.categories SET
  account_class = 'cogs', dre_line = 'cmv', is_balance_sheet = false, ordem = 40
WHERE name = 'CMV' OR dre_group = 'cmv';

-- Fretes (default: sobre venda = Despesa Comercial; usuário pode reclassificar)
UPDATE public.categories SET
  account_class = 'selling_expense', dre_line = 'despesa_comercial', is_balance_sheet = false, ordem = 60
WHERE name = 'Fretes';

-- Despesas Comerciais
UPDATE public.categories SET
  account_class = 'selling_expense', dre_line = 'despesa_comercial', is_balance_sheet = false, ordem = 60
WHERE name IN ('Comissões');

-- Despesas Administrativas
UPDATE public.categories SET
  account_class = 'admin_expense', dre_line = 'despesa_administrativa', is_balance_sheet = false, ordem = 70
WHERE name IN ('Aluguel', 'Energia', 'Água', 'Internet', 'Pró-labore');

-- Despesas Operacionais gerais
UPDATE public.categories SET
  account_class = 'other_operating_expense', dre_line = 'despesa_operacional', is_balance_sheet = false, ordem = 80
WHERE name IN ('Combustível', 'Despesas Operacionais');

-- Não operacionais
UPDATE public.categories SET
  account_class = 'non_operating', dre_line = 'nao_aplicavel', is_balance_sheet = false, ordem = 200
WHERE name IN ('Outras Despesas');

-- Fallback: qualquer categoria expense ainda sem classificação vira "outra operacional"
UPDATE public.categories SET
  account_class = 'other_operating_expense', dre_line = 'despesa_operacional', ordem = 90
WHERE kind = 'expense' AND account_class IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_dre_line
  ON public.categories(company_id, dre_line)
  WHERE is_balance_sheet = false;
