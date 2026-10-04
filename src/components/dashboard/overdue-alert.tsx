import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, clientStatusBadgeClass } from '@/lib/utils'
import { AlertTriangle, ChevronRight, Phone } from 'lucide-react'

export function OverdueAlert({ clients }: { clients: any[] }) {
  return (
    <Card className="h-full flex flex-col border-orange-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            Top Arrears & Defaulters
          </CardTitle>
          <Link href="/overdue">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2">
              View All <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <CardDescription className="text-xs">
          High priority collections requiring supervisor follow-up
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2.5">
        {clients.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-xs">
            No delinquent accounts currently on file.
          </div>
        ) : (
          clients.map((c) => (
            <div
              key={c.loan_id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-xs hover:bg-slate-100 transition-colors"
            >
              <div>
                <p className="font-bold text-gray-900">{c.full_name}</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                  <span className="font-mono text-blue-700">{c.account_number}</span>
                  <span>•</span>
                  <span className="text-orange-700 font-medium">{c.overdue_installments} wks overdue</span>
                </div>
              </div>

              <div className="text-right">
                <p className="font-black text-rose-600 text-sm">{formatCurrency(c.total_arrears)}</p>
                <Link href={`/repayments?clientId=${c.client_id}`}>
                  <span className="text-[10px] text-blue-600 font-semibold hover:underline">
                    Collect &rarr;
                  </span>
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
