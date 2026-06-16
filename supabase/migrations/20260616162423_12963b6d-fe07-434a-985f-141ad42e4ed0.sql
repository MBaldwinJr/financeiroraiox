GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(uuid, uuid, app_role[]) TO authenticated;