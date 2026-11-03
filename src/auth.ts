import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const authUrl = `${location.hash}${location.search}`

export const openedFromEmail = /access_token|type=signup|type=magiclink|type=recovery|type=invite|type=email/.test(authUrl)
export const recoveryFromEmail = /type=recovery/.test(authUrl)

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "implicit",
        },
      })
    : null

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

function requireClient() {
  if (!supabase) throw new Error("Cloud saves are not configured")
  return supabase
}

export async function signIn(email: string, password: string) {
  const client = requireClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email: string, password: string) {
  const client = requireClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return data.session
}

export async function sendPasswordLink(email: string) {
  const client = requireClient()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function setPassword(password: string) {
  const client = requireClient()
  const { error } = await client.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
