import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const ADMIN_EMAIL = "arseny@iskra.ae";

export type AdminGuardResult =
  | { state: "ok"; user: User }
  | { state: "redirect"; to: string; reason?: string };

/**
 * Centralised admin gate used by every /admin route.
 * - Must be signed in as ADMIN_EMAIL.
 * - Must have a verified TOTP factor (otherwise -> /admin/mfa-setup).
 * - Must have stepped up to aal2 in the current session (otherwise -> /admin/mfa-verify).
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function evaluateAdminAccess(): Promise<AdminGuardResult> {
  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000, "getSession");
    if (!session?.user) return { state: "redirect", to: "/admin-auth" };
    if (session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      await supabase.auth.signOut();
      return { state: "redirect", to: "/admin-auth", reason: "not-admin" };
    }

    // Run MFA factor + AAL checks in parallel — they're independent network calls.
    // Wrap with a hard timeout: if Cloud Auth is degraded, we must not hang the UI forever.
    const [factorsRes, aalRes] = await Promise.all([
      withTimeout(supabase.auth.mfa.listFactors(), 8000, "mfa.listFactors"),
      withTimeout(supabase.auth.mfa.getAuthenticatorAssuranceLevel(), 8000, "mfa.getAAL"),
    ]);
    if (factorsRes.error || aalRes.error) {
      return { state: "redirect", to: "/admin-auth", reason: "auth-unavailable" };
    }
    const verifiedTotp = factorsRes.data?.totp?.find((f) => f.status === "verified");
    if (!verifiedTotp) return { state: "redirect", to: "/admin/mfa-setup" };
    if (aalRes.data?.currentLevel !== "aal2") return { state: "redirect", to: "/admin/mfa-verify" };

    return { state: "ok", user: session.user };
  } catch (err) {
    console.error("[adminGuard] auth check failed/timed out", err);
    return { state: "redirect", to: "/admin-auth", reason: "auth-unavailable" };
  }
}

