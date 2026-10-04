import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PrintableLoanContract } from '@/components/loans/printable-loan-contract'

export const dynamic = 'force-dynamic'

export default async function LoanContractPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  // Wave 1: auth, loan (with client join) and settings are independent
  const [authRes, loanRes, settingsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('loans')
      .select(`
        *,
        clients (*)
      `)
      .eq('id', params.id)
      .single(),
    supabase.from('settings').select('key, value'),
  ])

  // Any authenticated staff member may view/print the contract
  const user = authRes.data.user
  if (!user) {
    redirect('/login')
  }

  const loan = loanRes.data as any
  if (loanRes.error || !loan || !loan.clients) {
    notFound()
  }

  // Flatten settings rows into a key -> value map (database.types.ts is stale)
  const settingsMap: Record<string, string> = {}
  ;(settingsRes.data || []).forEach((s: any) => {
    if (s && s.key != null) settingsMap[s.key] = String(s.value ?? '')
  })

  return (
    <div className="py-2 sm:py-6">
      <PrintableLoanContract loan={loan} client={loan.clients} settings={settingsMap} />
    </div>
  )
}
