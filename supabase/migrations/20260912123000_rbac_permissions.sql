-- Financeiro Raio-X
-- P0.2: granular permissions without breaking existing owner/admin/member roles.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read role permissions" ON public.role_permissions;
CREATE POLICY "members read role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.role = role_permissions.role
  ));

INSERT INTO public.role_permissions (role, permission)
VALUES
  ('owner','company.members.manage'),
  ('owner','company.settings.manage'),
  ('owner','finance.transaction.create'),
  ('owner','finance.transaction.update'),
  ('owner','finance.transaction.delete'),
  ('owner','finance.payment.create'),
  ('owner','finance.payment.approve'),
  ('owner','finance.dre.view'),
  ('owner','finance.cashflow.view'),
  ('owner','reports.export'),
  ('owner','audit.view'),
  ('admin','company.members.manage'),
  ('admin','company.settings.manage'),
  ('admin','finance.transaction.create'),
  ('admin','finance.transaction.update'),
  ('admin','finance.transaction.delete'),
  ('admin','finance.payment.create'),
  ('admin','finance.payment.approve'),
  ('admin','finance.dre.view'),
  ('admin','finance.cashflow.view'),
  ('admin','reports.export'),
  ('admin','audit.view'),
  ('member','finance.transaction.create'),
  ('member','finance.transaction.update'),
  ('member','finance.payment.create'),
  ('member','finance.dre.view'),
  ('member','finance.cashflow.view'),
  ('member','reports.export')
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_company_permission(
  p_company_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.role_permissions rp ON rp.role = cm.role
    WHERE cm.company_id = p_company_id
      AND cm.user_id = p_user_id
      AND rp.permission = p_permission
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_company_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_permission(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_company_permission(uuid, uuid, text)
IS 'Checks a granular permission for a user within a company.';
