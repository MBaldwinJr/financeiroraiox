
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.tx_kind AS ENUM ('revenue', 'expense');
CREATE TYPE public.tx_status AS ENUM ('pending', 'paid');
CREATE TYPE public.payment_method AS ENUM ('cash', 'pix', 'boleto', 'cheque', 'card');
CREATE TYPE public.category_kind AS ENUM ('revenue', 'expense');
CREATE TYPE public.party_kind AS ENUM ('client', 'supplier', 'both');
CREATE TYPE public.dre_group AS ENUM (
  'revenue','cmv','supplier','freight','fixed','variable','operational','other'
);

-- ============ UPDATED_AT FN ============
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============ COMPANY MEMBERS (roles) ============
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
CREATE INDEX idx_company_members_user ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FNS ============
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_company_id UUID, _user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id AND role = ANY(_roles));
$$;

-- ============ POLICIES (companies, members) ============
CREATE POLICY "members read companies" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(id, auth.uid()));
CREATE POLICY "users create own companies" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owners update companies" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_company_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "owners delete companies" ON public.companies FOR DELETE TO authenticated
  USING (public.has_company_role(id, auth.uid(), ARRAY['owner']::public.app_role[]));

CREATE POLICY "members read company members" ON public.company_members FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "owners manage members" ON public.company_members FOR ALL TO authenticated
  USING (public.has_company_role(company_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_company_role(company_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ TENANT-OWNED RESOURCE POLICY HELPER ============
-- Macro pattern: every other table has company_id, RLS via is_company_member.

-- BANK ACCOUNTS
CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_accounts_company ON public.bank_accounts(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw bank_accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COST CENTERS
CREATE TABLE public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_centers_company ON public.cost_centers(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw cost_centers" ON public.cost_centers FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  kind public.category_kind NOT NULL,
  dre_group public.dre_group NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_company ON public.categories(company_id);
CREATE INDEX idx_categories_parent ON public.categories(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- PARTIES
CREATE TABLE public.parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind public.party_kind NOT NULL DEFAULT 'both',
  document TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_parties_company ON public.parties(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw parties" ON public.parties FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  kind public.tx_kind NOT NULL,
  payment_method public.payment_method,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  status public.tx_status NOT NULL DEFAULT 'paid',
  paid_at DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_transactions_company_date ON public.transactions(company_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_company_category ON public.transactions(company_id, category_id) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SEED + BOOTSTRAP ON COMPANY CREATE ============
CREATE OR REPLACE FUNCTION public.bootstrap_company() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- add owner as member
  INSERT INTO public.company_members(company_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');

  -- cost centers
  INSERT INTO public.cost_centers(company_id, name) VALUES
    (NEW.id,'Administrativo'),(NEW.id,'Comercial'),(NEW.id,'Oficina'),
    (NEW.id,'Estoque'),(NEW.id,'Logística'),(NEW.id,'Marketing'),(NEW.id,'Outros');

  -- revenue categories
  INSERT INTO public.categories(company_id, name, kind, dre_group) VALUES
    (NEW.id,'Vendas','revenue','revenue'),
    (NEW.id,'Serviços','revenue','revenue'),
    (NEW.id,'Outras Receitas','revenue','revenue');

  -- expense categories grouped by DRE
  INSERT INTO public.categories(company_id, name, kind, dre_group) VALUES
    (NEW.id,'CMV','expense','cmv'),
    (NEW.id,'Fornecedores','expense','supplier'),
    (NEW.id,'Fretes','expense','freight'),
    (NEW.id,'Aluguel','expense','fixed'),
    (NEW.id,'Energia','expense','fixed'),
    (NEW.id,'Água','expense','fixed'),
    (NEW.id,'Internet','expense','fixed'),
    (NEW.id,'Pró-labore','expense','fixed'),
    (NEW.id,'Combustível','expense','variable'),
    (NEW.id,'Compras de Veículos','expense','variable'),
    (NEW.id,'Comissões','expense','variable'),
    (NEW.id,'Descontos','expense','variable'),
    (NEW.id,'Parcelas de Empréstimos','expense','variable'),
    (NEW.id,'Despesas Operacionais','expense','operational'),
    (NEW.id,'Outras Despesas','expense','other');

  -- default account
  INSERT INTO public.bank_accounts(company_id, name, type) VALUES (NEW.id, 'Caixa', 'cash');

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_bootstrap_company AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_company();
