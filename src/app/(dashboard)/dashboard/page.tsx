import { createClient } from '@/lib/supabase/server'
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { ParChart } from '@/components/dashboard/par-chart'
import { RecentLoans } from '@/components/dashboard/recent-loans'
import { OverdueAlert } from '@/components/dashboard/overdue-alert'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [portfolioResult, parResult, overdueResult, recentLoansResult] = await Promise.all([
    supabase.from('portfolio_summary').select('*').single(),
    supabase.from('par_report').select('*').single(),
    supabase.from('overdue_clients').select('*').limit(5),
    supabase
      .from('loans')
      .select(`
        id, loan_number, status, principal, disbursement_date, created_at,
        clients (id, full_name, account_number)
      `)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Executive Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Real-time micro-credit portfolio metrics, collections, and risk indicators
        </p>
      </div>

      {/* KPI Stats */}
      <DashboardStats
        portfolio={portfolioResult.data}
        par={parResult.data}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* PAR Chart (2 cols) */}
        <div className="xl:col-span-2">
          <ParChart par={parResult.data} />
        </div>

        {/* Overdue Alert (1 col) */}
        <div>
          <OverdueAlert clients={overdueResult.data ?? []} />
        </div>
      </div>

      {/* Recent Loans */}
      <RecentLoans loans={recentLoansResult.data ?? []} />
    </div>
  )
}
