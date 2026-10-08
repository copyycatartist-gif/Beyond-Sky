'use client'

import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import {
  round2,
  PENAL_RATE_MONTHLY,
} from '@/lib/loans/calculations'

type Nullable<T> = T | null | undefined

/** Loan columns actually consumed by the contract document. */
export interface ContractLoan {
  id: string
  loan_number: Nullable<string>
  principal: number | string
  term_weeks: Nullable<number | string>
  cycle_number: Nullable<number | string>
  previous_loan_amount: Nullable<number | string>
  monthly_interest_rate: Nullable<number | string>
  penal_interest_rate: Nullable<number | string>
  weekly_installment: Nullable<number | string>
  total_repayable: Nullable<number | string>
  security_deposit_pct: Nullable<number | string>
  security_deposit_amount: Nullable<number | string>
  processing_fee_pct: Nullable<number | string>
  processing_fee_amount: Nullable<number | string>
  loan_risk_fund_pct: Nullable<number | string>
  loan_risk_fund_amount: Nullable<number | string>
  total_deductions: Nullable<number | string>
  net_disbursement_amount: Nullable<number | string>
  agreement_town: Nullable<string>
  agreement_district: Nullable<string>
  agreement_region: Nullable<string>
  disbursement_date: Nullable<string>
  approval_date: Nullable<string>
  created_at: Nullable<string>
}

/** Client columns actually consumed by the contract document. */
export interface ContractClient {
  id: string
  full_name: string
  account_number: Nullable<string>
  phone_number: Nullable<string>
  branch: Nullable<string>
  area: Nullable<string>
  group_name: Nullable<string>
  business_type: Nullable<string>
  market_location: Nullable<string>
  spouse_or_father_name: Nullable<string>
  age: Nullable<number>
  date_of_birth: Nullable<string>
  monthly_income: Nullable<number | string>
  daily_business_income: Nullable<number | string>
  residential_address: Nullable<string>
  permanent_address: Nullable<string>
  business_address: Nullable<string>
  marital_status: Nullable<string>
  religion: Nullable<string>
  place_of_worship: Nullable<string>
  religious_leader_name: Nullable<string>
  religious_leader_phone: Nullable<string>
  guarantor_name: Nullable<string>
  guarantor_phone: Nullable<string>
  guarantor_relationship: Nullable<string>
  guarantor_national_id: Nullable<string>
  guarantor_business: Nullable<string>
  guarantor_gender: Nullable<string>
  guarantor_account_number: Nullable<string>
  guarantor_occupation: Nullable<string>
  guarantor_employer: Nullable<string>
  guarantor_dob: Nullable<string>
  guarantor_residential_address: Nullable<string>
  guarantor_religion: Nullable<string>
  guarantor_place_of_worship: Nullable<string>
}

export interface LoanContractProps {
  loan: ContractLoan
  client: ContractClient
  /** settings key -> value map (default_branch, deduction percentages, penal rate, ...) */
  settings: Record<string, string>
}

const EMPTY = '—'

/** Coerce a possibly-null numeric column to a number, with fallback. */
function num(value: Nullable<number | string>, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return isNaN(n) ? fallback : n
}

/** Text value or a neutral placeholder when truly absent. */
function txt(value: Nullable<string>): string {
  return value && String(value).trim() !== '' ? String(value) : EMPTY
}

