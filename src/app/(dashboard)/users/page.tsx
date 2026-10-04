import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UsersManager } from '@/components/users/users-manager'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check admin privileges
  const { data: currentProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentProfile?.role !== 'accountant_admin') {
    redirect('/dashboard')
  }

  // Fetch all staff users
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Staff & Role Administration</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Provision staff accounts, authorize security roles, decommission access, and reset passwords
        </p>
      </div>

      <UsersManager
        initialUsers={users || []}
        currentUserId={user.id}
      />
    </div>
  )
}
