import React, { createContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient.js';

export interface Business {
  id: string;
  name: string;
  currency_code: string;
  timezone: string;
}

export interface BusinessMember {
  role: 'owner' | 'admin' | 'member' | string;
  business: Business;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  businesses: Business[];
  selectedBusiness: Business | null;
  selectedRole: 'owner' | 'admin' | 'member';
  setSelectedBusiness: (business: Business | null) => void;
  loading: boolean;
  error: string | null;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [memberships, setMemberships] = useState<BusinessMember[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserBusinesses = async (userId?: string) => {
    try {
      let currentUserId = userId;
      if (!currentUserId) {
        const { data: userData } = await supabase.auth.getUser();
        currentUserId = userData.user?.id;
      }

      if (!currentUserId) {
        setBusinesses([]);
        setMemberships([]);
        setSelectedBusiness(null);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('business_members')
        .select('role, user_id, business:businesses(id, name, currency_code, timezone)')
        .eq('user_id', currentUserId);

      if (fetchErr) {
        console.error('Error fetching businesses:', fetchErr);
        setBusinesses([]);
        setMemberships([]);
        setSelectedBusiness(null);
        return;
      }

      type RawMemberRow = {
        role: string;
        user_id: string;
        business: Business | Business[] | null;
      };

      const memberList: BusinessMember[] = (data || [])
        .map((item: RawMemberRow) => {
          const b = Array.isArray(item.business) ? item.business[0] : item.business;
          if (!b) return null;
          return {
            role: item.role,
            business: b,
          };
        })
        .filter((m): m is BusinessMember => m !== null);

      setMemberships(memberList);
      const list = memberList.map((m) => m.business);
      setBusinesses(list);

      if (list.length > 0) {
        setSelectedBusiness((prev) => (prev && list.some((b) => b.id === prev.id) ? prev : list[0]));
      } else {
        setSelectedBusiness(null);
      }
    } catch (err) {
      console.error('Failed to load business memberships:', err);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Initial session load
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!mounted) return;
      setSession(initSession);
      setUser(initSession?.user ?? null);
      if (initSession?.user) {
        fetchUserBusinesses(initSession.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen to session changes (login, logout, session refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setError(null);

      if (currentSession?.user) {
        await fetchUserBusinesses(currentSession.user.id);
      } else {
        setBusinesses([]);
        setMemberships([]);
        setSelectedBusiness(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (signInErr) {
      setError(signInErr.message);
      setLoading(false);
      throw signInErr;
    }
  };

  const signOut = async () => {
    setError(null);
    setLoading(true);
    const { error: signOutErr } = await supabase.auth.signOut();
    if (signOutErr) {
      setError(signOutErr.message);
    }
    setSession(null);
    setUser(null);
    setBusinesses([]);
    setMemberships([]);
    setSelectedBusiness(null);
    setLoading(false);
  };

  const currentMembership = memberships.find((m) => m.business.id === selectedBusiness?.id);
  const selectedRole = (currentMembership?.role || 'member') as 'owner' | 'admin' | 'member';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        businesses,
        selectedBusiness,
        selectedRole,
        setSelectedBusiness,
        loading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
