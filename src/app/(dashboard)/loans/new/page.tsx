import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoanApplicationForm } from '@/components/loans/loan-application-form'

export const dynamic = 'force-dynamic'

export default async function NewLoanPage() {
  const supabase = await createClient()

  // Fetch settings, clients, and ledger summaries concurrently
  const [{ data: settingsRows }, { data: clients }, { data: summaries }] = await Promise.all([
    supabase.from('settings').select('key, value'),
    supabase
      .from('clients')
      .select(`
        id, account_number, full_name, phone_number, daily_business_income, monthly_income, business_type, market_location, branch, area,
        guarantor_name, guarantor_phone, guarantor_relationship, guarantor_national_id, guarantor_occupation, guarantor_residential_address,
        loans (id, loan_number, principal, total_repayable, status)
      `)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
    supabase.from('client_ledger_summary').select('loan_id, outstanding_balance'),
  ])

  const settingsMap: Record<string, string> = {}
  ;(settingsRows || []).forEach((r) => {
    settingsMap[r.key] = r.value
  })

  const settings = {
    interestMultiplier: parseFloat(settingsMap['interest_multiplier'] || '1.365'),
    feePercentage: parseFloat(settingsMap['processing_fee_percentage'] || settingsMap['fee_percentage'] || '0.05'),
    termWeeks: parseInt(settingsMap['term_weeks'] || '13'),
    minLoan: parseFloat(settingsMap['min_loan_amount'] || '1000'),
    maxLoan: parseFloat(settingsMap['max_loan_amount'] || '5000'),
    eligibilityRatio: parseFloat(settingsMap['eligibility_income_ratio'] || '0.30'),
  }

  const balanceMap: Record<string, number> = {}
  ;(summaries || []).forEach((s) => {
    balanceMap[s.loan_id] = s.outstanding_balance
  })

  const clientOptions = (clients || []).map((c: any) => {
    const activeLoan = (c.loans || []).find((l: any) => l.status === 'active')
    return {
      id: c.id,
      account_number: c.account_number,
      full_name: c.full_name,
      phone_number: c.phone_number,
      daily_business_income: c.daily_business_income,
      monthly_income: c.monthly_income,
      business_type: c.business_type,
      market_location: c.market_location,
      branch: c.branch,
      area: c.area,
      guarantor_name: c.guarantor_name,
      guarantor_phone: c.guarantor_phone,
      guarantor_relationship: c.guarantor_relationship,
      guarantor_national_id: c.guarantor_national_id,
      guarantor_occupation: c.guarantor_occupation,
      guarantor_residential_address: c.guarantor_residential_address,
      totalLoans: (c.loans || []).length,
      activeLoan: activeLoan
        ? {
            id: activeLoan.id,
            loan_number: activeLoan.loan_number,
            principal: activeLoan.principal,
            total_repayable: activeLoan.total_repayable,
            outstanding_balance: balanceMap[activeLoan.id] ?? activeLoan.total_repayable,
          }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/loans">
          <Button variant="outline" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New Loan Application</h1>
          <p className="text-gray-500 text-sm">
            Weekly loans use {settings.interestMultiplier}x over {settings.termWeeks} Sundays.
            A {Math.round(settings.feePercentage * 10000) / 100}% processing fee is taken from the principal.
            Limits: {settings.minLoan.toLocaleString()}–{settings.maxLoan.toLocaleString()} GH¢.
          </p>
        </div>
      </div>

      <LoanApplicationForm clients={clientOptions} settings={settings} />
    </div>
  )
}
