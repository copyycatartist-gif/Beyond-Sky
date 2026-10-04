import { createClient } from '@/lib/supabase/server'
import { ClientList } from '@/components/clients/client-list'
import { ClientListSkeleton } from '@/components/clients/client-list-skeleton'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { Suspense } from 'react'

export const revalidate = 30
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface ClientsPageProps {
  searchParams: {
    q?: string
    status?: string
    branch?: string
    tier?: string
    page?: string
    sort?: string
    order?: string
    from?: string
    to?: string
  }
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  const query = searchParams.q?.trim() || ''
  const status = searchParams.status || 'all'
  const branch = searchParams.branch || 'all'
  const tier = searchParams.tier || 'all'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const sort = searchParams.sort || 'created_at'
  const order = searchParams.order === 'asc' ? 'asc' : 'desc'
  const dateFrom = searchParams.from || ''
  const dateTo = searchParams.to || ''

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let supabaseQuery = supabase
    .from('clients')
    .select(`
      id, account_number, full_name, phone_number, national_id,
      business_type, market_location, daily_business_income, monthly_income,
      status, tier, is_watchlisted, is_dormant, date_registered, created_at,
      last_activity_at, profile_completeness, branch, area, photo_url,
      group_members(group_id, groups(id, name, group_number)),
      loans(id, status)
    `, { count: 'exact' })
    .order(sort as any, { ascending: order === 'asc' })

  if (query) {
    supabaseQuery = supabaseQuery.or(
      `full_name.ilike.%${query}%,account_number.ilike.%${query}%,phone_number.ilike.%${query}%,national_id.ilike.%${query}%,market_location.ilike.%${query}%,business_type.ilike.%${query}%,guarantor_name.ilike.%${query}%`
    )
  }

  if (status !== 'all') {
    supabaseQuery = supabaseQuery.eq('status', status)
  }

  if (branch !== 'all') {
    supabaseQuery = supabaseQuery.eq('branch', branch)
  }

  if (tier !== 'all') {
    supabaseQuery = supabaseQuery.eq('tier', tier)
  }

  if (dateFrom) {
    supabaseQuery = supabaseQuery.gte('date_registered', dateFrom)
  }

  if (dateTo) {
    supabaseQuery = supabaseQuery.lte('date_registered', dateTo)
  }

  supabaseQuery = supabaseQuery.range(from, to)

  // All remaining queries are independent — fetch them in one parallel wave
  const [clientsRes, branchesRes, activeCountRes, inactiveCountRes, defaultedCountRes, registrationTrendRes, branchCountsRes] = await Promise.all([
    supabaseQuery,
    supabase
      .from('clients')
      .select('branch')
      .not('branch', 'is', null),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'inactive'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'defaulted'),
    supabase
      .from('clients')
      .select('date_registered')
      .gte('date_registered', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('date_registered', { ascending: true }),
    supabase
      .from('clients')
      .select('branch, area'),
  ])

  const clients = clientsRes.data
  const count = clientsRes.count

  const branches = branchesRes.data
  const uniqueBranches = Array.from(new Set((branches || []).map((b: any) => b.branch).filter(Boolean))) as string[]

  const activeCount = activeCountRes.count
  const inactiveCount = inactiveCountRes.count
  const defaultedCount = defaultedCountRes.count

  const registrationTrend = registrationTrendRes.data

  const trendByDay: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    trendByDay[d] = 0
  }
  ;(registrationTrend || []).forEach((r: any) => {
    const day = r.date_registered?.slice(0, 10)
    if (day && day in trendByDay) trendByDay[day]++
  })

  const branchCounts = branchCountsRes.data

  const branchBreakdown: Record<string, number> = {}
  ;(branchCounts || []).forEach((b: any) => {
    const key = b.branch || 'Unassigned'
    branchBreakdown[key] = (branchBreakdown[key] || 0) + 1
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Clients Directory</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Registered micro-credit clients, market traders, and KYC profiles
          </p>
        </div>
      </div>

      <Suspense fallback={<ClientListSkeleton />}>
        <ClientList
          clients={(clients as any) || []}
          totalCount={count || 0}
          page={page}
          pageSize={PAGE_SIZE}
          query={query}
          status={status}
          branch={branch}
          tier={tier}
          sort={sort}
          order={order}
          dateFrom={dateFrom}
          dateTo={dateTo}
          branches={uniqueBranches}
          statusCounts={{
            all: (activeCount || 0) + (inactiveCount || 0) + (defaultedCount || 0),
            active: activeCount || 0,
            inactive: inactiveCount || 0,
            defaulted: defaultedCount || 0,
          }}
          userRole={profile?.role || 'loan_officer'}
          registrationTrend={Object.entries(trendByDay).map(([date, count]) => ({ date, count }))}
          branchBreakdown={Object.entries(branchBreakdown).map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count)}
        />
      </Suspense>
    </div>
  )
}
