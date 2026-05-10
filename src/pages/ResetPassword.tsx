import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase places the recovery token in the URL hash and signs the user in automatically.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setReady(true);
      else toast.error("Reset link is invalid or expired. Request a new one.");
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    const next = new URLSearchParams(window.location.search).get("next");
    navigate(next && next.startsWith("/") ? next : "/portal-auth", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <Helmet><title>Set a new password</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <IskraLogo size={36} textClass="text-base" />
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a strong password (8+ characters).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={!ready} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm</Label>
              <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
