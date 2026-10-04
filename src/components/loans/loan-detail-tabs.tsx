'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Small browser-print helper used on the Schedule / Transactions tabs. */
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs font-semibold text-gray-700 border-gray-300"
      onClick={() => window.print()}
    >
      <Printer className="h-3.5 w-3.5 mr-1" />
      {label}
    </Button>
  )
}

export type LoanTabKey =
  | 'overview'
  | 'schedule'
  | 'transactions'
  | 'contract'
  | 'kyc'
  | 'audit'

interface LoanDetailTabsProps {
  overview: React.ReactNode
  schedule: React.ReactNode
  transactions: React.ReactNode
  contract: React.ReactNode
  kyc: React.ReactNode
  audit: React.ReactNode
  /** Optional counts shown as badges on tab triggers */
  scheduleCount?: number
  transactionCount?: number
}

const TAB_LABELS: Array<{ key: LoanTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'contract', label: 'Contract' },
  { key: 'kyc', label: 'KYC' },
  { key: 'audit', label: 'Audit' },
]

/**
 * Client-side tab shell for the loan detail page. The page stays a server
 * component and passes already-rendered section JSX in as props; this wrapper
 * only owns the tab state so the sections can be swapped without scrolling.
 */
export function LoanDetailTabs({
  overview,
  schedule,
  transactions,
  contract,
  kyc,
  audit,
  scheduleCount,
  transactionCount,
}: LoanDetailTabsProps) {
  const content: Record<LoanTabKey, React.ReactNode> = {
    overview,
    schedule,
    transactions,
    contract,
    kyc,
    audit,
  }

  const badge = (key: LoanTabKey) => {
    if (key === 'schedule' && typeof scheduleCount === 'number' && scheduleCount > 0) {
      return scheduleCount
    }
    if (key === 'transactions' && typeof transactionCount === 'number' && transactionCount > 0) {
      return transactionCount
    }
    return null
  }

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto">
        {TAB_LABELS.map(({ key, label }) => {
          const count = badge(key)
          return (
            <TabsTrigger key={key} value={key} className="text-xs gap-1.5">
              {label}
              {count !== null && (
                <span className="inline-flex items-center justify-center rounded-full bg-gray-200 px-1.5 text-[10px] font-bold text-gray-600">
                  {count}
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {TAB_LABELS.map(({ key }) => (
        <TabsContent key={key} value={key} className="mt-4">
          {content[key]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
