import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SessionTimeoutWarning } from '@/components/shared/session-timeout-warning'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentUserProfile()

  if (!profile) {
    redirect('/login')
  }

  const effectiveRole = profile.role ?? 'loan_officer'

  return (
    <DashboardShell user={profile} userRole={effectiveRole}>
      {children}
      <SessionTimeoutWarning timeoutMinutes={14} />
    </DashboardShell>
  )
}
