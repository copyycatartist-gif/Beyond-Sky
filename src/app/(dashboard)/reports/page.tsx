import { createClient } from '@/lib/supabase/server'
import { requirePageRoles } from '@/lib/page-access'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, loanStatusBadgeClass } from '@/lib/utils'
import { BarChart3, Printer, FileSpreadsheet, TrendingUp, ShieldAlert, BookOpen } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  await requirePageRoles(['supervisor', 'manager', 'accountant_admin'])
  const supabase = await createClient()

  // Fetch all reports concurrently in parallel
  const [{ data: ledgerRows }, { data: weeklyPerf }, { data: parReport }] = await Promise.all([
    supabase
      .from('client_ledger_summary')
      .select('*')
      .order('disbursement_date', { ascending: false }),
    supabase
      .from('weekly_collection_performance')
      .select('*')
      .limit(8),
    supabase
      .from('par_report')
      .select('*')
      .single(),
  ])

  // Aggregates
  const totalDisbursed = (ledgerRows || []).reduce((acc, r) => acc + Number(r.total_disbursed), 0)
  const totalFees = (ledgerRows || []).reduce((acc, r) => acc + Number(r.total_fees_collected), 0)
  const totalRepaid = (ledgerRows || []).reduce((acc, r) => acc + Number(r.total_repaid), 0)
  const totalOutstanding = (ledgerRows || []).reduce((acc, r) => acc + Number(r.outstanding_balance), 0)

  return (
    <div className="space-y-6">
      {/* Header & Print Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Financial Ledger & Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Audit-grade derived financial summaries, portfolio risk, and weekly recovery analytics
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          <Link href="/import">
            <Button variant="outline" size="sm" className="text-xs">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Excel Data Import
            </Button>
          </Link>
        </div>
      </div>

      {/* High-Level Ledger Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-50 border-slate-200">
          <p className="text-xs text-gray-500 font-medium">Total Capital Disbursed</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalDisbursed)}</p>
        </Card>

        <Card className="p-4 bg-emerald-50/50 border-emerald-200">
          <p className="text-xs text-emerald-800 font-medium">Total Fees Recognized</p>
          <p className="text-xl font-bold text-emerald-800 mt-1">{formatCurrency(totalFees)}</p>
        </Card>

        <Card className="p-4 bg-blue-50/50 border-blue-200">
          <p className="text-xs text-blue-800 font-medium">Total Principal & Interest Collected</p>
          <p className="text-xl font-bold text-blue-800 mt-1">{formatCurrency(totalRepaid)}</p>
        </Card>

        <Card className="p-4 bg-purple-50/50 border-purple-200">
          <p className="text-xs text-purple-800 font-medium">Total Outstanding On Books</p>
          <p className="text-xl font-black text-purple-900 mt-1">{formatCurrency(totalOutstanding)}</p>
        </Card>
      </div>

      {/* 1. Client Summary Ledger Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" />
            Client Summary Ledger (SQL Derived View)
          </CardTitle>
          <CardDescription className="text-xs">
            Aggregated dynamically from append-only transaction debits and credits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account #</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Loan #</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Total Repayable</TableHead>
                  <TableHead className="text-right">Total Repaid</TableHead>
                  <TableHead className="text-right">Outstanding Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Disbursed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!ledgerRows || ledgerRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-gray-400 text-xs">
                      No ledger records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerRows.map((row) => (
                    <TableRow key={row.loan_id} className="hover:bg-slate-50/80 text-xs">
                      <TableCell className="font-mono font-bold text-blue-700">
                        {row.account_number}
                      </TableCell>
                      <TableCell className="font-semibold text-gray-900">
                        {row.full_name}
                      </TableCell>
                      <TableCell className="font-mono font-medium text-gray-700">
                        {row.loan_number}
                      </TableCell>
                      <TableCell className="text-right text-gray-800">
                        {formatCurrency(row.principal)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(row.total_repayable)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">
                        {formatCurrency(row.total_repaid)}
                      </TableCell>
                      <TableCell className={`text-right font-black ${
                        row.outstanding_balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {formatCurrency(row.outstanding_balance)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${loanStatusBadgeClass(row.loan_status)}`}>
                          {row.loan_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500 whitespace-nowrap">
                        {formatDate(row.disbursement_date)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. Weekly Recovery Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Weekly Collection & Recovery Performance
          </CardTitle>
          <CardDescription className="text-xs">
            Targeted weekly installment collections vs actual money recovered
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week Commencing</TableHead>
                  <TableHead className="text-center">Loans Due</TableHead>
                  <TableHead className="text-right">Expected Collections</TableHead>
                  <TableHead className="text-right">Actual Collected</TableHead>
                  <TableHead className="text-right">Collection Gap</TableHead>
                  <TableHead className="text-right">Recovery Rate (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!weeklyPerf || weeklyPerf.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-gray-400 text-xs">
                      No weekly performance data recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  weeklyPerf.map((wp: any, i: number) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-semibold text-gray-800">
                        {formatDate(wp.week_start)}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {wp.loans_due}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(wp.expected_amount)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">
                        {formatCurrency(wp.collected_amount)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${wp.gap > 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                        {formatCurrency(wp.gap)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] ${
                          wp.collection_rate_pct >= 90
                            ? 'bg-emerald-100 text-emerald-800'
                            : wp.collection_rate_pct >= 75
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {wp.collection_rate_pct}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
