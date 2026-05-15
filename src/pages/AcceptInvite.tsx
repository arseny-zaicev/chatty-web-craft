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

export default function AcceptInvite() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [authFlow, setAuthFlow] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase places the invite token in the URL hash and signs the user in automatically.
    let mounted = true;

    const init = async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const type = params.get("type");
      if (type) setAuthFlow(type);
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        setEmail(session.user.email ?? null);
        // Prefill from existing metadata if any
        const meta = session.user.user_metadata as { full_name?: string } | null;
        if (meta?.full_name) {
          const [f, ...rest] = meta.full_name.split(" ");
          setFirstName(f ?? "");
          setLastName(rest.join(" "));
        }
        setReady(true);
      } else {
        toast.error("Invite link is invalid or expired. Ask your manager for a new one.");
        setTimeout(() => navigate("/portal-auth", { replace: true }), 1500);
      }
    };

    // Listen first to catch hash-based session establishment
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !ready) {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const type = params.get("type");
        if (type) setAuthFlow(type);
        setEmail(session.user.email ?? null);
        setReady(true);
      }
    });
    init();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isExistingUserInvite = authFlow === "magiclink";
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!isExistingUserInvite && (!fn || !ln)) return toast.error("Enter your first and last name");
    if (fn.length > 60 || ln.length > 60) return toast.error("Name is too long");
    if (!isExistingUserInvite && password.length < 8) return toast.error("Password must be at least 8 characters");
    if (!isExistingUserInvite && password !== confirm) return toast.error("Passwords do not match");

    setLoading(true);
    const fullName = `${fn} ${ln}`.trim();
    const updatePayload: Parameters<typeof supabase.auth.updateUser>[0] = {};
    if (!isExistingUserInvite) updatePayload.password = password;
    if (fullName) updatePayload.data = { full_name: fullName, first_name: fn, last_name: ln };
    const { data: userData, error: updErr } = Object.keys(updatePayload).length > 0
      ? await supabase.auth.updateUser(updatePayload)
      : await supabase.auth.getUser();
    if (updErr) {
      setLoading(false);
      return toast.error(updErr.message);
    }

    const uid = userData.user?.id;
    if (uid) {
      // Upsert profile (handle_new_user trigger already created a row, so update it)
      if (fullName) {
        const { error: profErr } = await supabase
          .from("profiles")
          .upsert({ user_id: uid, full_name: fullName }, { onConflict: "user_id" });
        if (profErr) console.warn("profile upsert", profErr);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const invitedWorkspaceId = urlParams.get("wid");
      if (invitedWorkspaceId) {
        const { error: joinErr } = await supabase
          .from("workspace_members")
          .update({ joined_at: new Date().toISOString() })
          .eq("workspace_id", invitedWorkspaceId)
          .eq("user_id", uid);
        if (joinErr) console.warn("workspace join", joinErr);
      }
    }

    toast.success("Welcome aboard");

    // Route to first available workspace, otherwise portal
    const urlParams = new URLSearchParams(window.location.search);
    const invitedSlug = urlParams.get("ws");
    const invitedWorkspaceId = urlParams.get("wid");
    const { data: ws } = invitedWorkspaceId
      ? await supabase.from("workspaces").select("slug").eq("id", invitedWorkspaceId).limit(1)
      : await supabase
          .from("workspaces")
          .select("slug")
          .eq("is_active", true)
          .order("name")
          .limit(1);
    setLoading(false);
    const targetSlug = ws?.[0]?.slug ?? invitedSlug;
    if (targetSlug) {
      navigate(`/ws/${targetSlug}/overview`, { replace: true });
    } else {
      navigate("/portal-auth", { replace: true });
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <Helmet>
        <title>Accept invite - Iskra</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <IskraLogo size={36} textClass="text-base" />
          <CardTitle>Welcome to Iskra</CardTitle>
          <CardDescription>
            {email
              ? <>Finish setting up your account for <span className="font-medium text-foreground">{email}</span>. Your name will appear on chats you reply to.</>
              : "Verifying your invitation…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fn">First name</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required disabled={!ready} maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln">Last name</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required disabled={!ready} maxLength={60} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Set a password</Label>
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={!ready} placeholder="At least 8 characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required disabled={!ready} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Activate account
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
