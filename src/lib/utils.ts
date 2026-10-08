import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number as GHS currency */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'GHS 0.00'
  return `GHS ${Number(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Format a date string (ISO or YYYY-MM-DD) for display */
export function formatDate(date: string | null | undefined, fmt = 'dd MMM yyyy'): string {
  if (!date) return '—'
  try {
    return format(parseISO(date), fmt)
  } catch {
    return date
  }
}

/** Format a date for input[type=date] value */
export function toInputDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

/** Pluralize a word */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/** Replace underscores with spaces and capitalize each word */
export function humanizeStatus(status: string): string {
  if (!status) return ''
  return status
    .split('_')
    .map((w) => capitalize(w))
    .join(' ')
}

/** Compute loan amounts from principal using live settings */
export function computeLoanAmounts({
  principal,
  interestMultiplier = 1.365,
  feePercentage = 0,
  termWeeks = 13,
}: {
  principal: number
  interestMultiplier?: number
  feePercentage?: number
  termWeeks?: number
}) {
  const feeAmount = Math.round(principal * feePercentage * 100) / 100
  const totalRepayable = Math.round(principal * interestMultiplier * 100) / 100
  const weeklyInstallment = Math.round((totalRepayable / termWeeks) * 100) / 100
  const netDisbursement = Math.round((principal - feeAmount) * 100) / 100
  return { feeAmount, totalRepayable, weeklyInstallment, netDisbursement }
}

/** Compute eligibility flag */
export function computeEligibilityFlag(
  weeklyInstallment: number,
  dailyIncome: number,
  threshold = 0.30
): { flag: 'eligible' | 'caution' | 'ineligible'; ratio: number; weeklyIncome: number } {
  const weeklyIncome = dailyIncome * 7
  if (weeklyIncome <= 0) return { flag: 'ineligible', ratio: 0, weeklyIncome: 0 }
  const ratio = weeklyInstallment / weeklyIncome
  let flag: 'eligible' | 'caution' | 'ineligible' = 'ineligible'
  if (ratio <= threshold) flag = 'eligible'
  else if (ratio <= threshold * 1.5) flag = 'caution'
  return { flag, ratio, weeklyIncome }
}

/** Get the badge color class for a loan status */
export function loanStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-blue-100 text-blue-800 border-blue-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    closed: 'bg-slate-100 text-slate-800 border-slate-200',
    defaulted: 'bg-red-200 text-red-900 border-red-300 font-semibold',
    refinanced: 'bg-purple-100 text-purple-800 border-purple-200',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800 border-gray-200'
}

/** Get the badge color class for a client status */
export function clientStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    inactive: 'bg-gray-100 text-gray-800 border-gray-200',
    defaulted: 'bg-rose-100 text-rose-800 border-rose-200 font-semibold',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800'
}

/** Get the badge color class for an installment status */
export function installmentStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    upcoming: 'bg-blue-50 text-blue-700 border-blue-200',
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    partially_paid: 'bg-amber-100 text-amber-800 border-amber-200',
    overdue: 'bg-orange-100 text-orange-800 border-orange-200 font-medium',
    defaulted: 'bg-rose-200 text-rose-900 border-rose-300 font-semibold',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800'
}
