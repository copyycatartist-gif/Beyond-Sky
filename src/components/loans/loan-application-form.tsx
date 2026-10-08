'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import {
  calculateLoan,
  computeLoanTerms,
  buildAmortizationSchedule,
  MONTHLY_INTEREST_RATES,
} from '@/lib/loans/calculations'
import {
  Loader2,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  Shield,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Banknote,
  UserCheck,
  ClipboardList,
} from 'lucide-react'
import Link from 'next/link'

interface ClientOption {
  id: string
  account_number: string
  full_name: string
  phone_number: string
  daily_business_income: number
  monthly_income?: number | null
  business_type: string
  market_location: string
  branch?: string | null
  area?: string | null
  // Guarantor profile (lives on the clients table, read-only here)
  guarantor_name?: string | null
  guarantor_phone?: string | null
  guarantor_relationship?: string | null
  guarantor_national_id?: string | null
  guarantor_occupation?: string | null
  guarantor_residential_address?: string | null
  // Loan history (all prior loans, any status)
  totalLoans?: number
  activeLoan?: {
    id: string
    loan_number: string
    principal: number
    total_repayable: number
    outstanding_balance: number
  } | null
}

const DRAFT_POINTER_KEY = 'beyond-sky-loan-draft:last-client'
const draftKey = (clientId: string) => `beyond-sky-loan-draft:${clientId}`

const STEPS = [
  { n: 1, label: 'Client', icon: Users },
  { n: 2, label: 'Amount & Terms', icon: Banknote },
  { n: 3, label: 'Terms', icon: Calculator },
  { n: 4, label: 'Guarantor', icon: UserCheck },
  { n: 5, label: 'Review & Submit', icon: ClipboardList },
]

const MIN_TERM_WEEKS = 4
const MAX_TERM_WEEKS = 52

