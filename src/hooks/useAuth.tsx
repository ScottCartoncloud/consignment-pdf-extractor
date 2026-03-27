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
    let isMounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;

      if (nextSession?.user) {
        const email = (nextSession.user.email ?? "").toLowerCase();
        const domain = email.split("@")[1] ?? "";

        if (!ALLOWED_DOMAINS.includes(domain)) {
          void supabase.auth.signOut();
          setSession(null);
          return;
        }
      }

      setSession(nextSession);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        applySession(nextSession);
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        applySession(session);
        if (isMounted) setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(null);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
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
