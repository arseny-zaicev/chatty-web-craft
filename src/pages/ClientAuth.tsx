import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

const ADMIN_EMAIL = "arseny@iskra.ae";

const ClientAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Only show signup if ?setup=admin is in URL
  const isAdminSetup = searchParams.get("setup") === "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsLoading(true);

    try {
      if (isAdminSetup) {
        // Only allow admin to sign up
        if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          toast.error("Access denied");
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

  // ISKRA Logo Component
  const IskraLogo = () => (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
        <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill="currentColor"/>
      </svg>
      <span className="font-display text-xl font-bold tracking-tight text-foreground">ISKRA</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Back to Home button */}
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>
      
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* ISKRA Logo */}
          <Link to="/" className="flex justify-center mb-4">
            <IskraLogo />
          </Link>
          <CardTitle className="text-2xl font-display">
            {isAdminSetup ? "Admin Setup" : "Client Login"}
          </CardTitle>
          <CardDescription>
            {isAdminSetup 
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
                  {isAdminSetup ? "Creating account..." : "Signing in..."}
                </>
              ) : (
                isAdminSetup ? "Create Account" : "Sign In"
              )}
            </Button>
          </form>
          
          {!isAdminSetup && (
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
