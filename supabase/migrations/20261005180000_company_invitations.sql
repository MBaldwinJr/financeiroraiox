-- Company member invitations
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (company_id, email, status)
);

CREATE INDEX IF NOT EXISTS company_invitations_company_idx
  ON public.company_invitations(company_id, created_at DESC);

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read invitations" ON public.company_invitations;
CREATE POLICY "members read invitations"
  ON public.company_invitations FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "owners admins manage invitations" ON public.company_invitations;
CREATE POLICY "owners admins manage invitations"
  ON public.company_invitations FOR ALL TO authenticated
  USING (public.has_company_role(company_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_company_role(company_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.accept_company_invitation_on_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.company_invitations%ROWTYPE;
BEGIN
  IF NEW.raw_user_meta_data ? 'company_invitation_id' THEN
    SELECT * INTO v_invitation
    FROM public.company_invitations
    WHERE id = (NEW.raw_user_meta_data->>'company_invitation_id')::uuid
      AND status = 'pending'
      AND lower(email) = lower(NEW.email)
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (v_invitation.company_id, NEW.id, v_invitation.role)
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;

      UPDATE public.company_invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = v_invitation.id;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_company_invitation ON auth.users;
CREATE TRIGGER on_auth_user_created_company_invitation
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.accept_company_invitation_on_user_created();

REVOKE EXECUTE ON FUNCTION public.accept_company_invitation_on_user_created() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation_on_user_created() TO service_role;
