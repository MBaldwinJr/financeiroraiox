# Architecture Rules

- Company invitation emails must remain Supabase Auth invites; pass display data through validated user metadata so the signed confirmation URL and acceptance trigger stay authoritative.- Link invitations store only a SHA-256 hash of the token in company_invitations and are accepted via the security-definer accept_link_invitation RPC, so the token is the sole authority and company/role never come from the client.
