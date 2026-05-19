import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Copy } from "lucide-react";
import { ADMIN_EMAIL } from "@/lib/adminGuard";

export default function AdminMfaSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        navigate("/admin-auth");
        return;
      }
      // Clean up any unverified factors from previous attempts
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) {
        toast.error("Auth service is unavailable. Refresh in a moment.");
        setLoading(false);
        return;
      }
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        navigate("/admin/mfa-verify");
        return;
      }
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Admin TOTP ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setLoading(false);
    })();
  }, [navigate]);

  const verify = async () => {
    if (!factorId || code.length < 6) return;
    setEnrolling(true);
    try {
      const { data: c, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: c.id, code });
      if (error) throw error;
      toast.success("2FA enabled. You're stepped up to AAL2.");
      navigate("/admin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-display">Set up 2FA</CardTitle>
          <CardDescription>Scan with Google Authenticator, 1Password, Authy, etc.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {qr && (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-md border bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
                  {secret && (
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(secret); toast.success("Secret copied"); }}
                      className="text-[11px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />{secret}
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code from app</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.4em] font-mono"
                />
              </div>
              <Button className="w-full" disabled={code.length !== 6 || enrolling} onClick={verify}>
                {enrolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Verify and enable
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