export function LoanApplicationForm({
  clients,
  settings,
}: {
  clients: ClientOption[]
  settings: {
    interestMultiplier: number
    feePercentage: number
    termWeeks: number
    minLoan: number
    maxLoan: number
    eligibilityRatio: number
  }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialClientId = searchParams.get('clientId') || ''

  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedClientId, setSelectedClientId] = useState(initialClientId)
  const [principal, setPrincipal] = useState<number>(2000)
  const [termWeeks, setTermWeeks] = useState<number>(settings.termWeeks || 13)
  const [paymentFrequency, setPaymentFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [termMonths, setTermMonths] = useState(3)
  const [interestRate, setInterestRate] = useState<number>(0.1)
  const isMonthly = paymentFrequency === 'monthly'
  const activeMultiplier = isMonthly ? 1 + interestRate : settings.interestMultiplier
  const activeTerm = isMonthly ? termMonths : termWeeks
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draftRestored, setDraftRestored] = useState(false)

  // Client autocomplete
  const [clientSearch, setClientSearch] = useState('')
  const [showClientList, setShowClientList] = useState(false)
  const clientBoxRef = useRef<HTMLDivElement>(null)

  // Contract jurisdiction
  const [agreementTown, setAgreementTown] = useState('Accra')
  const [agreementDistrict, setAgreementDistrict] = useState('Accra Metropolitan')
  const [agreementRegion, setAgreementRegion] = useState('Greater Accra')

  // Guarantor note (free text, local to the application) + manager override
  const [guarantorNote, setGuarantorNote] = useState('')
  const selectedClient = clients.find((c) => c.id === selectedClientId)
  const activeExistingLoan = selectedClient?.activeLoan ?? null
  const isRefinancing = Boolean(activeExistingLoan)
  const existingBalance = activeExistingLoan?.outstanding_balance || 0
  const cycleNumber = isRefinancing ? 2 : 1
  const previousLoanAmt = isRefinancing ? activeExistingLoan?.principal || 0 : 0

  // ---- Draft autosave / restore -------------------------------------------
  useEffect(() => {
    if (draftRestored) return
    try {
      const candidateId =
        initialClientId || window.localStorage.getItem(DRAFT_POINTER_KEY) || ''
      if (candidateId) {
        const rawDraft = window.localStorage.getItem(draftKey(candidateId))
        if (rawDraft) {
          const d = JSON.parse(rawDraft)
          if (clients.some((c) => c.id === candidateId)) {
            setSelectedClientId(candidateId)
          }
          if (typeof d.principal === 'number' && Number.isFinite(d.principal)) {
            setPrincipal(d.principal)
          }
          if (typeof d.termWeeks === 'number' && d.termWeeks >= MIN_TERM_WEEKS && d.termWeeks <= MAX_TERM_WEEKS) {
            setTermWeeks(d.termWeeks)
          }
          if (typeof d.step === 'number' && d.step >= 1 && d.step <= 5) {
            setStep(d.step)
          }
          if (typeof d.agreementTown === 'string') setAgreementTown(d.agreementTown)
          if (typeof d.agreementDistrict === 'string') setAgreementDistrict(d.agreementDistrict)
          if (typeof d.agreementRegion === 'string') setAgreementRegion(d.agreementRegion)
          if (typeof d.guarantorNote === 'string') setGuarantorNote(d.guarantorNote)
        }
      }
    } catch {
      // Corrupt draft — ignore and start fresh
    }
    setDraftRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!draftRestored || !selectedClientId) return
    try {
      window.localStorage.setItem(DRAFT_POINTER_KEY, selectedClientId)
      window.localStorage.setItem(
        draftKey(selectedClientId),
        JSON.stringify({
          principal,
          termWeeks,
          step,
          agreementTown,
          agreementDistrict,
          agreementRegion,
          guarantorNote,
          savedAt: new Date().toISOString(),
        })
      )
    } catch {
      // Storage full / unavailable — non-fatal
    }
  }, [draftRestored, selectedClientId, principal, termWeeks, step, agreementTown, agreementDistrict, agreementRegion, guarantorNote])

  // Close the client dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setShowClientList(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // ---- Loan math (single source of truth) ----------------------------------

  const terms = useMemo(
    () =>
      computeLoanTerms({
        principal: principal || 0,
        interestMultiplier: activeMultiplier,
        termWeeks: activeTerm,
      }),
    [principal, activeMultiplier, activeTerm]
  )

  const calc = useMemo(
    () =>
      calculateLoan({
        principal: principal || 0,
        interestMultiplier: activeMultiplier,
        termWeeks: activeTerm,
        dailyIncome: 0,
        eligibilityRatio: settings.eligibilityRatio,
        refinanceBalance: isRefinancing ? existingBalance : 0,
        deductionPct: { processingFee: settings.feePercentage },
      }),
    [principal, activeMultiplier, activeTerm, settings.eligibilityRatio, settings.feePercentage, isRefinancing, existingBalance, isMonthly]
  )

  const schedule = useMemo(
    () =>
      buildAmortizationSchedule({
        weeklyInstallment: calc.weeklyInstallment,
        termWeeks: calc.termWeeks,
        interval: isMonthly ? 'month' : 'week',
      }),
    [calc.weeklyInstallment, calc.termWeeks, isMonthly]
  )

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 50)
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.account_number.toLowerCase().includes(q) ||
          (c.phone_number || '').toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [clients, clientSearch])

  // ---- Step validation ------------------------------------------------------
  const validateStep = (target: number): boolean => {
    const next: Record<string, string> = {}
    if (target >= 2 && !selectedClientId) {
      next.client = 'Select an active client to continue.'
    }
    if (target >= 3) {
      if (!Number.isFinite(principal) || principal <= 0) {
        next.principal = 'Enter a valid loan amount.'
      } else if (principal < settings.minLoan || principal > settings.maxLoan) {
        next.principal = `Amount must be between ${formatCurrency(settings.minLoan)} and ${formatCurrency(settings.maxLoan)}.`
      }
      if (!Number.isInteger(termWeeks) || termWeeks < MIN_TERM_WEEKS || termWeeks > MAX_TERM_WEEKS) {
        next.termWeeks = `Term must be ${MIN_TERM_WEEKS}–${MAX_TERM_WEEKS} weeks.`
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const goNext = () => {
    if (!validateStep(step + 1)) return
    setStep((s) => Math.min(5, s + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setErrors({})
    setStep((s) => Math.max(1, s - 1))
  }

  const selectClient = (id: string) => {
    setSelectedClientId(id)
    setShowClientList(false)
    setClientSearch('')
    setErrors((prev) => {
      const next = { ...prev }
      delete next.client
      return next
    })
    const c = clients.find((x) => x.id === id)
    if (c) setClientSearch('')
  }

  // ---- Submit ----------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep(5)) {
      setStep(2)
      return
    }
    setLoading(true)
    // One idempotency key per submit attempt
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          principal,
          paymentFrequency,
          termWeeks: isMonthly ? termMonths : termWeeks,
          termMonths: isMonthly ? termMonths : undefined,
          interestRate: isMonthly ? interestRate : undefined,
          cycleNumber,
          previousLoanAmount: previousLoanAmt,
          previousLoanId: isRefinancing && activeExistingLoan ? activeExistingLoan.id : null,
          agreementTown,
          agreementDistrict,
          agreementRegion,
          overrideReason: undefined,
        }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        let description = body?.error || 'Submission failed. Please try again.'
        let title = 'Application Submission Failed'
        if (res.status === 401) {
          title = 'Authentication error'
          description = 'Your session expired. Please sign in again.'
        } else if (res.status === 403) {
          title = 'Not authorized'
          description = 'No staff profile is linked to your account.'
        } else if (res.status === 409) {
          title = 'Active loan conflict'
          description = body?.error || 'This client already has an active loan and must refinance it.'
        } else if (res.status === 429) {
          title = 'Too many submissions'
          description = 'Please wait a minute before submitting another application.'
        }
        toast({ title, description, variant: 'destructive' })
        return
      }

      try {
        window.localStorage.removeItem(draftKey(selectedClientId))
      } catch {
        // ignore
      }

      toast({
        title: 'Loan Application Submitted',
        description: `Loan ${body?.loan?.loan_number ?? ''} is pending manager review.`,
        variant: 'success',
      })

      router.push(`/loans/${body?.loan?.id}`)
      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Network error',
        description: err?.message || 'Could not reach the server. Check your connection and retry.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // ---- Render helpers ---------------------------------------------------------
  const summaryRow = (label: string, value: React.ReactNode, bold = false) => (
    <div className={`flex justify-between py-1 ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className={bold ? 'font-bold' : 'font-semibold text-gray-800'}>{value}</span>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 bg-white border border-gray-200 rounded-xl p-3 overflow-x-auto">
        {STEPS.map((s, idx) => {
          const Icon = s.icon
          const state = step === s.n ? 'current' : step > s.n ? 'done' : 'todo'
          return (
            <div key={s.n} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (s.n < step) setStep(s.n)
                  else if (s.n > step && validateStep(s.n)) setStep(s.n)
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  state === 'current'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : state === 'done'
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {s.n}. {s.label}
                </span>
                <span className="sm:hidden">{s.n}</span>
              </button>
              {idx < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
            </div>
          )
        })}
      </div>

      {/* ============ STEP 1: CLIENT ============ */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              1. Select Applicant
            </CardTitle>
            <CardDescription>
              Search a registered micro-credit market trader by name, account number or phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5" ref={clientBoxRef}>
              <Label htmlFor="client_search">Applicant *</Label>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 p-2.5 border border-blue-200 bg-blue-50/60 rounded-lg">
                  <div className="text-sm">
                    <span className="font-bold text-gray-900">{selectedClient.full_name}</span>
                    <span className="text-gray-500 ml-2 text-xs font-mono">{selectedClient.account_number}</span>
                    <span className="text-gray-500 ml-2 text-xs">{selectedClient.phone_number}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => {
                      setSelectedClientId('')
                      setClientSearch('')
                      setShowClientList(true)
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="client_search"
                    autoComplete="off"
                    placeholder="Type name, account # or phone…"
                    className="pl-9"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value)
                      setShowClientList(true)
                    }}
                    onFocus={() => setShowClientList(true)}
                  />
                  {showClientList && (
                    <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {filteredClients.length === 0 && (
                        <p className="p-3 text-xs text-gray-500">No clients match your search.</p>
                      )}
                      {filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectClient(c.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                        >
                          <span className="font-semibold text-gray-900">{c.full_name}</span>
                          <span className="ml-2 text-xs font-mono text-gray-500">{c.account_number}</span>
                          <span className="ml-2 text-xs text-gray-400">{c.phone_number}</span>
                          <span className="block text-[11px] text-gray-400">
                            {c.business_type} • {c.market_location}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {errors.client && <p className="text-xs text-red-500">{errors.client}</p>}
            </div>

            {/* Profile summary */}
            {selectedClient && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">Branch / Area:</span>
                    <p className="font-semibold text-gray-800">
                      {selectedClient.branch || 'Makola Branch'} • {selectedClient.area || 'Central Area'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Business / Stall:</span>
                    <p className="font-semibold text-gray-800">
                      {selectedClient.business_type} ({selectedClient.market_location})
                    </p>
                  </div>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-gray-500">Loan History:</span>
                  <span className="font-bold text-gray-900">
                    {selectedClient.totalLoans ?? 0} prior loan{(selectedClient.totalLoans ?? 0) === 1 ? '' : 's'} • Cycle #{cycleNumber}
                  </span>
                </div>
                {activeExistingLoan && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Active Loan / Outstanding:</span>
                    <span className="font-bold text-purple-800">
                      {activeExistingLoan.loan_number} — {formatCurrency(activeExistingLoan.outstanding_balance)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Refinancing banner */}
            {activeExistingLoan && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                  <RefreshCw className="h-4 w-4 text-purple-700 animate-spin" />
                  Refinancing Chain: Prior Active Loan Detected
                </div>
                <p className="text-xs text-purple-800">
                  Refinancing active loan <strong>{activeExistingLoan.loan_number}</strong> — outstanding{' '}
                  <strong>{formatCurrency(activeExistingLoan.outstanding_balance)}</strong> will be deducted from the new disbursement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============ STEP 2: AMOUNT & TERMS ============ */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-blue-600" />
              2. Facility Request & Terms
            </CardTitle>
            <CardDescription>
              Amount requested, repayment term, and contract jurisdiction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="principal">Amt. Requested (GH¢) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">GH¢</span>
                  <Input
                    id="principal"
                    type="number"
                    min={settings.minLoan}
                    max={settings.maxLoan}
                    step={100}
                    value={principal}
                    onChange={(e) => {
                      setPrincipal(parseFloat(e.target.value) || 0)
                      setErrors((p) => ({ ...p, principal: '' }))
                    }}
                    className="pl-14 text-lg font-bold text-gray-900"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-500">
                  Allowed range: {formatCurrency(settings.minLoan)} – {formatCurrency(settings.maxLoan)}
                </p>
                {errors.principal && <p className="text-xs text-red-500">{errors.principal}</p>}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Repayment frequency *</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaymentFrequency('weekly')} className={`px-3 py-2 rounded-md text-xs font-semibold border ${!isMonthly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>Weekly (13 weeks)</button>
                  <button type="button" onClick={() => setPaymentFrequency('monthly')} className={`px-3 py-2 rounded-md text-xs font-semibold border ${isMonthly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>Monthly (1–6 months)</button>
                </div>
              </div>

              {isMonthly ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="termMonths">Term (months) *</Label>
                    <select id="termMonths" value={termMonths} onChange={(e) => setTermMonths(parseInt(e.target.value, 10))} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                      {[1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="interestRate">Interest rate *</Label>
                    <select id="interestRate" value={interestRate} onChange={(e) => setInterestRate(parseFloat(e.target.value))} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                      {MONTHLY_INTEREST_RATES.map((rate) => <option key={rate} value={rate}>{Math.round(rate * 100)}%</option>)}
                    </select>
                    <p className="text-[11px] text-gray-500">The approver can change this rate before approval.</p>
                  </div>
                </>
              ) : (
              <div className="space-y-1.5">
                <Label htmlFor="termWeeks">Repayment Term (weeks) *</Label>
                <Input
                  id="termWeeks"
                  type="number"
                  min={MIN_TERM_WEEKS}
                  max={MAX_TERM_WEEKS}
                  value={termWeeks}
                  onChange={(e) => {
                    setTermWeeks(parseInt(e.target.value) || 0)
                    setErrors((p) => ({ ...p, termWeeks: '' }))
                  }}
                  className="text-lg font-bold text-gray-900"
                  required
                />
                <input
                  type="range"
                  min={MIN_TERM_WEEKS}
                  max={MAX_TERM_WEEKS}
                  value={Math.min(Math.max(termWeeks, MIN_TERM_WEEKS), MAX_TERM_WEEKS)}
                  onChange={(e) => setTermWeeks(parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                  aria-label="Term weeks slider"
                />
                <p className="text-[11px] text-gray-500">
                  {MIN_TERM_WEEKS}–{MAX_TERM_WEEKS} weeks (standard: {settings.termWeeks})
                </p>
                {errors.termWeeks && <p className="text-xs text-red-500">{errors.termWeeks}</p>}
              </div>
              )}
            </div>

            {/* Preset quick buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[1000, 1500, 2000, 2500, 3000, 4000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPrincipal(amt)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                    principal === amt
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  GH¢ {amt.toLocaleString()}
                </button>
              ))}
            </div>

            {/* Live recompute */}
            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Total Repayable ({isMonthly ? `${Math.round(interestRate * 100)}%` : `${settings.interestMultiplier}x`}):
                </span>
                <span className="font-bold text-gray-900">{formatCurrency(terms.totalRepayable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{isMonthly ? 'Monthly' : 'Weekly'} installment over {terms.termWeeks} {isMonthly ? 'months' : 'weeks'}:</span>
                <span className="font-bold text-blue-700">{formatCurrency(terms.weeklyInstallment)} / {isMonthly ? 'mo' : 'wk'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="agreementTown" className="text-xs">Agreement Town</Label>
                <Input id="agreementTown" value={agreementTown} onChange={(e) => setAgreementTown(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agreementDistrict" className="text-xs">District</Label>
                <Input id="agreementDistrict" value={agreementDistrict} onChange={(e) => setAgreementDistrict(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agreementRegion" className="text-xs">Region</Label>
                <Input id="agreementRegion" value={agreementRegion} onChange={(e) => setAgreementRegion(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ STEP 3: DEDUCTIONS PREVIEW ============ */}
      {step === 3 && (
        <div className="space-y-6">
          <Card className="border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-blue-600" />
                3. Cash to the client and the Sunday schedule
              </CardTitle>
              <CardDescription className="text-xs">
                A processing fee is taken from the principal. The first installment is the next Sunday after disbursement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {summaryRow('Principal:', formatCurrency(calc.principal), true)}
              {summaryRow(
                `Processing fee (${Math.round(calc.processingFeePct * 1000) / 10}%):`,
                `−${formatCurrency(calc.processingFeeAmount)}`
              )}

              {isRefinancing && calc.refinanceBalance > 0 && (
                <div className="flex justify-between py-1.5 bg-purple-100 px-2 rounded font-medium text-purple-900">
                  <span>Previous Loan Netting ({activeExistingLoan?.loan_number}):</span>
                  <span className="font-bold">−{formatCurrency(calc.refinanceBalance)}</span>
                </div>
              )}

              <div className="flex justify-between py-2 bg-emerald-50 border border-emerald-200 px-2.5 rounded-lg font-bold">
                <span className="text-emerald-950">Cash to client{isRefinancing && calc.refinanceBalance > 0 ? ' after refinancing' : ''}:</span>
                <span className="text-sm text-emerald-700">{formatCurrency(calc.netDisbursement)}</span>
              </div>

              <div className="pt-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Repayable ({calc.interestMultiplier}x):</span>
                  <span className="font-black text-sm text-gray-900">{formatCurrency(calc.totalRepayable)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tenor:</span>
                  <span className="font-semibold text-gray-800">
                    {isMonthly ? `${calc.termWeeks} monthly Sunday payments` : `${calc.termWeeks} Sunday payments`}
                  </span>
                </div>
                <div className="flex justify-between text-blue-700 font-bold">
                  <span>Installment:</span>
                  <span className="text-sm">{formatCurrency(calc.weeklyInstallment)} / {isMonthly ? 'month' : 'Sunday'}</span>
                </div>
              </div>

              <div className="p-2 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-900 leading-snug">
                <Shield className="h-3.5 w-3.5 inline mr-1 text-amber-700" />
                <strong>Default Clause:</strong> In case of default, a 5% penal rate per month applies over the prevailing rate.
              </div>
            </CardContent>
          </Card>

          {/* Amortization schedule preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-gray-900">Repayment Schedule Preview</CardTitle>
              <CardDescription className="text-xs">
                {isMonthly
                  ? `${calc.termWeeks} Sunday payments, one each month, of ${formatCurrency(calc.weeklyInstallment)}.`
                  : `${calc.termWeeks} Sunday payments of ${formatCurrency(calc.weeklyInstallment)}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">#</th>
                      <th className="text-left px-4 py-2 font-semibold">Due Date</th>
                      <th className="text-right px-4 py-2 font-semibold">Installment</th>
                      <th className="text-right px-4 py-2 font-semibold">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schedule.map((row) => (
                      <tr key={row.installmentNumber} className="hover:bg-blue-50/40">
                        <td className="px-4 py-1.5 text-gray-500">{row.installmentNumber}</td>
                        <td className="px-4 py-1.5 text-gray-800">{row.dueDate}</td>
                        <td className="px-4 py-1.5 text-right font-semibold text-gray-900">{formatCurrency(row.expectedAmount)}</td>
                        <td className="px-4 py-1.5 text-right text-gray-600">{formatCurrency(row.cumulativeExpected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============ STEP 4: GUARANTOR ============ */}
      {step === 4 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              4. Guarantor (from Client Profile)
            </CardTitle>
            <CardDescription>
              Captured from the client&apos;s registration record — edit via the client profile if changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedClient ? (
              selectedClient.guarantor_name ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">Guarantor Name:</span>
                      <p className="font-semibold text-gray-800">{selectedClient.guarantor_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p className="font-semibold text-gray-800 font-mono">{selectedClient.guarantor_phone || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Occupation:</span>
                      <p className="font-semibold text-gray-800">{selectedClient.guarantor_occupation || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Residential Address:</span>
                      <p className="font-semibold text-gray-800">{selectedClient.guarantor_residential_address || '—'}</p>
                    </div>
                  </div>
                  <Link
                    href={`/clients/${selectedClient.id}`}
                    className="inline-block pt-1 text-blue-600 hover:underline text-[11px] font-medium"
                  >
                    Open client profile to update guarantor →
                  </Link>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                  No guarantor is recorded on this client&apos;s profile. Capture one on the client record before disbursement.
                </div>
              )
            ) : (
              <p className="text-xs text-gray-500">Select a client in step 1 to view guarantor details.</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="guarantorNote" className="text-xs">Guarantor Note (optional)</Label>
              <textarea
                id="guarantorNote"
                value={guarantorNote}
                onChange={(e) => setGuarantorNote(e.target.value)}
                rows={3}
                placeholder="e.g. Guarantor confirmed by phone on application date; agreed to joint liability."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400">
                Internal note shown in the review summary for this application.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ STEP 5: REVIEW & SUBMIT ============ */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-gray-900">Application Summary</CardTitle>
                <CardDescription className="text-xs">Verify every term before submitting for approval.</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1 divide-y divide-gray-100">
                {summaryRow('Applicant:', selectedClient ? `${selectedClient.full_name} (${selectedClient.account_number})` : '—')}
                {summaryRow('Business / Market:', selectedClient ? `${selectedClient.business_type} • ${selectedClient.market_location}` : '—')}
                {summaryRow('Loan Cycle:', `#${cycleNumber}${isRefinancing ? ' (refinance)' : ''}`)}
                {isRefinancing && activeExistingLoan && (
                  <>
                    {summaryRow('Refinanced Loan:', `${activeExistingLoan.loan_number} — outstanding ${formatCurrency(activeExistingLoan.outstanding_balance)}`)}
                  </>
                )}
                {summaryRow('Principal:', formatCurrency(calc.principal), true)}
                {summaryRow('Interest Multiplier:', `${calc.interestMultiplier}x`)}
                {summaryRow('Term:', isMonthly ? `${calc.termWeeks} monthly Sunday payments` : `${calc.termWeeks} Sunday payments`)}
                {summaryRow('Cash to client:', formatCurrency(calc.netDisbursement), true)}
                {summaryRow('Total Repayable:', formatCurrency(calc.totalRepayable), true)}
                {summaryRow('Weekly Installment:', `${formatCurrency(calc.weeklyInstallment)} / wk`, true)}
                {summaryRow('Agreement Jurisdiction:', `${agreementTown}, ${agreementDistrict}, ${agreementRegion}`)}
                {summaryRow('Guarantor:', selectedClient?.guarantor_name || '—')}
                {guarantorNote.trim() && summaryRow('Guarantor Note:', guarantorNote.trim())}
              </CardContent>
            </Card>

          </div>

          <Button
            type="submit"
            disabled={loading || !selectedClientId}
            className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-sm font-semibold shadow-md"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Application...
              </>
            ) : (
              'Submit Loan for Approval'
            )}
          </Button>
        </div>
      )}

      {/* Back / Next navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={step === 1 || loading}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        {step < 5 && (
          <Button type="button" onClick={goNext} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  )
}
