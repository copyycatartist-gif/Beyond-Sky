'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save, ShieldCheck } from 'lucide-react'

interface SettingRow {
  id: string
  key: string
  value: string
  description: string | null
}

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
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsValues }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update settings')

      toast({
        title: 'Settings Saved',
        description: 'Business rules updated. New loans will use these parameters.',
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
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Core Lending Parameters
          </CardTitle>
          <CardDescription className="text-xs">
            Changes apply to newly originated loan applications immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="interest_multiplier">Interest Multiplier (Flat Rate) *</Label>
              <Input
                id="interest_multiplier"
                type="number"
                step="0.001"
                value={settingsValues['interest_multiplier'] || '1.365'}
                onChange={(e) => handleChange('interest_multiplier', e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-400">e.g. 1.365 = 36.5% flat markup on principal</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fee_percentage">Processing Fee Fraction *</Label>
              <Input
                id="fee_percentage"
                type="number"
                step="0.01"
                value={settingsValues['fee_percentage'] || '0.05'}
                onChange={(e) => handleChange('fee_percentage', e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-400">e.g. 0.05 = 5% deducted from disbursement</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="term_weeks">Loan Term (Weeks) *</Label>
              <Input
                id="term_weeks"
                type="number"
                value={settingsValues['term_weeks'] || '13'}
                onChange={(e) => handleChange('term_weeks', e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-400">Default: 13 weekly installments</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weeks_to_defaulter_status">Defaulter Escalation Threshold (Weeks Missed) *</Label>
              <Input
                id="weeks_to_defaulter_status"
                type="number"
                value={settingsValues['weeks_to_defaulter_status'] || '2'}
                onChange={(e) => handleChange('weeks_to_defaulter_status', e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-400">Consecutive missed weeks to escalate status</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min_loan_amount">Minimum Principal (GHS) *</Label>
              <Input
                id="min_loan_amount"
                type="number"
                value={settingsValues['min_loan_amount'] || '1000'}
                onChange={(e) => handleChange('min_loan_amount', e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_loan_amount">Maximum Principal (GHS) *</Label>
              <Input
                id="max_loan_amount"
                type="number"
                value={settingsValues['max_loan_amount'] || '5000'}
                onChange={(e) => handleChange('max_loan_amount', e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="eligibility_income_ratio">Debt-to-Income Advisory Threshold *</Label>
              <Input
                id="eligibility_income_ratio"
                type="number"
                step="0.01"
                value={settingsValues['eligibility_income_ratio'] || '0.30'}
                onChange={(e) => handleChange('eligibility_income_ratio', e.target.value)}
                required
              />
              <p className="text-[11px] text-gray-400">e.g. 0.30 = weekly payment should not exceed 30% of weekly declared income</p>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 min-w-[160px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Settings...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Business Rules
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
