import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateInviteToken, hashInviteToken, INVITE_TOKEN_PATTERN } from "./invitation-token";

const InviteSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "member"]),
});

const ROLE_LABELS = {
  admin: "Administrador",
  member: "Colaborador",
} as const;

interface InvitationEmailMetadata {
  readonly company_invitation_id: string;
  readonly company_name: string;
  readonly inviter_email?: string;
  readonly inviter_name?: string;
  readonly role_label: (typeof ROLE_LABELS)[keyof typeof ROLE_LABELS];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getInviterName(
  userMetadata: Readonly<Record<string, unknown>> | null,
): string | undefined {
  if (!userMetadata) return undefined;
  return (
    nonEmptyString(userMetadata.full_name) ??
    nonEmptyString(userMetadata.name) ??
    nonEmptyString(userMetadata.display_name)
  );
}

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

    const { data: company, error: companyError } = await context.supabase
      .from("companies")
      .select("name")
      .eq("id", data.companyId)
      .single();
    if (companyError) throw new Error(companyError.message);

    const { data: invitation, error: invitationError } = await context.supabase
      .from("company_invitations")
      .insert({
        company_id: data.companyId,
        email: data.email,
        role: data.role,
        invited_by: context.userId,
      })
      .select("id")
      .single();
    if (invitationError) {
      if (invitationError.message.toLowerCase().includes("duplicate")) {
        throw new Error("Já existe um convite pendente para este e-mail nesta empresa.");
      }
      throw new Error(invitationError.message);
    }

    const claims = asRecord(context.claims);
    const userMetadata = asRecord(claims?.user_metadata);
    const metadata: InvitationEmailMetadata = {
      company_invitation_id: invitation.id,
      company_name: company.name,
      inviter_email: nonEmptyString(claims?.email),
      inviter_name: getInviterName(userMetadata),
      role_label: ROLE_LABELS[data.role],
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: metadata,
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

const CompanyIdSchema = z.object({ companyId: z.string().uuid() });
const TokenSchema = z.object({ token: z.string().regex(INVITE_TOKEN_PATTERN) });

async function assertCanManage(
  supabase: { from: (t: "company_members") => ReturnType<SupabaseLike["from"]> } | SupabaseLike,
  companyId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await (supabase as SupabaseLike)
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Apenas o proprietário ou administrador pode gerenciar convites.");
  }
}

export const createLinkInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), role: z.enum(["admin", "member"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertCanManage(context.supabase, data.companyId, context.userId);
    const { data: company, error: companyError } = await context.supabase
      .from("companies")
      .select("name")
      .eq("id", data.companyId)
      .single();
    if (companyError) throw new Error(companyError.message);

    const token = generateInviteToken();
    const tokenHash = await hashInviteToken(token);
    const { data: invitation, error } = await context.supabase
      .from("company_invitations")
      .insert({
        company_id: data.companyId,
        role: data.role,
        invited_by: context.userId,
        invite_type: "link",
        token_hash: tokenHash,
      })
      .select("id, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { token, companyName: company.name, expiresAt: invitation.expires_at, id: invitation.id };
  });

export const listCompanyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("company_invitations")
      .select("id, email, role, status, invite_type, expires_at, created_at, accepted_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const cancelCompanyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), invitationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertCanManage(context.supabase, data.companyId, context.userId);
    const { error } = await context.supabase
      .from("company_invitations")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.invitationId)
      .eq("company_id", data.companyId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getLinkInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase.rpc("get_link_invitation", {
      _token_hash: await hashInviteToken(data.token),
    });
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) return null;
    return {
      companyName: row.company_name,
      roleLabel: row.role === "admin" ? ROLE_LABELS.admin : ROLE_LABELS.member,
      status: row.expired && row.status === "pending" ? "expired" : row.status,
      alreadyMember: row.already_member,
    };
  });

export const acceptLinkInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: companyId, error } = await context.supabase.rpc("accept_link_invitation", {
      _token_hash: await hashInviteToken(data.token),
    });
    if (error) throw new Error(error.message);
    return { companyId: companyId as string };
  });
