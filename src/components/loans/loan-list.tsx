'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/use-toast'
import { cn, formatCurrency, formatDate, loanStatusBadgeClass } from '@/lib/utils'
import {
  Search, PlusCircle, Eye, Download, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw,
} from 'lucide-react'

interface LoanRow {
  id: string
  loan_number: string
  principal: number
  fee_amount: number
  total_repayable: number
  weekly_installment: number
  term_weeks: number
  payment_frequency?: string | null
  status: string
  disbursement_date: string | null
  created_at: string
  clients: {
    id: string
    account_number: string
    full_name: string
    phone_number: string
    market_location: string
    branch?: string | null
  } | null
  outstanding_balance: number | null
  next_due_date: string | null
  days_overdue: number
}

interface LoanListProps {
  rows: LoanRow[]
  pagination: { page: number; perPage: number; total: number; totalPages: number }
  filters: { q: string; status: string; sort: string; dir: string; branch: string; from: string; to: string }
  kpis: {
    totalOutstanding: number
    totalDisbursed: number
    activeLoans: number
    par: number | null
    scope: 'filtered' | 'page'
  } | null
  statusCounts: Record<string, number>
  today: string
  error: string | null
}

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'defaulted', label: 'Defaulted' },
]

const STATUS_ORDER = ['pending', 'approved', 'active', 'closed', 'defaulted', 'refinanced', 'rejected']

const STATUS_BAR_COLORS: Record<string, string> = {
  pending: 'bg-amber-400',
  approved: 'bg-blue-400',
  active: 'bg-emerald-500',
  closed: 'bg-slate-400',
  defaulted: 'bg-red-500',
  refinanced: 'bg-purple-400',
  rejected: 'bg-gray-300',
}

