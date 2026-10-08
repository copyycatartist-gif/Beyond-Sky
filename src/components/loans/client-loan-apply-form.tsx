'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { calculateLoan, MONTHLY_INTEREST_RATES } from '@/lib/loans/calculations'
import { formatCurrency } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Offer = {
  minLoan: number
  maxLoan: number
  interestMultiplier: number
  termWeeks: number
  feePercentage: number
}

type Step = 'identity' | 'code' | 'terms' | 'done' | 'closed'

export function ClientLoanApplyForm({ token }: { token: string }) {
  const [step, setStep] = useState<Step>('identity')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountNumber, setAccountNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [session, setSession] = useState('')
  const [clientName, setClientName] = useState('')
  const [offer, setOffer] = useState<Offer | null>(null)
  const [principal, setPrincipal] = useState(2000)
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly')
  const [termMonths, setTermMonths] = useState(3)
  const [interestRate, setInterestRate] = useState(0.1)
  const [loanNumber, setLoanNumber] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/loan-apply?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.state === 'used') {
          setStep('closed')
          setNotice('This link has already been used.')
        } else if (data.state === 'expired') {
          setStep('closed')
          setNotice('This link has expired. Ask Beyond Sky staff for a new one.')
        } else if (data.state !== 'open') {
          setStep('closed')
          setNotice('This link is not valid.')
        }
      })
      .catch(() => {
        if (!cancelled) setError('The page could not check this link. Refresh and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const preview = useMemo(() => {
    if (!offer) return null
    const multiplier = frequency === 'monthly' ? 1 + interestRate : offer.interestMultiplier
    const term = frequency === 'monthly' ? termMonths : offer.termWeeks
    return calculateLoan({
      principal: principal || 0,
      interestMultiplier: multiplier,
      termWeeks: term,
      deductionPct: { processingFee: offer.feePercentage },
    })
  }, [offer, frequency, interestRate, termMonths, principal])

  async function post(payload: Record<string, unknown>) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/public/loan-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      return data
    } finally {
      setLoading(false)
    }
  }

  const feePercent = offer ? Math.round(offer.feePercentage * 10000) / 100 : 5

  return (
    <main className="min-h-full px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="text-center">
          <img src="/logo.jpg" alt="Beyond Sky" className="mx-auto h-14 w-14 rounded-lg object-cover" />
          <h1 className="mt-3 text-xl font-bold text-gray-900">Beyond Sky loan application</h1>
          <p className="mt-1 text-sm text-gray-500">For a client who is already registered.</p>
        </div>

        {step === 'closed' && (
          <Card>
            <CardContent className="pt-6 text-sm text-gray-700">{notice}</CardContent>
          </Card>
        )}

        {step === 'identity' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirm it is you</CardTitle>
              <CardDescription>Use the account number and phone on your Beyond Sky file. We will text a code to that phone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="account">Account number</Label>
                <Input id="account" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="BSM-000001-8" autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" inputMode="tel" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  try {
                    await post({ step: 'code', accountNumber, phone })
                    setStep('code')
                  } catch (err: any) {
                    setError(err.message)
                  }
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Text me a code'}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'code' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter the code</CardTitle>
              <CardDescription>It was sent to the phone on your file and expires in 10 minutes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="code">6-digit code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  try {
                    const data = await post({ step: 'confirm', code })
                    setSession(data.session)
                    setClientName(data.clientName)
                    setOffer(data.offer)
                    if (data.offer?.minLoan) setPrincipal(Math.min(Math.max(2000, data.offer.minLoan), data.offer.maxLoan))
                    setStep('terms')
                  } catch (err: any) {
                    setError(err.message)
                  }
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
              </Button>
              <button type="button" className="text-sm text-blue-700" onClick={() => { setStep('identity'); setError('') }}>
                Send a new code
              </button>
            </CardContent>
          </Card>
        )}

        {step === 'terms' && offer && preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hello, {clientName}</CardTitle>
              <CardDescription>Choose the loan. Staff will approve or reject it. Repayments fall on Sunday after the loan is paid out.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button type="button" variant={frequency === 'weekly' ? 'default' : 'outline'} onClick={() => setFrequency('weekly')}>Weekly</Button>
                <Button type="button" variant={frequency === 'monthly' ? 'default' : 'outline'} onClick={() => setFrequency('monthly')}>Monthly</Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="amount">Amount (GHS)</Label>
                <Input id="amount" type="number" min={offer.minLoan} max={offer.maxLoan} value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} />
                <p className="text-xs text-gray-500">Between {formatCurrency(offer.minLoan)} and {formatCurrency(offer.maxLoan)}.</p>
              </div>
              {frequency === 'monthly' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rate">Interest</Label>
                    <select id="rate" className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={String(interestRate)} onChange={(e) => setInterestRate(Number(e.target.value))}>
                      {MONTHLY_INTEREST_RATES.map((rate) => (
                        <option key={rate} value={rate}>{Math.round(rate * 100)}%</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="months">Months</Label>
                    <select id="months" className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={String(termMonths)} onChange={(e) => setTermMonths(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((months) => (
                        <option key={months} value={months}>{months}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{offer.termWeeks} Sunday payments. A {feePercent}% processing fee is taken before the cash is paid out.</p>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                <p>Processing fee: {formatCurrency(preview.totalDeductions)}</p>
                <p>Cash you would receive: {formatCurrency(preview.netDisbursement)}</p>
                <p>{frequency === 'monthly' ? 'Monthly' : 'Sunday'} installment: {formatCurrency(preview.weeklyInstallment)}</p>
                <p>Total to repay: {formatCurrency(preview.totalRepayable)}</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  try {
                    const data = await post({
                      step: 'submit',
                      session,
                      principal,
                      paymentFrequency: frequency,
                      termMonths,
                      interestRate,
                    })
                    setLoanNumber(data.loanNumber || '')
                    setStep('done')
                  } catch (err: any) {
                    setError(err.message)
                  }
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit application'}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application received</CardTitle>
              <CardDescription>Staff will approve or reject it. This link cannot be used again.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-gray-700">
              {loanNumber ? <p>Reference: <span className="font-mono font-semibold">{loanNumber}</span></p> : null}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
