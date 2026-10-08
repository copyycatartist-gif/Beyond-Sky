/**
 * Single source of truth for all loan math: deduction breakdown, net
 * disbursement (with refinancing netting), repayment terms, eligibility and
 * amortization. Every consumer — application form, detail page, printable
 * contract, and the approve/disburse APIs — must use these helpers so the
 * figures never diverge.
 */

export const SECURITY_DEPOSIT_PCT = 0.1
export const PROCESSING_FEE_PCT = 0.01
export const LOAN_RISK_FUND_PCT = 0.01
export const TOTAL_DEDUCTION_PCT =
  SECURITY_DEPOSIT_PCT + PROCESSING_FEE_PCT + LOAN_RISK_FUND_PCT // 0.12
export const NET_DISBURSEMENT_PCT = 1 - TOTAL_DEDUCTION_PCT // 0.88
export const PENAL_RATE_MONTHLY = 5.0 // 5% per month over prevailing rate

/** Flat monthly rates the client may request. Approver may change among these. */
export const MONTHLY_INTEREST_RATES = [0.07, 0.1, 0.15, 0.3] as const
export const MIN_MONTHLY_TERM = 1
export const MAX_MONTHLY_TERM = 6

/** Round to 2 decimal places (GHS pesewas). */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export interface DeductionBreakdown {
  securityDepositPct: number
  securityDepositAmount: number
  processingFeePct: number
  processingFeeAmount: number
  loanRiskFundPct: number
  loanRiskFundAmount: number
  totalDeductions: number
  netDisbursementPct: number
}

/**
 * The 12% upfront deduction schedule (10% security deposit + 1% processing
 * fee + 1% loan risk fund). Percentages can be overridden from settings.
 */
export function computeDeductions(
  principal: number,
  pct: {
    securityDeposit?: number
    processingFee?: number
    loanRiskFund?: number
  } = {}
): DeductionBreakdown {
  const p = Math.max(0, Number(principal) || 0)
  const securityDepositPct = pct.securityDeposit ?? SECURITY_DEPOSIT_PCT
  const processingFeePct = pct.processingFee ?? PROCESSING_FEE_PCT
  const loanRiskFundPct = pct.loanRiskFund ?? LOAN_RISK_FUND_PCT

  const securityDepositAmount = round2(p * securityDepositPct)
  const processingFeeAmount = round2(p * processingFeePct)
  const loanRiskFundAmount = round2(p * loanRiskFundPct)
  const totalDeductions = round2(
    securityDepositAmount + processingFeeAmount + loanRiskFundAmount
  )

  return {
    securityDepositPct,
    securityDepositAmount,
    processingFeePct,
    processingFeeAmount,
    loanRiskFundPct,
    loanRiskFundAmount,
    totalDeductions,
    netDisbursementPct: round2(1 - (securityDepositPct + processingFeePct + loanRiskFundPct)),
  }
}

export interface LoanTerms {
  totalRepayable: number
  weeklyInstallment: number
  termWeeks: number
  interestMultiplier: number
}

/** Total repayable (principal × interest multiplier) and the weekly installment. */
export function computeLoanTerms({
  principal,
  interestMultiplier,
  termWeeks,
}: {
  principal: number
  interestMultiplier: number
  termWeeks: number
}): LoanTerms {
  const p = Math.max(0, Number(principal) || 0)
  const weeks = Math.max(1, Math.round(Number(termWeeks) || 1))
  const totalRepayable = round2(p * (Number(interestMultiplier) || 1))
  const weeklyInstallment = round2(totalRepayable / weeks)
  return { totalRepayable, weeklyInstallment, termWeeks: weeks, interestMultiplier }
}

/**
 * Cash actually handed to the client:
 * principal − total upfront deductions − outstanding balance of a refinanced loan.
 * Never negative.
 */
export function computeNetDisbursement({
  principal,
  totalDeductions,
  refinanceBalance = 0,
}: {
  principal: number
  totalDeductions: number
  refinanceBalance?: number
}): number {
  const net =
    (Number(principal) || 0) -
    (Number(totalDeductions) || 0) -
    Math.max(0, Number(refinanceBalance) || 0)
  return round2(Math.max(0, net))
}

