-- Security hardening: tenant isolation, immutable tenant ownership and audit trail.
-- Existing data is intentionally not validated automatically. The composite FKs are
-- created NOT VALID so deployment does not break on legacy cross-tenant rows; validate
-- them after remediation.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Composite keys for tenant-safe foreign keys
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_id_id_key
  ON public.bank_accounts (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS categories_company_id_id_key
  ON public.categories (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_company_id_id_key
  ON public.cost_centers (company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS parties_company_id_id_key
  ON public.parties (company_id, id);

-- A category parent must belong to the same company.
ALTER TABLE public.categories
  ADD CONSTRAINT categories_company_parent_fk
  FOREIGN KEY (company_id, parent_id)
  REFERENCES public.categories (company_id, id)
  ON DELETE SET NULL
  NOT VALID;

-- Transaction references must belong to the same company.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_company_category_fk
  FOREIGN KEY (company_id, category_id)
  REFERENCES public.categories (company_id, id)
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_company_cost_center_fk
  FOREIGN KEY (company_id, cost_center_id)
  REFERENCES public.cost_centers (company_id, id)
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_company_bank_account_fk
  FOREIGN KEY (company_id, bank_account_id)
  REFERENCES public.bank_accounts (company_id, id)
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_company_party_fk
  FOREIGN KEY (company_id, party_id)
  REFERENCES public.parties (company_id, id)
  ON DELETE NO ACTION
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 2. company_id becomes immutable after row creation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_company_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id cannot be changed after record creation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_accounts',
    'categories',
    'company_members',
    'cost_centers',
    'erp_account_mappings',
    'goals',
    'import_jobs',
    'inventory_snapshots',
    'parties',
    'sales',
    'transactions'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_company_id_change ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_prevent_company_id_change BEFORE UPDATE OF company_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_company_id_change()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Central audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_company_created_idx
  ON public.audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_company_entity_idx
  ON public.audit_logs (company_id, entity, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read audit logs" ON public.audit_logs;
CREATE POLICY "members read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- Trigger function is SECURITY DEFINER because end users must not be able to
-- insert arbitrary audit records, while database triggers must still be able
-- to write the audit trail.
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_entity_id uuid;
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  v_entity_id := COALESCE(NEW.id, OLD.id);

  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_logs (
    company_id,
    user_id,
    action,
    entity,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_company_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit_log() FROM anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log() TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions',
    'sales',
    'bank_accounts',
    'company_members',
    'categories',
    'cost_centers',
    'parties',
    'goals',
    'import_jobs',
    'inventory_snapshots',
    'erp_account_mappings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_write_audit_log ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_write_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Companies do not have a company_id column, so they use their own id.
CREATE OR REPLACE FUNCTION public.write_company_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := COALESCE(NEW.id, OLD.id);

  INSERT INTO public.audit_logs (
    company_id,
    user_id,
    action,
    entity,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_company_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_company_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.write_company_audit_log() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_company_audit_log() FROM anon;
GRANT EXECUTE ON FUNCTION public.write_company_audit_log() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_write_company_audit_log ON public.companies;
CREATE TRIGGER trg_write_company_audit_log
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.write_company_audit_log();

-- -----------------------------------------------------------------------------
-- 4. Validation commands for the next deployment stage
-- -----------------------------------------------------------------------------
-- After existing cross-company references have been remediated, run:
-- ALTER TABLE public.categories VALIDATE CONSTRAINT categories_company_parent_fk;
-- ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_company_category_fk;
-- ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_company_cost_center_fk;
-- ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_company_bank_account_fk;
-- ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_company_party_fk;

COMMIT;
