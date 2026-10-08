import { createClient } from '@/lib/supabase/server'
import { requirePageRoles } from '@/lib/page-access'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { MessageSquare, Phone, CheckCircle2, XCircle, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SmsLogPage() {
  await requirePageRoles(['manager', 'accountant_admin'])
  const supabase = await createClient()

  // Fetch SMS log entries
  const { data: logs } = await supabase
    .from('sms_log')
    .select(`
      id, message_type, phone, message_body, status, provider, sent_at,
      clients (account_number, full_name),
      loans (loan_number)
    `)
    .order('sent_at', { ascending: false })
    .limit(50)

  const sentCount = (logs || []).filter((l) => l.status === 'sent').length
  const failedCount = (logs || []).filter((l) => l.status === 'failed').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SMS Notifications Log</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Delivery audit for automated reminders, approval notices, repayment confirmations, and overdue alerts
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-blue-50/40 border-blue-200">
          <p className="text-xs text-blue-700 font-medium">Total Messages Dispatched</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{logs?.length || 0}</p>
        </Card>

        <Card className="p-4 bg-emerald-50/40 border-emerald-200">
          <p className="text-xs text-emerald-700 font-medium">Delivered / Sent</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{sentCount}</p>
        </Card>

        <Card className="p-4 bg-rose-50/40 border-rose-200">
          <p className="text-xs text-rose-700 font-medium">Delivery Failures</p>
          <p className="text-2xl font-black text-rose-700 mt-1">{failedCount}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            Outgoing SMS Message Dispatch Log
          </CardTitle>
          <CardDescription className="text-xs">
            Append-only audit trail of all automated gateway requests (Arkesel Ghana REST API)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Message Body</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!logs || logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-gray-400 text-xs">
                      No SMS notifications dispatched yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log: any) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/80 text-xs">
                      <TableCell className="text-gray-500 whitespace-nowrap">
                        {formatDate(log.sent_at, 'dd MMM yyyy, HH:mm')}
                      </TableCell>
                      <TableCell className="font-semibold uppercase text-[10px] text-gray-700">
                        {log.message_type}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {log.clients?.full_name ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-gray-600">
                        {log.phone}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-gray-700" title={log.message_body}>
                        {log.message_body}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] uppercase text-gray-500">
                        {log.provider}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          log.status === 'sent'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.status === 'sent' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {log.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
