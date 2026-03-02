import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = async (authUser: User) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", authUser.id)
        .single();

      // Block inactive or unverified accounts (except during password recovery flow)
      const isPasswordRecoveryRoute = typeof window !== "undefined" && window.location.pathname === "/reset-password";
      if (profile && (!profile.is_active || !profile.is_email_verified) && !isPasswordRecoveryRoute) {
        await supabase.auth.signOut();
        const reason = !profile.is_active
          ? "Sua conta está inativa. Entre em contato com o administrador."
          : "Seu e-mail ainda não foi verificado. Verifique sua caixa de entrada.";
        setUser(null);
        setSession(null);
        setIsLoading(false);
        // Store reason for Auth page to display
        sessionStorage.setItem("auth_block_reason", reason);
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authUser.id);

      const primaryRole = roles?.[0]?.role || "user";

      setUser({
        id: authUser.id,
        email: authUser.email || "",
        name: profile?.name || authUser.email || "",
        role: primaryRole,
        organization_id: profile?.organization_id || null,
        avatar_url: profile?.avatar_url || null,
      });
    } catch {
      setUser({
        id: authUser.id,
        email: authUser.email || "",
        name: authUser.email || "",
        role: "user",
        organization_id: null,
        avatar_url: null,
      });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        if (session?.user) {
          setTimeout(() => fetchUserProfile(session.user), 0);
        } else {
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
