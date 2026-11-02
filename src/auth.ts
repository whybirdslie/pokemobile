import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: false } }) : null

export function cloudConfigured() {
  return supabase != null
}

export async function session() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onSession(cb: (session: Session | null) => void) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, next) => cb(next))
  return () => data.subscription.unsubscribe()
}

export async function sendCode(email: string) {
  if (!supabase) throw new Error("Cloud saves are not configured")
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error("Cloud saves are not configured")
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
