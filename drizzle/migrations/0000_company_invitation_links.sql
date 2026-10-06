ALTER TABLE public.company_invitations ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS invite_type text NOT NULL DEFAULT 'email';
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS accepted_by uuid;
ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.company_invitations ADD CONSTRAINT company_invitations_invite_type_chk CHECK (invite_type IN ('email','link'));
ALTER TABLE public.company_invitations ADD CONSTRAINT company_invitations_link_token_chk CHECK (invite_type <> 'link' OR token_hash IS NOT NULL);
ALTER TABLE public.company_invitations ADD CONSTRAINT company_invitations_email_required_chk CHECK (invite_type <> 'email' OR email IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_token_hash ON public.company_invitations(token_hash) WHERE token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_link_invitation(_token_hash text)
RETURNS TABLE(company_name text, role public.app_role, status text, expired boolean, already_member boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.name, i.role, i.status, (i.expires_at < now()),
    EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = i.company_id AND m.user_id = auth.uid())
  FROM public.company_invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.invite_type = 'link' AND i.token_hash = _token_hash AND auth.uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.accept_link_invitation(_token_hash text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.company_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_inv FROM public.company_invitations
    WHERE invite_type = 'link' AND token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'Este convite foi cancelado'; END IF;
  IF v_inv.status = 'accepted' THEN RAISE EXCEPTION 'Este convite já foi utilizado'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Convite indisponível'; END IF;
  IF v_inv.expires_at < now() THEN
    UPDATE public.company_invitations SET status = 'expired', updated_at = now() WHERE id = v_inv.id;
    RAISE EXCEPTION 'Este convite expirou';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_inv.company_id AND user_id = v_uid) THEN
    INSERT INTO public.company_members(company_id, user_id, role) VALUES (v_inv.company_id, v_uid, v_inv.role);
  END IF;
  UPDATE public.company_invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = v_uid, updated_at = now()
    WHERE id = v_inv.id;
  RETURN v_inv.company_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_link_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_link_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_link_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_link_invitation(text) TO authenticated, service_role;