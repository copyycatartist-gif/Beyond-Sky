import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { LoanList } from '@/components/loans/loan-list'

export const dynamic = 'force-dynamic'

const MANAGER_ROLES = ['manager', 'supervisor', 'accountant_admin']
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const SORTABLE = ['created_at', 'principal', 'total_repayable', 'weekly_installment', 'status', 'outstanding']

const LOAN_SELECT = `
  id, loan_number, principal, fee_amount, total_repayable, weekly_installment,
  term_weeks, payment_frequency, status, disbursement_date, created_at, client_id,
  clients (id, account_number, full_name, phone_number, market_location, branch)
`

interface LoansPageProps {
  searchParams: {
    q?: string
    status?: string
    sort?: string
    dir?: string
    page?: string
    perPage?: string
    from?: string
    to?: string
    branch?: string
  }
}

export default async function LoansPage({ searchParams }: LoansPageProps) {
  const supabase = await createClient()

  const q = (searchParams.q?.trim() || '').replace(/[,()%]/g, '')
  const status = searchParams.status || 'all'
  const branch = searchParams.branch || 'all'
  const sortRaw = searchParams.sort || 'created_at'
  const sort = SORTABLE.includes(sortRaw) ? sortRaw : 'created_at'
  const dir = searchParams.dir === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const perPage = Math.min(100, Math.max(5, parseInt(searchParams.perPage || '25', 10) || 25))
  const dateFrom = searchParams.from || ''
  const dateTo = searchParams.to || ''

  const today = new Date().toISOString().slice(0, 10)
  const role = await getCurrentUserProfile().then((p) => (p?.role as string) || 'loan_officer')
  const isManager = MANAGER_ROLES.includes(role)

  // Wave 1 (parallel): client id search (q / branch) + overdue loan ids (status=overdue chip)
  const needClientSearch = Boolean(q) || branch !== 'all'
  const [clientsRes, overdueRes] = await Promise.all([
    needClientSearch
      ? (() => {
          let qb = supabase.from('clients' as any).select('id').limit(200)
          if (q) qb = qb.or(`full_name.ilike.%${q}%,account_number.ilike.%${q}%,phone_number.ilike.%${q}%`)
          if (branch !== 'all') qb = qb.eq('branch', branch)
          return qb
        })()
      : Promise.resolve({ data: [] as any[], error: null }),
    status === 'overdue'
      ? supabase
          .from('repayment_schedule' as any)
          .select('loan_id')
          .in('status', ['overdue', 'defaulted'])
          .limit(1000)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  const clientIds = ((clientsRes.data || []) as any[]).map((r) => r.id as string)
  const overdueLoanIds = Array.from(
    new Set(((overdueRes.data || []) as any[]).map((r) => r.loan_id as string))
  )

  // Applies the full user filter set to a `loans` query builder
  const applyFilters = (qb: any) => {
    if (q) {
      qb = clientIds.length
        ? qb.or(`loan_number.ilike.%${q}%,client_id.in.(${clientIds.join(',')})`)
        : qb.ilike('loan_number', `%${q}%`)
    } else if (branch !== 'all') {
      qb = clientIds.length ? qb.in('client_id', clientIds) : qb.eq('client_id', ZERO_UUID)
    }
    if (status === 'overdue') {
      qb = overdueLoanIds.length ? qb.in('id', overdueLoanIds) : qb.eq('id', ZERO_UUID)
    } else if (status !== 'all') {
      qb = qb.eq('status', status)
    }
    if (dateFrom) qb = qb.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo) qb = qb.lte('created_at', `${dateTo}T23:59:59`)
    return qb
  }

  // Status/date filters only (bounded aggregate queries for the KPI strip).
  // These degrade gracefully (null KPIs) if the embedded-resource filter is unsupported.
  const applyKpiFilters = (qb: any) => {
    if (status !== 'all' && status !== 'overdue') qb = qb.eq('loans.status', status)
    if (dateFrom) qb = qb.gte('loans.created_at', `${dateFrom}T00:00:00`)
    if (dateTo) qb = qb.lte('loans.created_at', `${dateTo}T23:59:59`)
    return qb
  }

  const fetchMain = async (): Promise<{ rows: any[]; total: number; error: string | null }> => {
    if (sort === 'outstanding') {
      // Outstanding lives in client_ledger_summary → sort/paginate in memory over a bounded id set
      const idsRes = await applyFilters(
        supabase.from('loans' as any).select('id', { count: 'exact' })
      )
        .order('created_at', { ascending: false })
        .limit(500)
      if (idsRes.error) return { rows: [], total: 0, error: idsRes.error.message }

      const allIds = ((idsRes.data || []) as any[]).map((r) => r.id as string)
      const total = idsRes.count || 0

      const chunks: string[][] = []
      for (let i = 0; i < allIds.length; i += 150) chunks.push(allIds.slice(i, i + 150))
      const ledgerChunks = await Promise.all(
        chunks.length
          ? chunks.map((c) =>
              supabase.from('client_ledger_summary' as any).select('loan_id, outstanding_balance').in('loan_id', c)
            )
          : [Promise.resolve({ data: [] as any[] })]
      )
      const balMap = new Map<string, number>()
      ledgerChunks.forEach((res) =>
        ((res.data || []) as any[]).forEach((r) => balMap.set(r.loan_id, Number(r.outstanding_balance) || 0))
      )

      const sortedIds = allIds
        .map((id) => ({ id, ob: balMap.get(id) || 0 }))
        .sort((a, b) => (dir === 'asc' ? a.ob - b.ob : b.ob - a.ob))
        .slice((page - 1) * perPage, page * perPage)
        .map((s) => s.id)

      if (!sortedIds.length) return { rows: [], total, error: null }
      const res = await supabase.from('loans' as any).select(LOAN_SELECT).in('id', sortedIds)
      if (res.error) return { rows: [], total, error: res.error.message }
      const byId = new Map<string, any>()
      ;((res.data || []) as any[]).forEach((r) => byId.set(r.id, r))
      return { rows: sortedIds.map((id) => byId.get(id)).filter(Boolean), total, error: null }
    }

    const res = await applyFilters(supabase.from('loans' as any).select(LOAN_SELECT, { count: 'exact' }))
      .order(sort as any, { ascending: dir === 'asc' })
      .range((page - 1) * perPage, page * perPage - 1)
    if (res.error) return { rows: [], total: 0, error: res.error.message }
    return { rows: (res.data || []) as any[], total: res.count || 0, error: null }
  }

  // Wave 2 (parallel): page rows + status distribution + KPI aggregates
  const [mainRes, distRes, ledgerKpiRes, overdueKpiRes] = await Promise.all([
    fetchMain(),
    applyFilters(supabase.from('loans' as any).select('status, principal')).limit(5000),
    applyKpiFilters(supabase.from('client_ledger_summary' as any).select('outstanding_balance, loans!inner(id)')),
    applyKpiFilters(
      supabase
        .from('repayment_schedule' as any)
        .select('balance, loans!inner(id)')
        .in('status', ['overdue', 'defaulted'])
    ),
  ])

  let rows = mainRes.rows
  const total = mainRes.total
  const queryError = mainRes.error

  // Wave 3 (parallel): enrich ONLY the current page with balances + next-due info
  const ids = rows.map((r) => r.id as string)
  const [balancesRes, scheduleRes] = await Promise.all([
    ids.length
      ? supabase.from('client_ledger_summary' as any).select('loan_id, outstanding_balance').in('loan_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase
          .from('repayment_schedule' as any)
          .select('loan_id, installment_number, due_date, status')
          .in('loan_id', ids)
          .neq('status', 'paid')
          .order('due_date', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const balMap = new Map<string, number>()
  ;((balancesRes.data || []) as any[]).forEach((r) =>
    balMap.set(r.loan_id, Number(r.outstanding_balance) || 0)
  )

  const nextDueMap = new Map<string, { next_due_date: string | null; days_overdue: number }>()
  ;((scheduleRes.data || []) as any[]).forEach((r) => {
    if (nextDueMap.has(r.loan_id)) return // rows arrive ordered by due_date asc → first unpaid wins
    const due = r.due_date as string
    const diff = Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86400000)
    nextDueMap.set(r.loan_id, { next_due_date: due, days_overdue: diff > 0 ? diff : 0 })
  })

  rows = rows.map((r) => ({
    ...r,
    outstanding_balance: balMap.has(r.id) ? (balMap.get(r.id) as number) : null,
    next_due_date: nextDueMap.get(r.id)?.next_due_date ?? null,
    days_overdue: nextDueMap.get(r.id)?.days_overdue ?? 0,
  }))

  // Status distribution + disbursed total (full filtered set, bounded at 5000 rows)
  const dist = (distRes.data || []) as any[]
  const statusCounts: Record<string, number> = {}
  let totalDisbursed = 0
  let activeLoans = 0
  dist.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
    totalDisbursed += Number(r.principal) || 0
    if (r.status === 'active') activeLoans++
  })

  const ledgerRows = (ledgerKpiRes.data || []) as any[]
  const overdueRows = (overdueKpiRes.data || []) as any[]
  const totalOutstanding = ledgerKpiRes.error
    ? null
    : ledgerRows.reduce((s, r) => s + (Number(r.outstanding_balance) || 0), 0)
  const overdueBalance = overdueKpiRes.error
    ? null
    : overdueRows.reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const parPct =
    totalOutstanding != null && totalOutstanding > 0 && overdueBalance != null
      ? Math.round((overdueBalance / totalOutstanding) * 1000) / 10
      : null

  // Page-level fallbacks when the aggregate queries failed
  const pageOutstanding = rows.reduce((s, r) => s + (Number(r.outstanding_balance) || 0), 0)

  const kpis = isManager
    ? {
        totalOutstanding: totalOutstanding ?? pageOutstanding,
        totalDisbursed: distRes.error ? rows.reduce((s, r) => s + (Number(r.principal) || 0), 0) : totalDisbursed,
        activeLoans,
        par: parPct,
        scope: totalOutstanding != null && !distRes.error ? ('filtered' as const) : ('page' as const),
      }
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Loans Portfolio</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Active, pending, and past micro-credit loans across all market centers
        </p>
      </div>

      <Suspense fallback={null}>
        <LoanList
          rows={rows as any}
          pagination={{ page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }}
          filters={{ q, status, sort, dir, branch, from: dateFrom, to: dateTo }}
          kpis={kpis}
          statusCounts={statusCounts}
          today={today}
          error={queryError}
        />
      </Suspense>
    </div>
  )
}
