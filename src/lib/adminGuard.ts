import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAIL = "arseny@iskra.ae";

export type AdminGuardResult =
  | { state: "ok" }
  | { state: "redirect"; to: string; reason?: string };

/**
 * Centralised admin gate used by every /admin route.
 * - Must be signed in as ADMIN_EMAIL.
 * - Must have a verified TOTP factor (otherwise -> /admin/mfa-setup).
 * - Must have stepped up to aal2 in the current session (otherwise -> /admin/mfa-verify).
 */
export async function evaluateAdminAccess(): Promise<AdminGuardResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { state: "redirect", to: "/admin-auth" };
  if (session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    await supabase.auth.signOut();
    return { state: "redirect", to: "/admin-auth", reason: "not-admin" };
  }

  // Run MFA factor + AAL checks in parallel — they're independent network calls.
  const [factorsRes, aalRes] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  // If the Auth API is degraded (network / 5xx), do NOT fall through to "needs setup" —
  // that path would enroll a duplicate TOTP factor. Surface the failure instead.
  if (factorsRes.error || aalRes.error) {
    return { state: "redirect", to: "/admin-auth", reason: "auth-unavailable" };
  }
  const verifiedTotp = factorsRes.data?.totp?.find((f) => f.status === "verified");
  if (!verifiedTotp) return { state: "redirect", to: "/admin/mfa-setup" };
  if (aalRes.data?.currentLevel !== "aal2") return { state: "redirect", to: "/admin/mfa-verify" };

  return { state: "ok" };
}
