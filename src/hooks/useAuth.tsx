import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContext {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext | undefined>(undefined);

const ALLOWED_DOMAINS = ["cartoncloud.com", "cartoncloud.com.au"];

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let initialised = false;

    // 1. Restore session from storage first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const email = session.user.email ?? "";
        const domain = email.split("@")[1] ?? "";
        if (!ALLOWED_DOMAINS.includes(domain)) {
          supabase.auth.signOut();
          setSession(null);
          setLoading(false);
          initialised = true;
          return;
        }
      }
      setSession(session);
      setLoading(false);
      initialised = true;
    });

    // 2. Listen for subsequent auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!initialised) return; // skip until getSession has resolved
        if (session?.user) {
          const email = session.user.email ?? "";
          const domain = email.split("@")[1] ?? "";
          if (!ALLOWED_DOMAINS.includes(domain)) {
            supabase.auth.signOut();
            setSession(null);
            return;
          }
        }
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