export interface EligibilityResult {
  flag: 'eligible' | 'caution' | 'ineligible'
  ratio: number
  weeklyIncome: number
}

/**
 * Affordability check: weekly installment as a share of weekly income
 * (daily business income × 7). `threshold` defaults to the 30% eligibility ratio.
 */
export function computeEligibility(
  weeklyInstallment: number,
  dailyIncome: number,
  threshold = 0.3
): EligibilityResult {
  const weeklyIncome = round2((Number(dailyIncome) || 0) * 7)
  if (weeklyIncome <= 0) return { flag: 'ineligible', ratio: 0, weeklyIncome: 0 }
  const ratio = (Number(weeklyInstallment) || 0) / weeklyIncome
  let flag: EligibilityResult['flag'] = 'ineligible'
  if (ratio <= threshold) flag = 'eligible'
  else if (ratio <= threshold * 1.5) flag = 'caution'
  return { flag, ratio, weeklyIncome }
}

export interface ScheduleRow {
  installmentNumber: number
  dueDate: string // ISO yyyy-mm-dd
  expectedAmount: number
  cumulativeExpected: number
}

/**
 * Preview amortization schedule: `termWeeks` equal weekly installments starting
 * `firstDueOffsetDays` after `startDate`. Mirrors the Postgres
 * `generate_repayment_schedule` trigger closely enough for on-screen previews.
 */
export function buildAmortizationSchedule({
  weeklyInstallment,
  termWeeks,
  startDate = new Date(),
  firstDueOffsetDays = 7,
  interval = 'week',
}: {
  weeklyInstallment: number
  termWeeks: number
  startDate?: Date | string
  firstDueOffsetDays?: number
  interval?: 'week' | 'month'
}): ScheduleRow[] {
  const weeks = Math.max(1, Math.round(Number(termWeeks) || 1))
  const base = typeof startDate === 'string' ? new Date(startDate) : startDate
  const start = isNaN(base.getTime()) ? new Date() : base
  const rows: ScheduleRow[] = []
  let cumulative = 0
  for (let i = 1; i <= weeks; i++) {
    const due = new Date(start.getTime())
    if (interval === 'month') {
      due.setMonth(due.getMonth() + i)
    } else {
      due.setDate(due.getDate() + firstDueOffsetDays + (i - 1) * 7)
    }
    cumulative = round2(cumulative + (Number(weeklyInstallment) || 0))
    rows.push({
      installmentNumber: i,
      dueDate: due.toISOString().split('T')[0],
      expectedAmount: round2(Number(weeklyInstallment) || 0),
      cumulativeExpected: cumulative,
    })
  }
  return rows
}

export interface LoanCalculation extends DeductionBreakdown, LoanTerms {
  principal: number
  netDisbursement: number
  refinanceBalance: number
  eligibility: EligibilityResult
}

/**
 * One-call authoritative calculation used by the application form, detail page
 * and disbursement preview. Given a principal, settings and optional client
 * income + refinance balance, returns every derived figure consistently.
 */
export function calculateLoan({
  principal,
  interestMultiplier,
  termWeeks,
  dailyIncome = 0,
  eligibilityRatio = 0.3,
  refinanceBalance = 0,
  deductionPct,
}: {
  principal: number
  interestMultiplier: number
  termWeeks: number
  dailyIncome?: number
  eligibilityRatio?: number
  refinanceBalance?: number
  deductionPct?: { securityDeposit?: number; processingFee?: number; loanRiskFund?: number }
}): LoanCalculation {
  const deductions = computeDeductions(principal, deductionPct)
  const terms = computeLoanTerms({ principal, interestMultiplier, termWeeks })
  const netDisbursement = computeNetDisbursement({
    principal,
    totalDeductions: deductions.totalDeductions,
    refinanceBalance,
  })
  const eligibility = computeEligibility(
    terms.weeklyInstallment,
    dailyIncome,
    eligibilityRatio
  )
  return {
    principal: round2(Number(principal) || 0),
    ...deductions,
    ...terms,
    netDisbursement,
    refinanceBalance: round2(Math.max(0, Number(refinanceBalance) || 0)),
    eligibility,
  }
}
