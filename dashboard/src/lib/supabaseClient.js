import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Names of required settings that were missing (or, for the URL, not a valid
// http(s) address) when this build was made.
// Vite bakes env vars in at build time, so a hosted build needs them set
// before it is built (and a rebuild after they change).
function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export const missingConfig = [
  !isHttpUrl(supabaseUrl) && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

if (missingConfig.length) {
  console.warn(
    `Missing ${missingConfig.join(', ')}. Copy .env.example to .env (or set them on your host) and rebuild.`
  )
}

export const supabase = missingConfig.length ? null : createClient(supabaseUrl, supabaseAnonKey)
