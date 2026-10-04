import { createClient } from '@/lib/supabase/server'
import { RepaymentForm } from '@/components/repayments/repayment-form'

export const dynamic = 'force-dynamic'

export default async function RepaymentsPage() {
  const supabase = await createClient()

  // Fetch active loans, ledger summaries, groups, and group members concurrently
  const [
    { data: loans },
    { data: summaries },
    { data: groups },
    { data: groupMembers },
  ] = await Promise.all([
    supabase
      .from('loans')
      .select(`
        id, loan_number, principal, total_repayable, weekly_installment, status,
        clients (id, account_number, full_name, phone_number, market_location),
        repayment_schedule (id, installment_number, due_date, expected_amount, paid_amount, balance, status)
      `)
      .in('status', ['active', 'defaulted'])
      .order('created_at', { ascending: false }),
    supabase
      .from('client_ledger_summary')
      .select('loan_id, outstanding_balance, total_repaid'),
    supabase
      .from('groups')
      .select('id, group_number, name, status, meeting_day, meeting_place')
      .eq('status', 'active')
      .order('name', { ascending: true }),
    supabase
      .from('group_members')
      .select('group_id, client_id, date_left')
      .is('date_left', null),
  ])

  const balanceMap: Record<string, number> = {}
  ;(summaries || []).forEach((s) => {
    balanceMap[s.loan_id] = s.outstanding_balance
  })

  const formattedLoans = (loans || []).map((l: any) => ({
    id: l.id,
    loan_number: l.loan_number,
    principal: l.principal,
    total_repayable: l.total_repayable,
    weekly_installment: l.weekly_installment,
    outstanding_balance: balanceMap[l.id] ?? l.total_repayable,
    client: l.clients,
    schedule: (l.repayment_schedule || []).sort(
      (a: any, b: any) => a.installment_number - b.installment_number
    ),
  }))

  // Assemble groups with their active loans
  const formattedGroups = (groups || []).map((g: any) => {
    const memberClientIds = (groupMembers || [])
      .filter((gm: any) => gm.group_id === g.id)
      .map((gm: any) => gm.client_id)

    const groupLoans = formattedLoans.filter((l) =>
      memberClientIds.includes(l.client.id)
    )

    return {
      id: g.id,
      group_number: g.group_number,
      name: g.name,
      meeting_day: g.meeting_day,
      meeting_place: g.meeting_place,
      loans: groupLoans,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Repayment & Collections Center</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Record individual repayments or group batch collections
        </p>
      </div>

      <RepaymentForm
        activeLoans={formattedLoans}
        activeGroups={formattedGroups}
      />
    </div>
  )
}

