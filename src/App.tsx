import React, { useEffect, useState } from 'react'
import { useAuth } from './context/useAuth'
import { supabase } from './lib/supabaseClient'

interface Item {
  id: string
  business_id: string
  name: string
  kind: string
  purchasable: boolean
  producible: boolean
  sellable: boolean
}

export default function App() {
  const {
    user,
    businesses,
    selectedBusiness,
    setSelectedBusiness,
    loading,
    error: authError,
    signIn,
    signOut,
  } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [items, setItems] = useState<Item[]>([])
  const [fetchingItems, setFetchingItems] = useState(false)

  // Fetch items visible to the authenticated user via RLS
  useEffect(() => {
    if (!user) {
      setItems([])
      return
    }

    let isSubscribed = true
    setFetchingItems(true)

    supabase
      .from('items')
      .select('*')
      .then(({ data, error }) => {
        if (!isSubscribed) return
        if (error) {
          console.error('Error fetching items:', error)
          setItems([])
        } else {
          setItems(data || [])
        }
        setFetchingItems(false)
      })

    return () => {
      isSubscribed = false
    }
  }, [user, selectedBusiness])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLocalError(err.message)
      } else {
        setLocalError('Authentication failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="text-slate-400 font-medium animate-pulse">Loading Costara session...</div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full space-y-6 rounded-xl bg-slate-900/80 p-8 border border-slate-800 shadow-2xl backdrop-blur-sm">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono text-xl font-bold">
              C
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Costara M0.3</h1>
            <p className="text-xs text-slate-400">Multi-tenant Authentication Demo</p>
          </div>

          {(localError || authError) && (
            <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {localError || authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a@costara.local"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg shadow transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans flex flex-col items-center">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-mono text-sm font-bold">
              C
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Costara</h1>
          </div>
          <button
            onClick={() => signOut()}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition"
          >
            Sign out
          </button>
        </header>

        {/* User & Business Context */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Signed in as
              </span>
              <span className="font-mono text-slate-100">{user.email}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Active Business
              </span>
              {businesses.length > 1 ? (
                <select
                  value={selectedBusiness?.id || ''}
                  onChange={(e) => {
                    const found = businesses.find((b) => b.id === e.target.value)
                    if (found) setSelectedBusiness(found)
                  }}
                  className="w-full font-semibold text-emerald-400 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold text-emerald-400">
                  {selectedBusiness ? selectedBusiness.name : 'No business assigned'}
                </span>
              )}
              {selectedBusiness && (
                <span className="block font-mono text-[10px] text-slate-500 truncate mt-1">
                  ID: {selectedBusiness.id}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* RLS Items View */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wider text-slate-300 font-semibold">
              Items visible to this user
            </h2>
            {fetchingItems && <span className="text-xs text-slate-500 animate-pulse">Querying RLS...</span>}
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No items visible for this user/business.</p>
          ) : (
            <ul className="divide-y divide-slate-800/60 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
              {items.map((item) => (
                <li key={item.id} className="p-3.5 flex items-center justify-between hover:bg-slate-900/40">
                  <div>
                    <span className="font-medium text-slate-200 text-sm block">{item.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">ID: {item.id}</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {item.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