export function LoanList({ rows, pagination, filters, kpis, statusCounts, error }: LoanListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [searchInput, setSearchInput] = useState(filters.q)

  // Keep the local input in sync when the URL changes (back/forward, chip clicks)
  useEffect(() => {
    setSearchInput(filters.q)
  }, [filters.q])

  const updateURL = useCallback(
    (params: Record<string, string>) => {
      const current = new URLSearchParams(searchParams.toString())
      Object.entries(params).forEach(([key, value]) => {
        if (value === 'all' || value === '' || (value === '1' && key === 'page')) {
          current.delete(key)
        } else {
          current.set(key, value)
        }
      })
      // Any filter/sort change resets pagination
      if (
        params.q !== undefined || params.status !== undefined || params.branch !== undefined ||
        params.from !== undefined || params.to !== undefined || params.sort !== undefined ||
        params.perPage !== undefined
      ) {
        current.delete('page')
      }
      router.push(`/loans?${current.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Debounced search (~300ms)
  useEffect(() => {
    if (searchInput === filters.q) return
    const t = setTimeout(() => updateURL({ q: searchInput }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const toggleSort = useCallback(
    (key: string) => {
      const newDir = filters.sort === key && filters.dir === 'desc' ? 'asc' : 'desc'
      updateURL({ sort: key, dir: newDir })
    },
    [filters.sort, filters.dir, updateURL]
  )

  const pageTotals = useMemo(() => {
    let principal = 0
    let outstanding = 0
    rows.forEach((r) => {
      principal += Number(r.principal) || 0
      outstanding += Number(r.outstanding_balance) || 0
    })
    return { principal, outstanding }
  }, [rows])

  const distTotal = useMemo(() => {
    let sum = 0
    Object.keys(statusCounts).forEach((k) => { sum += statusCounts[k] })
    return sum
  }, [statusCounts])

  const exportCsv = useCallback(() => {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = [
      'Loan #', 'Client', 'Account #', 'Phone', 'Market', 'Principal', 'Outstanding Balance',
      'Total Repayable', 'Weekly Installment', 'Term (wks)', 'Next Due', 'Days Overdue', 'Status', 'Submitted',
    ]
    const lines = rows.map((r) =>
      [
        r.loan_number, r.clients?.full_name, r.clients?.account_number, r.clients?.phone_number,
        r.clients?.market_location, r.principal, r.outstanding_balance ?? '', r.total_repayable,
        r.weekly_installment, r.term_weeks, r.next_due_date ?? '', r.days_overdue, r.status,
        r.created_at?.slice(0, 10),
      ]
        .map(esc)
        .join(',')
    )
    const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loans-portfolio-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({
      title: 'Export complete',
      description: `${rows.length} loan${rows.length === 1 ? '' : 's'} exported to CSV`,
      variant: 'success',
    })
  }, [rows, toast])

  const SortIcon = ({ col }: { col: string }) => {
    if (filters.sort !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-40" />
    return filters.dir === 'asc' ? (
      <ChevronUp className="h-3 w-3 ml-1 text-blue-600" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-1 text-blue-600" />
    )
  }

  const sortableHead = (label: string, col: string, align: 'left' | 'right' = 'left') => (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn(
          'inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-blue-700 transition-colors',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        <SortIcon col={col} />
      </button>
    </TableHead>
  )

  // Windowed page numbers
  const pageNumbers = useMemo(() => {
    const { page, totalPages } = pagination
    const pages: (number | '...')[] = []
    const win = 2
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - win && p <= page + win)) pages.push(p)
      else if (pages[pages.length - 1] !== '...') pages.push('...')
    }
    return pages
  }, [pagination])

  return (
    <div className="space-y-4">
      {/* KPI strip (manager+ only) */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Total Outstanding</div>
            <div className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(kpis.totalOutstanding)}</div>
            {kpis.scope === 'page' && <div className="text-[10px] text-amber-600 mt-0.5">current page only</div>}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Total Disbursed</div>
            <div className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(kpis.totalDisbursed)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Active Loans</div>
            <div className="text-xl font-bold text-emerald-600 mt-1">{kpis.activeLoans.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Portfolio at Risk</div>
            <div
              className={cn(
                'text-xl font-bold mt-1',
                kpis.par == null ? 'text-gray-400' : kpis.par > 10 ? 'text-red-600' : kpis.par > 5 ? 'text-amber-600' : 'text-emerald-600'
              )}
            >
              {kpis.par == null ? '—' : `${kpis.par}%`}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">overdue share of outstanding</div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Could not load loans.</span> {error}
            </span>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 border-red-300 text-red-700 hover:bg-red-100" onClick={() => router.refresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by loan #, client name, account #, phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => updateURL({ from: e.target.value })}
              className="bg-white w-[9.5rem]"
              aria-label="Submitted from"
            />
            <span className="text-gray-400 text-xs">to</span>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => updateURL({ to: e.target.value })}
              className="bg-white w-[9.5rem]"
              aria-label="Submitted to"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-10 bg-white" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1.5 text-gray-500" />
            Export CSV
          </Button>
          <Link href="/loans/new">
            <Button className="h-10 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 font-medium">
              <PlusCircle className="h-4 w-4 mr-2" />
              New Loan Application
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick-filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => {
          const active = filters.status === chip.key
          const count = chip.key === 'all' ? distTotal : statusCounts[chip.key] || 0
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => updateURL({ status: chip.key })}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-700'
              )}
            >
              {chip.label}
              {chip.key !== 'overdue' && count > 0 && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', active ? 'bg-blue-500 text-blue-50' : 'bg-gray-100 text-gray-500')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Status distribution mini-bar */}
      {distTotal > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100">
            {STATUS_ORDER.map((s) => {
              const c = statusCounts[s] || 0
              if (!c) return null
              return (
                <div
                  key={s}
                  className={cn('h-full', STATUS_BAR_COLORS[s] || 'bg-gray-300')}
                  style={{ width: `${(c / distTotal) * 100}%` }}
                  title={`${s}: ${c}`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className={cn('h-2 w-2 rounded-full', STATUS_BAR_COLORS[s] || 'bg-gray-300')} />
                <span className="capitalize">{s}</span>
                <span className="font-semibold text-gray-700">{statusCounts[s]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loan #</TableHead>
              <TableHead>Client</TableHead>
              {sortableHead('Principal', 'principal', 'right')}
              {sortableHead('Outstanding', 'outstanding', 'right')}
              <TableHead className="text-right">Total Repayable</TableHead>
              <TableHead className="text-right">Weekly Installment</TableHead>
              <TableHead>Next Due</TableHead>
              {sortableHead('Status', 'status')}
              {sortableHead('Submitted', 'created_at')}
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-40 text-center">
                  {!error && (
                    <div className="space-y-3">
                      <div className="text-gray-400 text-sm font-medium">
                        No loans match your filters — try clearing the search or date range.
                      </div>
                      <Link href="/loans/new">
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                          <PlusCircle className="h-4 w-4 mr-1.5" />
                          New Loan Application
                        </Button>
                      </Link>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((loan) => {
                const isOverdue = loan.days_overdue > 0
                const isDefaulted = loan.status === 'defaulted'
                return (
                  <TableRow
                    key={loan.id}
                    className={cn(
                      'hover:bg-slate-50/80',
                      isDefaulted && 'border-l-4 border-l-red-500 bg-red-50/40',
                      !isDefaulted && isOverdue && 'border-l-4 border-l-amber-400 bg-amber-50/30'
                    )}
                  >
                    <TableCell className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                      {loan.loan_number}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-gray-900 text-sm">{loan.clients?.full_name || '—'}</div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {loan.clients?.account_number}
                        {loan.clients?.phone_number ? ` • ${loan.clients.phone_number}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs text-gray-900 whitespace-nowrap">
                      {formatCurrency(loan.principal)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-bold text-xs whitespace-nowrap',
                        isOverdue || isDefaulted ? 'text-red-600' : 'text-gray-900'
                      )}
                    >
                      {loan.outstanding_balance == null ? '—' : formatCurrency(loan.outstanding_balance)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-gray-900 whitespace-nowrap">
                      {formatCurrency(loan.total_repayable)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-blue-700 whitespace-nowrap">
                      {formatCurrency(loan.weekly_installment)}/{loan.payment_frequency === 'monthly' ? 'mo' : 'wk'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {loan.next_due_date ? (
                        <div className="space-y-0.5">
                          <div className="text-xs text-gray-700">{formatDate(loan.next_due_date)}</div>
                          {isOverdue && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                              {loan.days_overdue}d overdue
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize',
                          loanStatusBadgeClass(loan.status)
                        )}
                      >
                        {loan.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(loan.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/loans/${loan.id}`}>
                        <Button variant="outline" size="sm" className="h-8 text-xs px-2.5">
                          <Eye className="h-3.5 w-3.5 mr-1 text-gray-500" />
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50/70">
              <tr>
                <td className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-500" colSpan={2}>
                  Page totals ({rows.length} loan{rows.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900">
                  {formatCurrency(pageTotals.principal)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900">
                  {formatCurrency(pageTotals.outstanding)}
                </td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            Showing {rows.length ? (pagination.page - 1) * pagination.perPage + 1 : 0}–
            {(pagination.page - 1) * pagination.perPage + rows.length} of {pagination.total.toLocaleString()} loans
          </span>
          <select
            value={String(pagination.perPage)}
            onChange={(e) => updateURL({ perPage: e.target.value })}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Rows per page"
          >
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={pagination.page <= 1}
            onClick={() => updateURL({ page: String(pagination.page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`gap-${i}`} className="px-1.5 text-xs text-gray-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => updateURL({ page: String(p) })}
                className={cn(
                  'h-8 min-w-8 px-2 rounded-md text-xs font-semibold border transition-colors',
                  p === pagination.page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-700'
                )}
              >
                {p}
              </button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => updateURL({ page: String(pagination.page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
