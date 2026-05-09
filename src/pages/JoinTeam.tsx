import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

interface LinkInfo {
  valid: boolean;
  workspace_name?: string;
  workspace_slug?: string | null;
  role?: string;
  seats_left?: number;
  error?: string;
}

export default function JoinTeam() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = (rawToken ?? "").toUpperCase();
  const navigate = useNavigate();

  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token || token.length < 6) {
        if (mounted) {
          setInfo({ valid: false, error: "Invalid link" });
          setLoadingInfo(false);
        }
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=info", {
          body: { token },
        });
        if (!mounted) return;
        if (error) {
          setInfo({ valid: false, error: "Could not verify link" });
        } else {
          setInfo(data as LinkInfo);
        }
      } catch {
        if (mounted) setInfo({ valid: false, error: "Could not verify link" });
      } finally {
        if (mounted) setLoadingInfo(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim().toLowerCase();
    if (!fn || !ln) return toast.error("Enter your first and last name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return toast.error("Enter a valid email");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("workspace-invite-link?action=accept", {
        body: { token, email: mail, password, first_name: fn, last_name: ln },
      });
      if (error) {
        const msg = (error as { message?: string }).message;
        toast.error(msg ?? "Could not create your account");
        setSubmitting(false);
        return;
      }
      const result = data as { error?: string; ok?: boolean; already_existed?: boolean; workspace_slug?: string | null };
      if (result?.error) {
        toast.error(result.error);
        setSubmitting(false);
        return;
      }

      // Sign the user in
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (signErr) {
        // Email already existed and password was different
        if (result.already_existed) {
          toast.success("You were added to the workspace. Please sign in.");
          navigate("/portal-auth", { replace: true });
          return;
        }
        toast.error(signErr.message);
        setSubmitting(false);
        return;
      }

      toast.success("Welcome aboard");
      const slug = result.workspace_slug;
      navigate(slug ? `/ws/${slug}/overview` : "/portal-auth", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <Helmet>
        <title>Join your team - Iskra</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <IskraLogo size={36} textClass="text-base" />
          {loadingInfo ? (
            <CardDescription>Verifying invitation…</CardDescription>
          ) : info?.valid ? (
            <>
              <CardTitle>Join {info.workspace_name}</CardTitle>
              <CardDescription className="space-y-2">
                <span className="block">
                  Create your Iskra account. Your name will appear on chats you reply to.
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {info.seats_left} {info.seats_left === 1 ? "seat" : "seats"} left
                </span>
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Link unavailable</CardTitle>
              <CardDescription>
                {info?.error ?? "This invitation link is invalid or expired. Ask your manager for a new one."}
              </CardDescription>
            </>
          )}
        </CardHeader>
        {info?.valid && (
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fn">First name</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ln">Last name</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required maxLength={60} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="em">Work email</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required placeholder="At least 8 characters" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create account & join
              </Button>
            </form>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
