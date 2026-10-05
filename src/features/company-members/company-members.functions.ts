import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InviteSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "member"]),
});

const getAdminClient = () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("Supabase server secret is not configured. Set SUPABASE_SECRET_KEY in the server environment.");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
};

export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: members, error } = await context.supabase
      .from("company_members")
      .select("id, user_id, role, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return members ?? [];
  });

export const inviteCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("company_members")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Apenas o proprietário ou administrador pode convidar usuários.");
    }

    const { data: invitation, error: invitationError } = await context.supabase
      .from("company_invitations")
      .insert({ company_id: data.companyId, email: data.email, role: data.role, invited_by: context.userId })
      .select("id")
      .single();
    if (invitationError) {
      if (invitationError.message.toLowerCase().includes("duplicate")) {
        throw new Error("Já existe um convite pendente para este e-mail nesta empresa.");
      }
      throw new Error(invitationError.message);
    }

    const admin = getAdminClient();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(data.email, {
      data: { company_invitation_id: invitation.id },
    });

    if (inviteError) {
      await context.supabase
        .from("company_invitations")
        .update({ status: "failed" })
        .eq("id", invitation.id);
      throw new Error(inviteError.message);
    }

    return { success: true, email: data.email };
  });
