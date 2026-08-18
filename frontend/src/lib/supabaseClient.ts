import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey, {
  auth: {
    // PKCE rather than the implicit flow: a password-reset (or magic-link)
    // email otherwise points straight at Supabase's /auth/v1/verify, and
    // that link is one-time-use — any GET to it consumes the token, which
    // is exactly what email security scanners (Gmail's link prefetching
    // among them) do before the user ever clicks. That burns the token and
    // the real click lands on "otp_expired". PKCE's code exchange needs a
    // verifier that only ever lives in the browser that requested the
    // reset, so a server-side prefetch can't complete it and the link
    // survives until the user actually opens it.
    flowType: 'pkce',
  },
})
