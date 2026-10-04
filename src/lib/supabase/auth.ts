import { cache } from 'react'
import { createClient } from './server'
import type { Database } from './database.types'

type UserProfile = Database['public']['Tables']['users']['Row']

/**
 * Deduplicated & cached current auth user for the current request.
 * Multiple components calling this during the same render will only trigger 1 network call.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Deduplicated & cached profile fetch from public.users for the current request.
 */
export const getCurrentUserProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    return null
  }

  return profile
})
