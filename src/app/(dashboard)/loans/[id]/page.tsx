import { createClient } from '@/lib/supabase/server'
import { publicStaffName } from '@/lib/roles'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, Calendar, CreditCard, ShieldCheck, FileText, AlertCircle, AlertTriangle, Check, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency, formatDate, loanStatusBadgeClass, installmentStatusBadgeClass } from '@/lib/utils'
import { computeDeductions, computeNetDisbursement, PENAL_RATE_MONTHLY } from '@/lib/loans/calculations'
import { LoanActions } from '@/components/loans/loan-actions'
import { LoanStatusActions } from '@/components/loans/loan-status-actions'
import { LoanDetailTabs, PrintButton } from '@/components/loans/loan-detail-tabs'

export const dynamic = 'force-dynamic'

export default async function LoanDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  // Wave 1: auth user and loan row are independent — fetch in parallel
  const [authRes, loanRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('loans')
      .select(`
        *,
        clients (*)
      `)
      .eq('id', params.id)
      .single(),
  ])

  const user = authRes.data.user
  const loan = loanRes.data as any

  if (loanRes.error || !loan) {
    notFound()
  }

  // Wave 2: everything that depends only on the user or loan row — fetch in parallel
  const [profileRes, submittedByRes, approvedByRes, prevLoanRes, scheduleRes, transRes, oldSummaryRes, currentSummaryRes] = await Promise.all([
    supabase.from('users').select('role').eq('id', user?.id || '').single(),
    loan.submitted_by
      ? supabase.from('users').select('full_name, role').eq('id', loan.submitted_by).maybeSingle()
      : Promise.resolve({ data: null as any }),
    loan.approved_by
      ? supabase.from('users').select('full_name, role').eq('id', loan.approved_by).maybeSingle()
      : Promise.resolve({ data: null as any }),
    loan.previous_loan_id
      ? supabase.from('loans').select('id, loan_number, principal, status').eq('id', loan.previous_loan_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    supabase
      .from('repayment_schedule')
      .select('*')
      .eq('loan_id', loan.id)
      .order('installment_number', { ascending: true }),
    supabase
      .from('transactions')
      .select('*')
      .eq('loan_id', loan.id)
      .order('created_at', { ascending: true }),
    loan.previous_loan_id
      ? supabase
          .from('client_ledger_summary')
          .select('outstanding_balance')
          .eq('loan_id', loan.previous_loan_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    // Real-time balance source of truth for THIS loan
    supabase
      .from('client_ledger_summary')
      .select('outstanding_balance')
      .eq('loan_id', loan.id)
      .maybeSingle(),
  ])

  const profile = profileRes.data as any
  const userRole: string = profile?.role ?? 'loan_officer'

  const submittedByName = publicStaffName(submittedByRes.data, userRole)
  const approvedByName = publicStaffName(approvedByRes.data, userRole)

  const loanWithRelations = {
    ...loan,
    submitted_by_user: submittedByName ? { full_name: submittedByName } : null,
    approved_by_user: approvedByName ? { full_name: approvedByName } : null,
    previous_loan: prevLoanRes.data,
  }

  const schedule: any[] = scheduleRes.data || []
  const transactions: any[] = transRes.data || []
  const previousLoan: any = prevLoanRes.data

  // Previous loan balance if refinancing
  const oldSummary: any = oldSummaryRes.data
  const oldLoanBalance = oldSummary ? Math.max(0, Number(oldSummary.outstanding_balance)) : 0

  // ── Derived figures ──────────────────────────────────────────────
  const principal = Number(loan.principal) || 0
  const termWeeks = Number(loan.term_weeks) || schedule.length || 1

  const totalPaid = schedule.reduce((acc, row) => acc + Number(row.paid_amount), 0)
  const paidInstallments = schedule.filter((s) => s.status === 'paid').length
  const overdueInstallments = schedule.filter((s) => s.status === 'overdue' || s.status === 'defaulted').length
  const progressPct = termWeeks > 0 ? Math.min(100, Math.round((paidInstallments / termWeeks) * 100)) : 0

  // Ledger summary is the source of truth; schedule math is only a fallback
  const currentSummary: any = currentSummaryRes.data
  const scheduleBalance = Math.max(0, Number(loan.total_repayable) - totalPaid)
  const outstandingBalance = currentSummary
    ? Math.max(0, Number(currentSummary.outstanding_balance))
    : scheduleBalance

  // Deductions: stored columns are authoritative; computeDeductions is the fallback
  const fallbackDed = computeDeductions(principal)
  const storedTotalDeductions = Number(loan.total_deductions) || 0
  const totalDeductions = storedTotalDeductions > 0 ? storedTotalDeductions : fallbackDed.totalDeductions
  const securityDeposit = Number(loan.security_deposit_amount) || fallbackDed.securityDepositAmount
  const processingFee = Number(loan.processing_fee_amount) || fallbackDed.processingFeeAmount
  const loanRiskFund = Number(loan.loan_risk_fund_amount) || fallbackDed.loanRiskFundAmount
  const storedNet = Number(loan.net_disbursement_amount) || 0
  const netDisbursement =
    storedNet > 0
      ? storedNet
      : computeNetDisbursement({ principal, totalDeductions, refinanceBalance: oldLoanBalance })

  // Days overdue / next due (earliest unpaid installment)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const unpaidRows = schedule.filter((s) => s.status !== 'paid')
  const earliestPastDue = unpaidRows.find((s) => new Date(s.due_date) < today)
  const daysOverdue = earliestPastDue
    ? Math.max(1, Math.floor((today.getTime() - new Date(earliestPastDue.due_date).getTime()) / 86400000))
    : 0
  const nextDueRow = unpaidRows.find((s) => new Date(s.due_date) >= today)

  const penalRate = Number(loan.penal_interest_rate) || PENAL_RATE_MONTHLY
  const cycleNumber = Number(loan.cycle_number) || 1

  // ── Status timeline steps ────────────────────────────────────────
  const finalStatuses = ['closed', 'defaulted', 'refinanced']
  const finalLabel = loan.status === 'defaulted' ? 'Defaulted' : loan.status === 'refinanced' ? 'Refinanced' : 'Closed'
  const timelineSteps = [
    {
      label: 'Submitted',
      date: loan.created_at,
      actor: submittedByName ?? 'Loan Officer',
      done: true,
      bad: false,
    },
    {
      label: loan.status === 'rejected' ? 'Rejected' : 'Approved',
      date: loan.approval_date,
      actor: approvedByName ?? 'Manager',
      done: !!loan.approval_date,
      bad: loan.status === 'rejected',
    },
    {
      label: 'Disbursed',
      date: loan.disbursement_date,
      actor: null as string | null,
      done: !!loan.disbursement_date,
      bad: false,
    },
    {
      label: finalLabel,
      date: finalStatuses.includes(loan.status) ? loan.updated_at : null,
      actor: null as string | null,
      done: finalStatuses.includes(loan.status),
      bad: loan.status === 'defaulted',
    },
  ]

  const repaymentHref = `/repayments?clientId=${loan.client_id}&loanId=${loan.id}`

  // ── Tab: Overview ────────────────────────────────────────────────
  const overviewTab = (
    <div className="space-y-6">
      {/* Rejection Alert */}
      {loan.status === 'rejected' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 flex items-start gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Application Rejected by {loanWithRelations.approved_by_user?.full_name ?? 'Manager'}</p>
            <p className="text-xs text-red-800 mt-1 italic">Reason: &quot;{loan.rejection_reason}&quot;</p>
          </div>
        </div>
      )}

      {/* Outstanding balance hero + repayment progress */}
      <Card className="p-5 border-2 border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-2 md:flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Outstanding Balance</p>
            <p className={cn('text-4xl font-black tracking-tight', outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {formatCurrency(outstandingBalance)}
            </p>
            <p className="text-xs text-gray-500">
              <span className="font-bold text-gray-800">{paidInstallments} of {termWeeks} paid</span>
              {overdueInstallments > 0 && <span className="text-rose-600 font-semibold"> • {overdueInstallments} overdue</span>}
              <span> • {formatCurrency(totalPaid)} collected of {formatCurrency(loan.total_repayable)}</span>
            </p>
            <div className="w-full max-w-md h-2.5 rounded-full bg-gray-100 overflow-hidden" aria-label="Repayment progress">
              <div
                className={cn('h-full rounded-full transition-all', overdueInstallments > 0 ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400">{progressPct}% of installments settled</p>
          </div>

          {loan.status === 'active' && (
            <Link href={repaymentHref}>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-sm h-10 px-4 shadow-sm">
                <CreditCard className="h-4 w-4 mr-1.5" />
                Record Repayment
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium">Principal Facility</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(loan.principal)}</p>
          <p className="text-[11px] text-gray-400">Cycle {cycleNumber} • {termWeeks} weeks</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium">Total Repayable</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{formatCurrency(loan.total_repayable)}</p>
          <p className="text-[11px] text-blue-600 font-medium">
            {loan.payment_frequency === 'monthly'
              ? `${Math.round(Number(loan.interest_rate || 0) * 100)}% flat · ${loan.term_months || loan.term_weeks} months`
              : `${loan.interest_multiplier}x flat · ${loan.term_weeks} weeks`}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-gray-500 font-medium">Weekly Installment</p>
          <p className="text-xl font-bold text-blue-700 mt-0.5">
            {formatCurrency(loan.weekly_installment)}
            <span className="text-xs font-medium text-gray-500"> / {loan.payment_frequency === 'monthly' ? 'mo' : 'wk'}</span>
          </p>
          <p className="text-[11px] text-gray-400">{termWeeks} weekly payments</p>
        </Card>
      </div>

      {/* Penalty-interest note when overdue */}
      {overdueInstallments > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-3 text-xs">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Penal interest applicable: {penalRate}% per month</p>
            <p className="mt-1 leading-relaxed">
              {overdueInstallments} installment{overdueInstallments === 1 ? '' : 's'} past due
              {earliestPastDue && <> — earliest due {formatDate(earliestPastDue.due_date)} ({daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue)</>}.
            </p>
          </div>
        </div>
      )}

      {/* Previous loan / cycle navigation */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <span className="text-gray-500">Loan Cycle:</span>
            <span className="font-bold text-gray-900">{cycleNumber}</span>
          </div>
          {previousLoan ? (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Refinanced from:</span>
              <Link href={`/loans/${previousLoan.id}`} className="font-mono font-bold text-blue-700 hover:underline">
                {previousLoan.loan_number}
              </Link>
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', loanStatusBadgeClass(previousLoan.status))}>
                {previousLoan.status}
              </span>
              {oldLoanBalance > 0 && (
                <span className="text-gray-500">balance netted: <span className="font-semibold text-gray-800">{formatCurrency(oldLoanBalance)}</span></span>
              )}
            </div>
          ) : (
            <span className="text-gray-400">First loan in cycle — no previous facility</span>
          )}
        </div>
      </Card>

      {/* Status timeline stepper */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Loan Status Timeline
          </CardTitle>
          <CardDescription className="text-xs">Submitted → approved → disbursed → closed, with dates and actors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start w-full overflow-x-auto pb-2">
            {timelineSteps.map((step, i) => (
              <div key={step.label} className="flex items-start flex-1 min-w-[110px]">
                {i > 0 && (
                  <div className={cn('h-0.5 flex-1 mt-4', step.done ? (step.bad ? 'bg-rose-500' : 'bg-blue-500') : 'bg-gray-200')} />
                )}
                <div className="flex flex-col items-center gap-1 w-24 shrink-0 text-center">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full border-2 flex items-center justify-center',
                      step.done
                        ? step.bad
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    )}
                  >
                    {step.done ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <p className={cn('text-[11px] font-bold', step.done ? (step.bad ? 'text-rose-700' : 'text-gray-900') : 'text-gray-400')}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-gray-400">{step.date ? formatDate(step.date) : '—'}</p>
                  {step.actor && <p className="text-[10px] text-gray-500 font-medium">{step.actor}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // ── Tab: Schedule ────────────────────────────────────────────────
  const scheduleTab = (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            {termWeeks}-Week Repayment Schedule
          </CardTitle>
          <CardDescription className="text-xs">
            Automated FIFO allocation applies repayments to the oldest unpaid installment
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton label="Print Schedule" />
          {loan.status === 'active' && (
            <Link href={repaymentHref}>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                Collect Payment
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-400 text-xs">
                    {loan.status === 'pending' || loan.status === 'approved'
                      ? 'Repayment schedule will be generated upon loan disbursement.'
                      : 'No schedule records found.'}
                  </TableCell>
                </TableRow>
              ) : (
                schedule.map((row) => (
                  <TableRow key={row.id} className="hover:bg-slate-50/80 text-xs">
                    <TableCell className="font-mono font-bold">{row.installment_number}</TableCell>
                    <TableCell className="font-medium text-gray-700">{formatDate(row.due_date)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.expected_amount)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(row.paid_amount)}</TableCell>
                    <TableCell className="text-right font-bold text-rose-600">
                      {formatCurrency(Number(row.expected_amount) - Number(row.paid_amount))}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${installmentStatusBadgeClass(row.status)}`}>
                        {row.status.replace(/_/g, ' ')}
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
  )

  // ── Tab: Transactions ────────────────────────────────────────────
  const transactionsTab = (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-600" />
            Append-Only Ledger Transactions
          </CardTitle>
          <CardDescription className="text-xs">
            Immutable financial record of disbursements, fees, and client repayments
          </CardDescription>
        </div>
        <PrintButton label="Print Ledger" />
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>MoMo Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-gray-400 text-xs">
                    No transactions recorded for this loan yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((t) => (
                  <TableRow key={t.id} className="text-xs hover:bg-slate-50/80">
                    <TableCell>{formatDate(t.transaction_date)}</TableCell>
                    <TableCell className="font-semibold uppercase tracking-wider text-[10px]">
                      <span className={t.type === 'disbursement' ? 'text-blue-700' : 'text-emerald-700'}>
                        {t.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono">
                      {t.direction === 'debit' ? '-' : '+'}{formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell className="capitalize">{t.method}</TableCell>
                    <TableCell className="font-mono text-gray-500">{t.momo_reference || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )

  // ── Tab: Contract (deductions) ───────────────────────────────────
  const contractTab = (
    <div className="max-w-xl space-y-4">
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Contract Deductions (12%)
          </CardTitle>
          <CardDescription className="text-[11px]">
            Derived from the loan&apos;s stored deduction columns (10% security + 1% processing + 1% risk)
            {storedTotalDeductions === 0 && ' — computed fallback applied (stored values missing)'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Principal Facility:</span>
            <span className="font-bold text-gray-900">{formatCurrency(principal)}</span>
          </div>
          <div className="flex justify-between text-amber-800">
            <span>10% Security Deposit:</span>
            <span className="font-semibold">−{formatCurrency(securityDeposit)}</span>
          </div>
          <div className="flex justify-between text-red-700">
            <span>1% Processing Fee:</span>
            <span className="font-semibold">−{formatCurrency(processingFee)}</span>
          </div>
          <div className="flex justify-between text-red-700">
            <span>1% Loan Risk Fund:</span>
            <span className="font-semibold">−{formatCurrency(loanRiskFund)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-800 pt-1 border-t border-blue-200">
            <span>Total Deductions (12%):</span>
            <span>−{formatCurrency(totalDeductions)}</span>
          </div>
          {oldLoanBalance > 0 && (
            <div className="flex justify-between text-purple-800">
              <span>Refinance Netting (previous loan balance):</span>
              <span className="font-semibold">−{formatCurrency(oldLoanBalance)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t border-blue-200 font-bold text-emerald-800">
            <span>Net Cash Disbursed{oldLoanBalance === 0 ? ' (88%)' : ''}:</span>
            <span>{formatCurrency(netDisbursement)}</span>
          </div>
          {loan.amount_disbursed_to_client != null && Number(loan.amount_disbursed_to_client) > 0 && (
            <p className="text-[10px] text-gray-500 pt-1">
              Amount actually disbursed to client on record: {formatCurrency(loan.amount_disbursed_to_client)}
              {loan.disbursement_date ? ` (${formatDate(loan.disbursement_date)})` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Link href={`/loans/${loan.id}/contract`}>
        <Button variant="outline" size="sm" className="text-xs font-semibold text-gray-700 hover:text-blue-600 gap-1.5 border-gray-300 shadow-sm">
          <FileText className="h-3.5 w-3.5 text-blue-600" />
          Print Full Contract Form
        </Button>
      </Link>
    </div>
  )

  // ── Tab: KYC ─────────────────────────────────────────────────────
  const kycTab = (
    <Card className="max-w-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <User className="h-4 w-4 text-blue-600" />
          Applicant Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <p className="text-gray-400">Full Name</p>
          <Link href={`/clients/${loan.clients?.id}`} className="font-bold text-blue-700 hover:underline">
            {loan.clients?.full_name}
          </Link>
        </div>
        <div>
          <p className="text-gray-400">Account #</p>
          <p className="font-mono font-bold text-gray-900">{loan.clients?.account_number}</p>
        </div>
        <div>
          <p className="text-gray-400">Phone Number</p>
          <p className="font-mono text-gray-800">{loan.clients?.phone_number}</p>
        </div>
        <div>
          <p className="text-gray-400">Business &amp; Location</p>
          <p className="text-gray-800 font-medium">{loan.clients?.business_type} • {loan.clients?.market_location}</p>
        </div>
        <div>
          <p className="text-gray-400">Guarantor</p>
          <p className="text-gray-800 font-medium">{loan.clients?.guarantor_name} ({loan.clients?.guarantor_phone})</p>
        </div>
      </CardContent>
    </Card>
  )

  // ── Tab: Audit ───────────────────────────────────────────────────
  const auditTab = (
    <Card className="max-w-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-gray-400" />
          Audit Trail &amp; Approvals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <p className="text-gray-400">Submitted By</p>
          <p className="font-medium text-gray-800 mt-0.5">{loanWithRelations.submitted_by_user?.full_name ?? 'Loan Officer'}</p>
          <p className="text-[10px] text-gray-400">{formatDate(loan.created_at)}</p>
        </div>

        {loan.approved_by && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-gray-400">Approved By</p>
            <p className="font-medium text-gray-800 mt-0.5">{loanWithRelations.approved_by_user?.full_name ?? 'Manager'}</p>
            <p className="text-[10px] text-gray-400">{formatDate(loan.approval_date)}</p>
          </div>
        )}

        {loan.disbursement_date && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-gray-400">Disbursed Date</p>
            <p className="font-medium text-gray-800 mt-0.5">{formatDate(loan.disbursement_date)}</p>
          </div>
        )}

        {loan.status === 'rejected' && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-gray-400">Rejected</p>
            <p className="font-medium text-rose-700 mt-0.5">Reason: &quot;{loan.rejection_reason}&quot;</p>
          </div>
        )}

        {finalStatuses.includes(loan.status) && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-gray-400">{finalLabel}</p>
            <p className="font-medium text-gray-800 mt-0.5">{formatDate(loan.updated_at)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/loans">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-mono">{loan.loan_number}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${loanStatusBadgeClass(loan.status)}`}>
                {loan.status}
              </span>
              {daysOverdue > 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  <AlertCircle className="h-3 w-3" />
                  {daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue
                </span>
              ) : nextDueRow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  <Calendar className="h-3 w-3" />
                  Next due {formatDate(nextDueRow.due_date)}
                </span>
              ) : null}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Cycle {cycleNumber}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Client:{' '}
              <Link href={`/clients/${loan.clients?.id}`} className="font-semibold text-blue-600 hover:underline">
                {loan.clients?.full_name} ({loan.clients?.account_number})
              </Link>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/loans/${loan.id}/contract`}>
            <Button variant="outline" size="sm" className="h-9 text-xs font-semibold text-gray-700 hover:text-blue-600 gap-1.5 border-gray-300 shadow-sm">
              <FileText className="h-3.5 w-3.5 text-blue-600" />
              Print Contract Form
            </Button>
          </Link>
          <LoanStatusActions
            loanId={loan.id}
            loanNumber={loan.loan_number}
            status={loan.status}
            userRole={userRole}
          />
          <LoanActions
            loan={loanWithRelations}
            userRole={userRole}
            oldLoanBalance={oldLoanBalance}
          />
        </div>
      </div>

      {/* Tabs: Overview | Schedule | Transactions | Contract | KYC | Audit */}
      <LoanDetailTabs
        overview={overviewTab}
        schedule={scheduleTab}
        transactions={transactionsTab}
        contract={contractTab}
        kyc={kycTab}
        audit={auditTab}
        scheduleCount={schedule.length}
        transactionCount={transactions.length}
      />
    </div>
  )
}
