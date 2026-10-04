import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, loanStatusBadgeClass } from '@/lib/utils'
import { FileText, ChevronRight, Eye } from 'lucide-react'

export function RecentLoans({ loans }: { loans: any[] }) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Recent Applications & Disbursements
          </CardTitle>
          <CardDescription className="text-xs">
            Latest loan originations and review requests
          </CardDescription>
        </div>
        <Link href="/loans">
          <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-7 px-2">
            View All <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-gray-400 text-xs">
                    No active loan activity recorded.
                  </TableCell>
                </TableRow>
              ) : (
                loans.map((loan) => (
                  <TableRow key={loan.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-mono text-xs font-bold text-blue-700">
                      {loan.loan_number}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-gray-900 text-xs">{loan.clients?.full_name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{loan.clients?.account_number}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-gray-900">
                      {formatCurrency(loan.principal)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${loanStatusBadgeClass(loan.status)}`}>
                        {loan.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {loan.users?.full_name ?? 'Loan Officer'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(loan.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/loans/${loan.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
