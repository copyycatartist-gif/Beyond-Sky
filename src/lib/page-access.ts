import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Send the person to the dashboard when their role cannot open this page. */
export async function requirePageRoles(allowed: string[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !allowed.includes(profile.role || '')) {
    redirect('/')
  }
}
