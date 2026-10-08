'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save } from 'lucide-react'

interface SettingRow {
  id: string
  key: string
  value: string
  description: string | null
}

const UNUSED_DEDUCTION_KEYS = ['security_deposit_percentage', 'loan_risk_fund_percentage']

export function SettingsForm({ initialSettings }: { initialSettings: SettingRow[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    initialSettings.forEach((s) => {
      map[s.key] = s.value
    })
    return map
  })

  const handleChange = (key: string, val: string) => {
    setSettingsValues((prev) => ({ ...prev, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = { ...settingsValues }
      for (const key of UNUSED_DEDUCTION_KEYS) {
        if (key in payload) payload[key] = '0'
      }
      if (payload.processing_fee_percentage) {
        payload.fee_percentage = payload.processing_fee_percentage
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update settings')

      toast({
        title: 'Settings saved',
        description: 'New weekly loans will use these figures. Loans already approved keep their own terms.',
        variant: 'success',
      })
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Weekly loan</CardTitle>
          <CardDescription className="text-xs">
            Used when a new application is weekly. Changing these does not rewrite a loan that is already approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="interest_multiplier">Interest multiplier</Label>
            <Input
              id="interest_multiplier"
              type="number"
              step="0.001"
              min="1"
              value={settingsValues['interest_multiplier'] || '1.365'}
              onChange={(e) => handleChange('interest_multiplier', e.target.value)}
              required
            />
            <p className="text-[11px] text-gray-400">1.365 means the client repays 136.5% of the principal.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="term_weeks">Number of Sundays</Label>
            <Input
              id="term_weeks"
              type="number"
              min="1"
              value={settingsValues['term_weeks'] || '13'}
              onChange={(e) => handleChange('term_weeks', e.target.value)}
              required
            />
            <p className="text-[11px] text-gray-400">Default is 13 weekly Sunday payments.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="processing_fee_percentage">Processing fee (%)</Label>
            <Input
              id="processing_fee_percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={(() => {
                const raw = parseFloat(
                  settingsValues['processing_fee_percentage'] || settingsValues['fee_percentage'] || '0.05'
                )
                return Number.isFinite(raw) ? String(Math.round(raw * 10000) / 100) : '5'
              })()}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                const decimal = Number.isFinite(pct) ? String(pct / 100) : '0.05'
                handleChange('processing_fee_percentage', decimal)
                handleChange('fee_percentage', decimal)
              }}
              required
            />
            <p className="text-[11px] text-gray-400">Taken from the principal before cash is paid out. 5 means 5%.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900">Loan size and follow-up</CardTitle>
          <CardDescription className="text-xs">
            Monthly income is collected on the client file and shown to the approver. It does not block a loan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="min_loan_amount">Minimum principal (GHS)</Label>
            <Input
              id="min_loan_amount"
              type="number"
              min="0"
              value={settingsValues['min_loan_amount'] || '1000'}
              onChange={(e) => handleChange('min_loan_amount', e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_loan_amount">Maximum principal (GHS)</Label>
            <Input
              id="max_loan_amount"
              type="number"
              min="0"
              value={settingsValues['max_loan_amount'] || '5000'}
              onChange={(e) => handleChange('max_loan_amount', e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weeks_to_defaulter_status">Sundays missed before default review</Label>
            <Input
              id="weeks_to_defaulter_status"
              type="number"
              min="1"
              value={settingsValues['weeks_to_defaulter_status'] || '2'}
              onChange={(e) => handleChange('weeks_to_defaulter_status', e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eligibility_income_ratio">Installment share of income</Label>
            <Input
              id="eligibility_income_ratio"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={settingsValues['eligibility_income_ratio'] || '0.30'}
              onChange={(e) => handleChange('eligibility_income_ratio', e.target.value)}
              required
            />
            <p className="text-[11px] text-gray-400">
              0.30 marks the loan for the approver when the installment is above 30% of monthly income. Approval is still allowed.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 min-w-[160px]">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save settings
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
