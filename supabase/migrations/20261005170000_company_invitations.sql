-- Financeiro Raio-X
-- Company invitations: pending invitations used by the server-side invite flow.

CREATE TABLE IF NOT EXISTS public.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'failed')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company
  ON public.company_invitations(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_invitations_email
  ON public.company_invitations(lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_pending_email
  ON public.company_invitations(company_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own company invitations"
  ON public.company_invitations;

CREATE POLICY "members read own company invitations"
  ON public.company_invitations
  FOR SELECT
  TO authenticated
  USING (
    public.has_company_role(
      company_id,
      auth.uid(),
      ARRAY['owner','admin']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "owners admins create invitations"
  ON public.company_invitations;

CREATE POLICY "owners admins create invitations"
  ON public.company_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND public.has_company_role(
      company_id,
      auth.uid(),
      ARRAY['owner','admin']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "owners admins update invitations"
  ON public.company_invitations;

CREATE POLICY "owners admins update invitations"
  ON public.company_invitations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_company_role(
      company_id,
      auth.uid(),
      ARRAY['owner','admin']::public.app_role[]
    )
  )
  WITH CHECK (
    public.has_company_role(
      company_id,
      auth.uid(),
      ARRAY['owner','admin']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "owners admins delete invitations"
  ON public.company_invitations;

CREATE POLICY "owners admins delete invitations"
  ON public.company_invitations
  FOR DELETE
  TO authenticated
  USING (
    public.has_company_role(
      company_id,
      auth.uid(),
      ARRAY['owner','admin']::public.app_role[]
    )
  );

DROP TRIGGER IF EXISTS trg_company_invitations_updated
  ON public.company_invitations;

CREATE TRIGGER trg_company_invitations_updated
  BEFORE UPDATE ON public.company_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invitations TO authenticated;
GRANT ALL ON public.company_invitations TO service_role;

COMMENT ON TABLE public.company_invitations IS
  'Pending and historical invitations to join a company. Invitation emails are sent server-side.';
