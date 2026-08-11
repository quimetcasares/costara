import React, { createContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export interface Business {
  id: string
  name: string
  currency_code: string
  timezone: string
}

export interface BusinessMember {
  role: string
  business: Business
}

interface AuthContextType {
  user: User | null
  session: Session | null
  businesses: Business[]
  selectedBusiness: Business | null
  setSelectedBusiness: (business: Business | null) => void
  loading: boolean
  error: string | null
  signIn: (email: string, pass: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUserBusinesses = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('business_members')
        .select('role, business:businesses(id, name, currency_code, timezone)')

      if (fetchErr) {
        console.error('Error fetching businesses:', fetchErr)
        setBusinesses([])
        setSelectedBusiness(null)
        return
      }

      const list: Business[] = (data || [])
        .map((item: unknown) => {
          const m = item as { business: Business | null }
          return m.business
        })
        .filter((b): b is Business => b !== null)

      setBusinesses(list)
      if (list.length > 0) {
        setSelectedBusiness((prev) => (prev && list.some((b) => b.id === prev.id) ? prev : list[0]))
      } else {
        setSelectedBusiness(null)
      }
    } catch (err) {
      console.error('Failed to load business memberships:', err)
    }
  }

  useEffect(() => {
    let mounted = true

    // Initial session load
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!mounted) return
      setSession(initSession)
      setUser(initSession?.user ?? null)
      if (initSession?.user) {
        fetchUserBusinesses().finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    // Listen to session changes (login, logout, session refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!mounted) return
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setError(null)

      if (currentSession?.user) {
        await fetchUserBusinesses()
      } else {
        setBusinesses([])
        setSelectedBusiness(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, pass: string) => {
    setError(null)
    setLoading(true)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    })
    if (signInErr) {
      setError(signInErr.message)
      setLoading(false)
      throw signInErr
    }
  }

  const signOut = async () => {
    setError(null)
    setLoading(true)
    const { error: signOutErr } = await supabase.auth.signOut()
    if (signOutErr) {
      setError(signOutErr.message)
    }
    setSession(null)
    setUser(null)
    setBusinesses([])
    setSelectedBusiness(null)
    setLoading(false)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        businesses,
        selectedBusiness,
        setSelectedBusiness,
        loading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }

