import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const LoginPage = () => {
  const { session, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (session) return <Navigate to="/tenants" replace />;

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: {
        hd: "*",
        prompt: "select_account",
      },
    });
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed. Please use a CartonCloud account.");
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">CloudyPDF</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your CartonCloud Google account
        </p>
        <Button
          onClick={handleGoogleLogin}
          disabled={signingIn}
          className="w-full"
          size="lg"
        >
          {signingIn ? "Redirecting…" : "Sign in with Google"}
        </Button>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Only @cartoncloud.com and @cartoncloud.com.au accounts are permitted.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
