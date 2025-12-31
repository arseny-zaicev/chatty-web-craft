import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const ADMIN_EMAIL = "arseny@iskra.ae";

const ClientAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Only allow admin to sign up (for initial setup)
        if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          toast.error("Self-registration is disabled. Please contact your account manager.");
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
          },
        });

        if (error) {
          console.error("Signup error:", error);
          toast.error(error.message);
          return;
        }

        if (data.user) {
          toast.success("Account created! Redirecting...");
          navigate("/admin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          console.error("Login error:", error);
          toast.error(error.message);
          return;
        }

        if (data.user) {
          toast.success("Welcome back!");
          // Redirect admin to admin panel, clients to client portal
          if (data.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            navigate("/admin");
          } else {
            navigate("/client-portal");
          }
        }
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-display">
            {isSignUp ? "Create Account" : "Client Login"}
          </CardTitle>
          <CardDescription>
            {isSignUp 
              ? "Create your admin account" 
              : "Sign in to view your leads and data"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? "Creating account..." : "Signing in..."}
                </>
              ) : (
                isSignUp ? "Create Account" : "Sign In"
              )}
            </Button>
          </form>
          
          {/* Toggle for admin setup */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isSignUp 
                ? "Already have an account? Sign in" 
                : "Admin? Create account"}
            </button>
          </div>
          
          {!isSignUp && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              Contact your account manager if you need access
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientAuth;
