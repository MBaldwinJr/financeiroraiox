
-- Pin search_path on trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Lock down SECURITY DEFINER functions: revoke from public, allow only the right roles
REVOKE EXECUTE ON FUNCTION public.is_company_member(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_company_role(UUID, UUID, public.app_role[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_company() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_company_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(UUID, UUID, public.app_role[]) TO authenticated;
-- bootstrap_company is only used by a trigger; service_role only
GRANT EXECUTE ON FUNCTION public.bootstrap_company() TO service_role;
