import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

const ADMIN_EMAIL = "arseny@iskra.ae";
const AUTH_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, message = "Login request timed out. Try again.") => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export default function PortalAuth() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("iskra:lastEmail") ?? ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  // If already signed in, route them
  useEffect(() => {
    const route = async (uid: string, mail: string | undefined) => {
      if (mail?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        navigate("/admin", { replace: true });
        return;
      }
      const { data: ws } = await supabase
        .from("workspaces")
        .select("slug")
        .eq("is_active", true)
        .order("name")
        .limit(1);
      if (ws && ws.length > 0) navigate(`/ws/${ws[0].slug}/overview`, { replace: true });
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) route(session.user.id, session.user.email);
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return toast.error("Enter email and password");
    setLoading(true);
    let data;
    try {
      const result = await withTimeout(supabase.auth.signInWithPassword({ email: normalizedEmail, password }));
      data = result.data;
      if (result.error) {
        setAuthError(result.error.message);
        toast.error(result.error.message);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in. Try again.";
      setAuthError(message);
      toast.error(message);
      return;
    } finally {
      setLoading(false);
    }

    try { localStorage.setItem("iskra:lastEmail", normalizedEmail); } catch { /* ignore */ }
    const mail = data.user?.email?.toLowerCase();
    if (mail === ADMIN_EMAIL.toLowerCase()) {
      navigate("/admin");
      return;
    }
    const { data: ws } = await supabase.from("workspaces").select("slug").eq("is_active", true).order("name").limit(1);
    if (!ws || ws.length === 0) {
      toast.error("No workspace access yet. Ask your account manager to invite you.");
      await supabase.auth.signOut();
      return;
    }
    navigate(`/ws/${ws[0].slug}/overview`);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return toast.error("Enter your email");
    setLoading(true);
    try {
      const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      }), "Password reset request timed out. Try again.");
      if (error) {
        setAuthError(error.message);
        return toast.error(error.message);
      }
      try { localStorage.setItem("iskra:lastEmail", normalizedEmail); } catch { /* ignore */ }
      toast.success("Reset link sent. Check your inbox.");
      setForgotMode(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send reset link. Try again.";
      setAuthError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <Helmet><title>Iskra - Portal access</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Link to="/" className="inline-flex"><IskraLogo size={36} textClass="text-base" /></Link>
          <CardTitle>{forgotMode ? "Reset password" : "Sign in"}</CardTitle>
          <CardDescription>
            {forgotMode
              ? "We'll email you a link to set a new password."
              : "Access your Iskra workspace. Contact your account manager if you don't have an account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={forgotMode ? handleForgot : handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setAuthError(null); }} placeholder="you@company.com" autoComplete="email" required disabled={loading} />
            </div>
            {!forgotMode && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => setForgotMode(true)} className="text-xs text-primary hover:underline">Forgot?</button>
                </div>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(null); }} autoComplete="current-password" required disabled={loading} className="pr-10" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            {authError && <p className="text-sm text-destructive">{authError}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {forgotMode ? "Send reset link" : "Sign in"}
            </Button>
            {forgotMode && (
              <button type="button" onClick={() => setForgotMode(false)} className="w-full text-xs text-muted-foreground hover:text-foreground">Back to sign in</button>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
