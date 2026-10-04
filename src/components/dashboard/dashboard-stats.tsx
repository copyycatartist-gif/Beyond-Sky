import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Banknote, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface PortfolioSummary {
  active_loans: number
  closed_loans: number
  defaulted_loans: number
  pending_approvals: number
  total_disbursed: number
  total_collected: number
  total_fees: number
  total_outstanding: number
}

interface ParSummary {
  total_outstanding: number
  par1_amount: number
  par7_amount: number
  par30_amount: number
  par1_pct: number
  par7_pct: number
  par30_pct: number
}

export function DashboardStats({
  portfolio,
  par,
}: {
  portfolio: PortfolioSummary | null
  par: ParSummary | null
}) {
  const activeLoans = portfolio?.active_loans || 0
  const totalDisbursed = portfolio?.total_disbursed || 0
  const totalCollected = portfolio?.total_collected || 0
  const totalOutstanding = portfolio?.total_outstanding || 0
  const totalFees = portfolio?.total_fees || 0
  const pendingApprovals = portfolio?.pending_approvals || 0
  const par30Pct = par?.par30_pct || 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Disbursed */}
      <Card className="p-5 bg-white border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Disbursed</p>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Banknote className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-black text-gray-900 mt-2">{formatCurrency(totalDisbursed)}</p>
        <p className="text-[11px] text-gray-400 mt-1">
          {activeLoans} active micro-loans on book
        </p>
      </Card>

      {/* 2. Total Collected */}
      <Card className="p-5 bg-white border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Collected</p>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-black text-emerald-700 mt-2">{formatCurrency(totalCollected)}</p>
        <p className="text-[11px] text-emerald-600 font-medium mt-1">
          + {formatCurrency(totalFees)} fee revenue recognized
        </p>
      </Card>

      {/* 3. Total Outstanding */}
      <Card className="p-5 bg-white border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Portfolio Outstanding</p>
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-black text-purple-900 mt-2">{formatCurrency(totalOutstanding)}</p>
        <p className="text-[11px] text-purple-600 mt-1">
          {pendingApprovals} applications pending review
        </p>
      </Card>

      {/* 4. Portfolio At Risk (PAR 30) */}
      <Card className={`p-5 border ${
        par30Pct > 5 ? 'border-rose-300 bg-rose-50/40' : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">PAR 30 (Risk)</p>
          <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-black mt-2 ${par30Pct > 5 ? 'text-rose-700' : 'text-gray-900'}`}>
          {par30Pct.toFixed(1)}%
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          Target: &lt; 5.0% of total portfolio
        </p>
      </Card>
    </div>
  )
}