export function PrintableLoanContract({ loan, client, settings }: LoanContractProps) {
  const handlePrint = () => {
    window.print()
  }

  // ---- Settings-driven rates (no hardcoded business values) ----
  const settingNum = (key: string, fallback: number): number => {
    const v = parseFloat(settings[key])
    return isNaN(v) ? fallback : v
  }
  const principal = num(loan.principal, 0)
  const processingFee = num(loan.processing_fee_amount, num(loan.total_deductions, 0))
  const processingFeePct = principal > 0 ? round2((processingFee / principal) * 100) : 0
  const cashToClient = num(loan.net_disbursement_amount, round2(principal - processingFee))
  const branch = txt(client.branch || settings['default_branch'] || null)

  // ---- Rates / terms ----
  const monthlyRate = loan.monthly_interest_rate != null && loan.monthly_interest_rate !== ''
    ? Number(loan.monthly_interest_rate)
    : null
  const penalRatePct = loan.penal_interest_rate != null && loan.penal_interest_rate !== ''
    ? Number(loan.penal_interest_rate)
    : settingNum('penal_rate_monthly', PENAL_RATE_MONTHLY / 100) * 100
  const termWeeks = loan.term_weeks != null && loan.term_weeks !== ''
    ? Number(loan.term_weeks)
    : settingNum('term_weeks', 0) || null

  // ---- Signing / contract date: disbursement -> approval -> created -> today ----
  const rawDate = loan.disbursement_date || loan.approval_date || loan.created_at || null
  const parsed = rawDate ? new Date(rawDate) : new Date()
  const signingDate = isNaN(parsed.getTime()) ? new Date() : parsed
  const day = signingDate.getDate()
  const month = signingDate.toLocaleString('default', { month: 'long' })
  const year = signingDate.getFullYear()

  return (
    <div className="space-y-6">
      {/* Screen action header (hidden during print) */}
      <div className="print:hidden flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href={`/loans/${loan.id}`}>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Loan Details
            </Button>
          </Link>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Official Loan Agreement & Contract</h2>
            <p className="text-xs text-gray-500">
              Contract Ref: <span className="font-mono font-bold">{txt(loan.loan_number)}</span> — ready for physical signature and filing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            variant="outline"
            className="border-blue-600 text-blue-700 hover:bg-blue-50 text-xs font-semibold gap-2"
          >
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold gap-2">
            <Printer className="h-4 w-4" /> Print Agreement (Ctrl+P)
          </Button>
        </div>
      </div>

      {/* Printable Document Container (A4 styling) */}
      <div className="bg-white text-black p-8 sm:p-12 max-w-4xl mx-auto shadow-lg print:shadow-none print:p-0 print:max-w-none text-[13px] leading-relaxed font-serif border border-gray-200 print:border-none">

        {/* ============================================================ */}
        {/* PAGE 1 OF 2 */}
        {/* ============================================================ */}
        <div className="space-y-6 min-h-[950px] flex flex-col justify-between pb-12 print:pb-0 print:break-after-page">
          <div>
            {/* Header / Brand */}
            <div className="flex justify-between items-start border-b-2 border-black pb-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider font-sans text-blue-900 print:text-black leading-tight">
                  BEYOND SKY MICRO-CREDIT ENTERPRISE
                </h1>
                <p className="text-xs font-sans font-semibold tracking-wide text-gray-700 uppercase">
                  Micro-Credit Loan Application & Facility Agreement
                </p>
              </div>
              <div className="text-right text-xs font-mono font-bold">
                <p>Page 1 of 2</p>
                <p className="text-blue-800 print:text-black mt-0.5">Contract Ref: {txt(loan.loan_number)}</p>
              </div>
            </div>

            {/* Section: Loan Application Meta */}
            <div className="mt-4 border border-black p-3 space-y-2 bg-gray-50/50 print:bg-transparent break-inside-avoid">
              <h2 className="font-bold text-center uppercase tracking-wider text-sm border-b border-black pb-1 mb-2 font-sans">
                LOAN APPLICANT
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="font-sans font-bold text-xs">Branch:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[120px] font-mono">{branch}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Area:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[100px] font-mono">{txt(client.area)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Cycle:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[60px] font-mono font-bold">Cycle {loan.cycle_number != null ? Number(loan.cycle_number) : 1}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Amt. Request:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[100px] font-mono font-bold">GH¢ {principal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Tenor:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[80px] font-mono">{termWeeks != null ? `${termWeeks} Weeks` : EMPTY}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Previous Loan Amt.:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[70px] font-mono">GH¢ {num(loan.previous_loan_amount, 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Business:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[180px] font-mono">{txt(client.business_type)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Business Location:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[180px] font-mono">{txt(client.market_location)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Group Name:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[120px] font-mono">{txt(client.group_name)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Meeting Day:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[70px] font-mono">Weekly</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Place:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[100px] font-mono">{txt(client.market_location)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-300">
                <div>
                  <span className="font-sans font-bold text-xs">Applicant's A/C#:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px] font-mono font-bold text-blue-900 print:text-black">{txt(client.account_number)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Tel #:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px] font-mono">{txt(client.phone_number)}</span>
                </div>
              </div>
            </div>

            {/* Section: Applicant Personal Information */}
            <div className="mt-4 border border-black p-3 space-y-2 break-inside-avoid">
              <h3 className="font-bold text-center uppercase tracking-wider text-xs border-b border-black pb-1 mb-2 font-sans bg-gray-100 print:bg-transparent">
                Applicant's Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-sans font-bold text-xs">Name:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[200px] font-bold uppercase">{txt(client.full_name)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Husband/Wife/Father's Name:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[160px]">{txt(client.spouse_or_father_name)}</span>
                </div>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Age / DOB:</span>{' '}
                <span className="border-b border-dotted border-black inline-block min-w-[120px]">{client.age != null ? `${client.age} yrs` : (client.date_of_birth ? formatDate(client.date_of_birth) : EMPTY)}</span>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Present Address (Hse. # & Landmark):</span>{' '}
                <span className="border-b border-dotted border-black inline-block w-full">{txt(client.residential_address || client.market_location)}</span>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Permanent Address (Home Town / Region):</span>{' '}
                <span className="border-b border-dotted border-black inline-block w-full">{txt(client.permanent_address)}</span>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Business Address:</span>{' '}
                <span className="border-b border-dotted border-black inline-block w-full">{txt(client.business_address || client.market_location)}</span>
              </div>

              <div className="pt-1 flex items-center gap-4 text-xs">
                <span className="font-sans font-bold">Marital Status:</span>
                {['married', 'unmarried', 'abandoned', 'divorced', 'widow'].map((status) => (
                  <label key={status} className="flex items-center gap-1 capitalize">
                    <input
                      type="checkbox"
                      checked={client.marital_status === status}
                      readOnly
                      className="h-3.5 w-3.5"
                    />
                    {status === 'unmarried' ? 'Unmarried (Single)' : status}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200">
                <div>
                  <span className="font-sans font-bold text-xs">Religion:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px]">{txt(client.religion)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Place of Worship:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px]">{txt(client.place_of_worship)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Name of Pastor/Imam:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px]">{txt(client.religious_leader_name)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Phone #:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px] font-mono">{txt(client.religious_leader_phone)}</span>
                </div>
              </div>
            </div>

            {/* Section: Contract Terms (Page 1 part) */}
            <div className="mt-4 space-y-2 text-justify break-inside-avoid">
              <h3 className="font-bold text-center uppercase tracking-wider text-xs border-b border-black pb-1 font-sans">
                CONTRACT TERMS & CREDIT AGREEMENT
              </h3>
              <p className="pt-1">
                This agreement made on this <strong>{day}</strong> Day of <strong>{month}</strong>, <strong>{year}</strong> between me{' '}
                <strong className="underline uppercase">{txt(client.full_name)}</strong> of{' '}
                <strong>{txt(loan.agreement_town)}</strong> town in the{' '}
                <strong>{txt(loan.agreement_district)}</strong> District of the{' '}
                <strong>{txt(loan.agreement_region)}</strong> Region of the Republic of Ghana on one hand and{' '}
                <strong>Beyond Sky Micro-Credit Enterprise</strong> on the other hand as follows:
              </p>
              <p>
                Beyond Sky Micro-Credit Enterprise has advanced to me a credit facility of{' '}
                <strong>GH¢ {principal.toFixed(2)}</strong> for business purposes at an interest rate of{' '}
                <strong>{monthlyRate != null ? `${monthlyRate}%` : EMPTY}</strong> per month repayable through{' '}
                <strong>{termWeeks != null ? termWeeks : EMPTY}</strong> equal installments of{' '}
                <strong>GH¢ {num(loan.weekly_installment, 0).toFixed(2)}</strong> on a weekly basis
                {loan.total_repayable != null && loan.total_repayable !== '' ? (
                  <> (total repayable: <strong>GH¢ {num(loan.total_repayable, 0).toFixed(2)}</strong>)</>
                ) : null}. As long as the facility remains outstanding, ownership and rights on my assets belong to Beyond Sky Micro-Credit Enterprise and I will not transfer these assets whether in part or whole to anybody under any circumstance.
              </p>
            </div>
          </div>

          <div className="text-center text-xs text-gray-500 print:text-black border-t border-gray-300 pt-2 font-mono">
            Beyond Sky Micro-Credit Enterprise LMS • Account: {txt(client.account_number)} • Contract Ref: {txt(loan.loan_number)} • Page 1 of 2
          </div>
        </div>

        {/* ============================================================ */}
        {/* PAGE 2 OF 2 */}
        {/* ============================================================ */}
        <div className="space-y-6 min-h-[950px] flex flex-col justify-between pt-8 print:pt-4">
          <div>
            {/* Header Page 2 */}
            <div className="flex justify-between items-start border-b-2 border-black pb-2">
              <h2 className="text-lg font-black uppercase tracking-wider font-sans text-blue-900 print:text-black">
                BEYOND SKY MICRO-CREDIT ENTERPRISE
              </h2>
              <div className="text-right text-xs font-mono font-bold">
                <p>Page 2 of 2</p>
                <p className="text-blue-800 print:text-black">Facility Agreement • Ref: {txt(loan.loan_number)}</p>
              </div>
            </div>

            {/* Contract Terms Continuation */}
            <div className="mt-4 space-y-2.5 text-justify text-[12.5px] leading-relaxed">
              <p className="break-inside-avoid">
                A processing fee of <strong>{processingFeePct}% (GH¢ {processingFee.toFixed(2)})</strong> is deducted from the principal.
                I receive <strong>GH¢ {cashToClient.toFixed(2)}</strong>.
                Repayments are due on Sunday, beginning the Sunday after the loan is disbursed.
              </p>
              <p className="break-inside-avoid">
                Again, I agree to the <strong>group guarantee principle</strong> which has been explained to me by Beyond Sky Micro-Credit Enterprise. I also do promise to oblige by the rules and regulations in connection with the interest in full under all circumstances even in the event of loss or damage of loan amount or assets respectively.
              </p>
              <p className="break-inside-avoid">
                In case of default, Beyond Sky Micro-Credit Enterprise will charge a <strong>penal rate of {round2(penalRatePct)}% per month</strong> as default charge over the prevailing interest rate. Beyond Sky Micro-Credit Enterprise is again allowed to take any necessary measures, or legal actions to ensure repayment of loan with the interest from my permanent and temporary assets.
              </p>
              <p className="break-inside-avoid">
                No objection will be accepted in this regard from my successors or me, and even if such objection is raised, will have no validity in the court of law.
              </p>
              <p className="break-inside-avoid">
                I hereby state that: No legal proceedings are pending or, to the best of my knowledge and belief, threatened before any court or government authority which might materially and adversely affect my financial condition, business operations, restrain or enjoin or have the effect of restraining or enjoining the performance or observance of these terms and conditions or in any other manner question the validity, binding effect or enforceability of this agreement.
              </p>
              <p className="break-inside-avoid">
                I have obtained independent legal advice on the terms made herein and willingly accept and sign this agreement.
              </p>
            </div>

            {/* Client Signature Area */}
            <div className="grid grid-cols-3 gap-6 pt-6 pb-4 border-b border-black break-inside-avoid">
              <div className="space-y-4">
                <div className="border-b border-black h-8"></div>
                <p className="font-sans font-bold text-xs text-center uppercase">Client's Signature</p>
              </div>
              <div className="space-y-4">
                <div className="border-b border-black h-8 flex items-end justify-center font-mono text-xs">{day} {month} {year}</div>
                <p className="font-sans font-bold text-xs text-center uppercase">Date</p>
              </div>
              <div className="space-y-4">
                <div className="border-b border-black h-8"></div>
                <p className="font-sans font-bold text-xs text-center uppercase">Branch / Officer Signature</p>
              </div>
            </div>

            {/* Witness */}
            <div className="mt-5 grid grid-cols-3 gap-6 pb-4 border-b border-black break-inside-avoid">
              <div className="space-y-4">
                <div className="border-b border-black h-8"></div>
                <p className="font-sans font-bold text-xs text-center uppercase">Witness Name</p>
              </div>
              <div className="space-y-4">
                <div className="border-b border-black h-8"></div>
                <p className="font-sans font-bold text-xs text-center uppercase">Witness Signature</p>
              </div>
              <div className="space-y-4">
                <div className="border-b border-black h-8"></div>
                <p className="font-sans font-bold text-xs text-center uppercase">Witness Date / Tel #</p>
              </div>
            </div>

            {/* Section: Guarantor's Personal Information */}
            <div className="mt-5 border border-black p-3 space-y-2 bg-gray-50/50 print:bg-transparent break-inside-avoid">
              <h3 className="font-bold text-center uppercase tracking-wider text-xs border-b border-black pb-1 mb-2 font-sans">
                GUARANTOR'S PERSONAL INFORMATION
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-sans font-bold text-xs">Name of Guarantor:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[200px] font-bold uppercase">{txt(client.guarantor_name)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Gender:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[80px] capitalize">{txt(client.guarantor_gender)}</span>
                </div>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Tel #:</span>{' '}
                <span className="border-b border-dotted border-black inline-block min-w-[150px] font-mono font-bold">{txt(client.guarantor_phone)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Occupation:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[120px]">{txt(client.guarantor_occupation || client.guarantor_business)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Employer:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[120px]">{txt(client.guarantor_employer)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Date of Birth:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[80px]">{client.guarantor_dob ? formatDate(client.guarantor_dob) : EMPTY}</span>
                </div>
              </div>

              <div className="pt-1">
                <span className="font-sans font-bold text-xs">Residence Address and Description:</span>{' '}
                <span className="border-b border-dotted border-black inline-block w-full">{txt(client.guarantor_residential_address)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-sans font-bold text-xs">Religion:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px]">{txt(client.guarantor_religion)}</span>
                </div>
                <div>
                  <span className="font-sans font-bold text-xs">Place of Worship:</span>{' '}
                  <span className="border-b border-dotted border-black inline-block min-w-[150px]">{txt(client.guarantor_place_of_worship)}</span>
                </div>
              </div>

              {/* Guarantor acknowledgment */}
              <label className="flex items-start gap-2 text-[11px] leading-snug pt-2 mt-1 border-t border-gray-300 break-inside-avoid">
                <input type="checkbox" readOnly className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  I, the guarantor named above, acknowledge that I have read and understood this agreement, and I accept
                  joint and several liability for the full repayment of the facility of <strong>GH¢ {principal.toFixed(2)}</strong>{' '}
                  (Contract Ref: {txt(loan.loan_number)}) together with any penal interest accruing thereon.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-6 pt-4 mt-2 border-t border-gray-300 break-inside-avoid">
                <div className="space-y-4">
                  <div className="border-b border-black h-8"></div>
                  <p className="font-sans font-bold text-xs text-center uppercase">Guarantor's Signature</p>
                </div>
                <div className="space-y-4">
                  <div className="border-b border-black h-8 flex items-end justify-center font-mono text-xs">{day} {month} {year}</div>
                  <p className="font-sans font-bold text-xs text-center uppercase">Date</p>
                </div>
              </div>
            </div>

            {/* Machine-readable contract reference & verification */}
            <div className="mt-4 flex items-center gap-3 border-2 border-black p-2 break-inside-avoid">
              <div className="border border-black px-3 py-1.5 font-mono text-sm font-black tracking-[0.2em] whitespace-nowrap">
                {txt(loan.loan_number)}
              </div>
              <p className="text-[10px] font-sans leading-snug">
                Contract Reference (machine-readable). Verify the authenticity of this agreement by quoting the
                reference above at any Beyond Sky Micro-Credit Enterprise branch or office.
              </p>
            </div>
          </div>

          <div className="text-center text-xs text-gray-500 print:text-black border-t border-gray-300 pt-2 font-mono">
            Beyond Sky Micro-Credit Enterprise • Official Contract Archive Copy • Page 2 of 2
          </div>
        </div>
      </div>
    </div>
  )
}
