import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { ADMIN_EMAIL } from "@/lib/adminGuard";

export default function AdminMfaVerify() {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        navigate("/admin-auth");
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { navigate("/admin"); return; }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (!verified) { navigate("/admin/mfa-setup"); return; }
      setFactorId(verified.id);
      const { data: c, error } = await supabase.auth.mfa.challenge({ factorId: verified.id });
      if (error) { toast.error(error.message); return; }
      setChallengeId(c.id);
      setLoading(false);
    })();
  }, [navigate]);

  const verify = async () => {
    if (!factorId || !challengeId || code.length !== 6) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      toast.success("Verified");
      navigate("/admin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
      // re-issue challenge
      if (factorId) {
        const { data: c } = await supabase.auth.mfa.challenge({ factorId });
        setChallengeId(c?.id ?? null);
        setCode("");
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-display">Two-factor verification</CardTitle>
          <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Authentication code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.4em] font-mono"
                />
              </div>
              <Button className="w-full" disabled={code.length !== 6 || verifying} onClick={verify}>
                {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Verify
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={async () => { await supabase.auth.signOut(); navigate("/admin-auth"); }}
              >
                Sign out
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
