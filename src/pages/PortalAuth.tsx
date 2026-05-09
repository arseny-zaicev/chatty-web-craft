import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

const ADMIN_EMAIL = "arseny@iskra.ae";

export default function PortalAuth() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("iskra:lastEmail") ?? ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
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
    if (!email || !password) return toast.error("Enter email and password");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error(error.message);
    try { localStorage.setItem("iskra:lastEmail", email.trim().toLowerCase()); } catch { /* ignore */ }
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
    if (!email) return toast.error("Enter your email");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Reset link sent. Check your inbox.");
    setForgotMode(false);
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
            </div>
            {!forgotMode && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => setForgotMode(true)} className="text-xs text-primary hover:underline">Forgot?</button>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
            )}
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
