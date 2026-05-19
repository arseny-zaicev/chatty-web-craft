import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";

const ADMIN_EMAIL = "arseny@iskra.ae";
const AUTH_TIMEOUT_MS = 15000;
const AUTH_HEALTH_TIMEOUT_MS = 3000;
const AUTH_HEALTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "");

const isNetworkFetchError = (error: unknown) =>
  getErrorMessage(error).toLowerCase().includes("failed to fetch");

const assertAuthReachable = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_HEALTH_TIMEOUT_MS);

  try {
    await fetch(AUTH_HEALTH_URL, {
      method: "GET",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      "Can't reach the auth server from this browser. Check VPN, ad blocker, DNS, or network, then retry.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

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

const signInWithRetry = async (email: string, password: string) => {
  try {
    return await withTimeout(supabase.auth.signInWithPassword({ email, password }));
  } catch (error) {
    if (!isNetworkFetchError(error)) throw error;
    await delay(800);
    return withTimeout(supabase.auth.signInWithPassword({ email, password }));
  }
};

const AdminAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();
    
    if (!normalizedEmail || !password) {
      toast.error("Please enter email and password");
      return;
    }

    if (normalizedEmail !== ADMIN_EMAIL.toLowerCase()) {
      toast.error("Access denied. Admin only.");
      return;
    }

    setIsLoading(true);

    try {
      await assertAuthReachable();
      const { data, error } = await signInWithRetry(normalizedEmail, password);

      if (error) {
        console.error("Login error:", error);
        setAuthError(error.message);
        toast.error(error.message);
        return;
      }

      if (data.user) {
        const { data: factors } = await withTimeout(
          supabase.auth.mfa.listFactors(),
          "2FA check timed out. Try again.",
        );
        const verified = factors?.totp?.find((f) => f.status === "verified");
        if (!verified) {
          toast.success("Welcome. Set up 2FA to continue.");
          navigate("/admin/mfa-setup");
        } else {
          toast.success("Enter your 2FA code");
          navigate("/admin/mfa-verify");
        }
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      setAuthError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">Admin Access</CardTitle>
          <CardDescription>
            Sign in to manage clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                  disabled={isLoading}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {authError && <p className="text-sm text-destructive">{authError}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              disabled={isLoading}
              onClick={async () => {
                setAuthError(null);
                const normalizedEmail = email.trim().toLowerCase();
                if (!normalizedEmail || normalizedEmail !== ADMIN_EMAIL.toLowerCase()) {
                  toast.error("Enter admin email first");
                  return;
                }
                setIsLoading(true);
                try {
                  const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(normalizedEmail, {
                    redirectTo: `${window.location.origin}/reset-password?next=/admin-auth`,
                  }), "Password reset request timed out. Try again.");
                  if (error) {
                    setAuthError(error.message);
                    toast.error(error.message);
                  } else {
                    toast.success("Password reset link sent to your email!");
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Could not send reset link. Try again.";
                  setAuthError(message);
                  toast.error(message);
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              Forgot password?
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuth;
