import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Users, Eye, EyeOff } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

interface LinkInfo {
  valid: boolean;
  workspace_name?: string;
  workspace_slug?: string | null;
  workspace_color?: string | null;
  workspace_website?: string | null;
  workspace_logo?: string | null;
  role?: string;
  seats_left?: number;
  allowed_pipelines?: { id: string; name: string }[];
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
  const [showPw, setShowPw] = useState(false);

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
      if (result?.already_existed) {
        toast.success("You're already added. Sign in with that account password.");
        navigate("/portal-auth", { replace: true });
        return;
      }

      // Remember email for the sign-in page (prefill on next visit)
      try { localStorage.setItem("iskra:lastEmail", mail); } catch { /* ignore */ }

      // Sign the user in
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (signErr) {
        if (result.already_existed) {
          toast.success("You were added to the workspace. Sign in with your existing password.");
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

  const accent = info?.workspace_color ?? "#10b981";

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-10 relative overflow-hidden">
      <Helmet>
        <title>{info?.valid ? `Join ${info.workspace_name} - Iskra` : "Join your team - Iskra"}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {/* Ambient brand glow */}
      {info?.valid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: `radial-gradient(60% 50% at 50% 0%, ${accent}22 0%, transparent 70%)` }}
        />
      )}

      <Card className="w-full max-w-md relative">
        <CardHeader className="space-y-4">
          {info?.valid ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <IskraLogo size={32} textClass="text-sm" />
              <span className="text-xl text-muted-foreground/50 font-light leading-none">×</span>
              <div className="flex items-center gap-2">
                {info.workspace_logo ? (
                  <img
                    src={info.workspace_logo}
                    alt={`${info.workspace_name} logo`}
                    className="w-8 h-8 rounded-md object-contain bg-white p-0.5"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-white font-semibold text-xs"
                    style={{ background: accent }}
                  >
                    {(info.workspace_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="font-display text-sm font-semibold">{info.workspace_name}</span>
              </div>
            </div>
          ) : (
            <IskraLogo size={36} textClass="text-base" />
          )}

          {loadingInfo ? (
            <CardDescription>Verifying invitation…</CardDescription>
          ) : info?.valid ? (
            <div className="text-center space-y-2">
              <CardTitle className="text-2xl">
                Join the {info.workspace_name} team
              </CardTitle>
              <CardDescription className="space-y-2">
                <span className="block">
                  Create your Iskra account to manage WhatsApp outreach for{" "}
                  {info.workspace_website ? (
                    <a
                      href={info.workspace_website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-2 hover:underline"
                      style={{ color: accent }}
                    >
                      {info.workspace_name}
                    </a>
                  ) : (
                    info.workspace_name
                  )}
                  .
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {info.seats_left} {info.seats_left === 1 ? "seat" : "seats"} left
                </span>
              </CardDescription>
            </div>
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
                <div className="relative">
                  <Input id="pw" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required placeholder="At least 8 characters" className="pr-10" />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
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
