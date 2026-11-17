revoke execute on function public.is_company_member(uuid,uuid) from anon;
revoke execute on function public.has_company_role(uuid,uuid,public.app_role[]) from anon;
revoke execute on function public.get_link_invitation(text) from anon;
revoke execute on function public.accept_link_invitation(text) from anon;
alter function public.is_company_member(uuid,uuid) security invoker;
alter function public.has_company_role(uuid,uuid,public.app_role[]) security invoker;
