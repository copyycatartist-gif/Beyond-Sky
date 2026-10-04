import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, clientStatusBadgeClass, loanStatusBadgeClass } from '@/lib/utils'
import { AlertTriangle, ShieldAlert, Phone, Eye, CreditCard, RefreshCw } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OverduePage() {
  const supabase = await createClient()

  // Fetch overdue clients from SQL view `overdue_clients`
  const { data: overdueClients } = await supabase
    .from('overdue_clients')
    .select('*')
    .order('max_days_overdue', { ascending: false })

  const totalArrears = (overdueClients || []).reduce((acc, c) => acc + Number(c.total_arrears), 0)
  const defaultedCount = (overdueClients || []).filter((c) => c.client_status === 'defaulted').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Overdue & Defaulters Tracking</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Real-time monitoring of missed installments and escalated loan defaulters
          </p>
        </div>

        {/* Trigger cron check button for testing / manual run */}
        <form action="/api/cron/daily-loan-check" method="GET">
          <Button type="submit" variant="outline" size="sm" className="text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Run Daily Escalation Job
          </Button>
        </form>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-orange-700 font-medium">Overdue Clients</p>
              <p className="text-2xl font-black text-gray-900">{overdueClients?.length || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="border-red-200 bg-red-50/40 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-xl">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-red-700 font-medium">Defaulted Clients (2+ Misses)</p>
              <p className="text-2xl font-black text-red-900">{defaultedCount}</p>
            </div>
          </div>
        </Card>

        <Card className="border-rose-200 bg-rose-50/40 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-rose-700 font-medium">Total Arrears Balance</p>
              <p className="text-2xl font-black text-rose-700">{formatCurrency(totalArrears)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Overdue Clients Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Loan #</TableHead>
              <TableHead className="text-right">Missed Installments</TableHead>
              <TableHead className="text-right">Total Arrears</TableHead>
              <TableHead>Days Overdue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Loan Officer</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!overdueClients || overdueClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-gray-400 text-xs">
                  🎉 No overdue loans or defaulters! The portfolio is 100% current.
                </TableCell>
              </TableRow>
            ) : (
              overdueClients.map((client) => (
                <TableRow key={client.loan_id} className="hover:bg-slate-50/80">
                  <TableCell className="font-mono text-xs font-bold text-blue-700">
                    {client.account_number}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-gray-900 text-sm">{client.full_name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1 font-mono">
                      <Phone className="h-3 w-3 text-gray-400" />
                      {client.phone_number}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-gray-700">
                    {client.loan_number}
                  </TableCell>
                  <TableCell className="text-right font-black text-xs text-red-600">
                    {client.overdue_installments} week(s)
                  </TableCell>
                  <TableCell className="text-right font-bold text-xs text-rose-700">
                    {formatCurrency(client.total_arrears)}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-orange-800">
                    {client.max_days_overdue} days
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${clientStatusBadgeClass(client.client_status)}`}>
                      {client.client_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-600">
                    {client.loan_officer_name}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Link href={`/repayments?clientId=${client.client_id}`}>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7 px-2">
                        Collect
                      </Button>
                    </Link>
                    <Link href={`/loans/${client.loan_id}`}>
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
