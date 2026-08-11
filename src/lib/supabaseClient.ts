import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

if (!supabasePublishableKey) {
  console.warn('VITE_SUPABASE_PUBLISHABLE_KEY is not set in environment.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
