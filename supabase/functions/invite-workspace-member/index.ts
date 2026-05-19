import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SENDER_DOMAIN = "notify.iskra.ae";
const FROM_ADDRESS = `ISKRA <noreply@${SENDER_DOMAIN}>`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const buildInviteEmail = ({ workspaceName, confirmationUrl }: { workspaceName: string; confirmationUrl: string }) => {
  const safeWorkspace = escapeHtml(workspaceName || "your workspace");
  const safeUrl = escapeHtml(confirmationUrl);
  const subject = `You've been invited to ${workspaceName || "ISKRA"}`;
  const text = `You've been invited to join ${workspaceName || "your workspace"} on ISKRA. Accept the invitation: ${confirmationUrl}`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#18332f;">
  <div style="padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#f7f0df;border:1px solid #e3d7bd;border-radius:16px;overflow:hidden;">
      <div style="padding:30px 32px 28px;">
        <div style="font-size:18px;font-weight:700;letter-spacing:0;color:#18332f;margin-bottom:28px;">ISKRA</div>
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#0f5c4d;margin-bottom:12px;">${safeWorkspace} · Invitation</div>
        <h1 style="font-size:30px;line-height:36px;margin:0 0 14px;color:#18332f;font-weight:700;letter-spacing:0;">You've been invited</h1>
        <p style="font-size:16px;line-height:25px;margin:0 0 24px;color:#4c625d;">You've been invited to join the ${safeWorkspace} workspace on ISKRA. Accept the invitation to set your password and sign in.</p>
        <div style="margin:28px 0;"><a href="${safeUrl}" style="display:inline-block;background:#0f5c4d;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:20px;padding:13px 22px;border-radius:10px;">Accept invitation</a></div>
        <p style="font-size:13px;line-height:21px;margin:0;color:#6f7f7a;">If you weren't expecting this, you can safely ignore this email - no account will be created.</p>
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e3d7bd;font-size:12px;color:#6f7f7a;line-height:19px;text-align:center;">ISKRA · iskra.ae</div>
      </div>
    </div>
  </div>
</body></html>`;
  return { subject, html, text };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    // Caller identity (RLS-respecting client)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action === "accept" ? "accept" : body.action === "resend" ? "resend" : "invite";
    const workspace_id: string | undefined = body.workspace_id;
    const email: string | undefined = body.email?.trim().toLowerCase();
    const role: string = body.role === "client" ? "client" : "manager";
    const targetEmail = email ?? "";

    if (!workspace_id) {
      return json({ error: "workspace_id required" }, 400);
    }

    if (action !== "accept" && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      return json({ error: "valid email required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (action === "accept") {
      const { data: membership, error: memErr } = await admin
        .from("workspace_members")
        .select("id, joined_at")
        .eq("workspace_id", workspace_id)
        .eq("user_id", caller.id)
        .maybeSingle();
      if (memErr) return json({ error: memErr.message }, 500);
      if (!membership) return json({ error: "Invite membership not found" }, 404);
      if (!membership.joined_at) {
        const { error: joinErr } = await admin
          .from("workspace_members")
          .update({ joined_at: new Date().toISOString() })
          .eq("id", membership.id);
        if (joinErr) return json({ error: joinErr.message }, 500);
      }
      return json({ ok: true, joined: true });
    }

    // Authorize: caller must be admin OR workspace owner
    const { data: ws } = await admin
      .from("workspaces")
      .select("id, owner_user_id, slug, name, logo_url")
      .eq("id", workspace_id)
      .single();
    if (!ws) return json({ error: "Workspace not found" }, 404);

    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.id });
    const allowed = Boolean(isAdmin) || ws.owner_user_id === caller.id;
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Find or create the user
    let invitedUserId: string | null = null;
    // Try to fetch by email via admin list (paginated; best-effort match)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
    let invited = false;

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://iskra.ae";
    const inviteUrl = new URL(`${APP_BASE_URL.replace(/\/$/, "")}/accept-invite`);
    inviteUrl.searchParams.set("ws", ws.slug ?? "");
    inviteUrl.searchParams.set("wid", ws.id);
    const redirectTo = inviteUrl.toString();

    const enqueueDirectInvite = async (confirmationUrl: string, reason: string) => {
      const messageId = crypto.randomUUID();
      const emailContent = buildInviteEmail({ workspaceName: ws.name ?? "ISKRA", confirmationUrl });
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "invite",
        recipient_email: targetEmail,
        status: "pending",
        metadata: { workspace_id, reason, source: "invite-workspace-member" },
      });
      const { error } = await admin.rpc("enqueue_email", {
        queue_name: "auth_emails",
        payload: {
          message_id: messageId,
          to: targetEmail,
          from: FROM_ADDRESS,
          sender_domain: SENDER_DOMAIN,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          purpose: "transactional",
          label: "invite",
          idempotency_key: messageId,
          queued_at: new Date().toISOString(),
        },
      });
      if (error) {
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "invite",
          recipient_email: targetEmail,
          status: "failed",
          error_message: "Failed to enqueue invitation email",
          metadata: { workspace_id, reason, source: "invite-workspace-member" },
        });
        console.error("Direct workspace invite enqueue failed", { email, reason, error: error.message });
        return { ok: false, error: error.message, reason };
      }
      invited = true;
      console.log("Direct workspace invite email queued", { email, reason, messageId });
      return { ok: true, reason };
    };

    const generateActionLink = async (type: "invite" | "magiclink" | "recovery") => {
      const { data, error } = await admin.auth.admin.generateLink({
        type,
        email: targetEmail,
        options: { redirectTo },
      });
      if (error || !data?.properties?.action_link || !data.user) {
        return { error: error?.message ?? "Could not generate invitation link" };
      }
      return { user: data.user, actionLink: data.properties.action_link };
    };

    if (existing) {
      invitedUserId = existing.id;
      // Bypass built-in auth email sending entirely. We only generate the
      // action link, then send it through the project's queued email pipeline.
      const linkType = existing.last_sign_in_at ? "magiclink" : "recovery";
      const link = await generateActionLink(linkType);
      if (link.error || !link.actionLink) return json({ error: `Invite link could not be generated: ${link.error}`, code: "invite_link_generation_failed" }, 502);
      const queued = await enqueueDirectInvite(link.actionLink, action === "resend" ? "resend" : `existing_${linkType}`);
      if (!queued.ok) return json({ error: `Invite email could not be queued: ${queued.error}`, code: "email_delivery_queue_failed" }, 502);
    } else {
      const invite = await generateActionLink("invite");
      if (invite.error || !invite.user || !invite.actionLink) {
        return json({ error: `Invite link could not be generated: ${invite.error}`, code: "invite_link_generation_failed" }, 502);
      }
      invitedUserId = invite.user.id;
      const queued = await enqueueDirectInvite(invite.actionLink, "new_user_invite");
      if (!queued.ok) return json({ error: `Invite email could not be queued: ${queued.error}`, code: "email_delivery_queue_failed", user_id: invitedUserId }, 502);
    }

    if (!invitedUserId) return json({ error: "User id missing" }, 500);

    // Upsert membership. New invites are marked invited (joined_at = null) so
    // the Slack "joined CRM" alert only fires after the user actually signs in.
    const nowIso = new Date().toISOString();
    const { data: existingMem } = await admin
      .from("workspace_members")
      .select("id, joined_at")
      .eq("workspace_id", workspace_id)
      .eq("user_id", invitedUserId)
      .maybeSingle();

    // Default permission set for newly invited members.
    // `manager` label seeds the full toolkit; everyone else gets a safe
    // inbox + pipeline + quick-replies-use baseline. Owners can fine-tune
    // each permission afterwards from the Team settings UI.
    const defaultPerms = role === "manager"
      ? {
          perm_overview: true, perm_inbox: true, perm_pipeline: true,
          perm_campaigns_view: true, perm_quick_replies_use: true,
          perm_quick_replies_manage: true, perm_settings: true,
          perm_data: true, perm_materials: true, perm_launch: true,
        }
      : {
          perm_overview: false, perm_inbox: true, perm_pipeline: true,
          perm_campaigns_view: false, perm_quick_replies_use: true,
          perm_quick_replies_manage: false, perm_settings: false,
          perm_data: false, perm_materials: false, perm_launch: false,
        };

    if (existingMem) {
      await admin.from("workspace_members").update({ role }).eq("id", existingMem.id);
    } else {
      const { error: insErr } = await admin
        .from("workspace_members")
        .insert({
          workspace_id,
          user_id: invitedUserId,
          role,
          invited_at: nowIso,
          joined_at: null,
          ...defaultPerms,
        });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, user_id: invitedUserId, invited, workspace: ws.slug, role, email_requested: invited });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
