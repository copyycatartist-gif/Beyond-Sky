'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate, toInputDate, installmentStatusBadgeClass } from '@/lib/utils'
import {
  CreditCard,
  Loader2,
  Smartphone,
  Banknote,
  CheckCircle2,
  AlertCircle,
  UsersRound,
  User,
  FileSpreadsheet,
} from 'lucide-react'

export interface ActiveClientLoan {
  id: string
  loan_number: string
  principal: number
  total_repayable: number
  weekly_installment: number
  outstanding_balance: number
  client: {
    id: string
    account_number: string
    full_name: string
    phone_number: string
    market_location: string
  }
  schedule: Array<{
    id: string
    installment_number: number
    due_date: string
    expected_amount: number
    paid_amount: number
    balance: number
    status: string
  }>
}

export interface ActiveGroupSummary {
  id: string
  group_number: string
  name: string
  meeting_day?: string
  meeting_place?: string
  loans: ActiveClientLoan[]
}

export function RepaymentForm({
  activeLoans,
  activeGroups = [],
}: {
  activeLoans: ActiveClientLoan[]
  activeGroups?: ActiveGroupSummary[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialClientId = searchParams.get('clientId') || ''
  const initialGroupId = searchParams.get('groupId') || ''

  // ==========================================
  // TAB 1: INDIVIDUAL LOAN REPAYMENT STATE
  // ==========================================
  const defaultLoan = activeLoans.find((l) => l.client.id === initialClientId) || activeLoans[0]

  const [selectedLoanId, setSelectedLoanId] = useState<string>(defaultLoan?.id || '')
  const [amount, setAmount] = useState<number>(defaultLoan?.weekly_installment || 0)
  const [method, setMethod] = useState<'cash' | 'momo'>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [transactionDate, setTransactionDate] = useState(toInputDate(new Date()))
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const currentLoan = activeLoans.find((l) => l.id === selectedLoanId)

  // Update default amount when selected loan changes
  const handleLoanChange = (loanId: string) => {
    setSelectedLoanId(loanId)
    const found = activeLoans.find((l) => l.id === loanId)
    if (found) {
      setAmount(found.weekly_installment)
    }
  }

  // FIFO Live Preview Calculation
  const simulateFifoApplication = () => {
    if (!currentLoan?.schedule) return []
    let rem = Number(amount) || 0

    return currentLoan.schedule.map((row) => {
      if (row.status === 'paid' || rem <= 0) {
        return { ...row, simApplied: 0, simNewPaid: row.paid_amount, simNewStatus: row.status }
      }
      const due = Number(row.expected_amount) - Number(row.paid_amount)
      const apply = Math.min(rem, due)
      const newPaid = Number(row.paid_amount) + apply
      rem -= apply
      const newStatus = newPaid >= Number(row.expected_amount) ? 'paid' : newPaid > 0 ? 'partially_paid' : row.status
      return { ...row, simApplied: apply, simNewPaid: newPaid, simNewStatus: newStatus }
    })
  }

  const simulatedSchedule = simulateFifoApplication()

  const handleIndividualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentLoan) {
      toast({ title: 'Select Loan', description: 'Please select an active client loan', variant: 'destructive' })
      return
    }

    if (amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Repayment amount must be greater than 0', variant: 'destructive' })
      return
    }

    if (method === 'momo' && !momoReference.trim()) {
      toast({ title: 'MoMo Ref Required', description: 'Please provide the MoMo reference number', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/repayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: currentLoan.id,
          amount,
          method,
          momoReference: method === 'momo' ? momoReference : null,
          transactionDate,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to record repayment')
      }

      toast({
        title: 'Repayment Successful',
        description: `GHS ${Number(amount).toFixed(2)} recorded for ${currentLoan.client.full_name}. Confirmation SMS queued.`,
        variant: 'success',
      })

      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Transaction Failed',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // TAB 2: GROUP 13-WEEK BATCH COLLECTION STATE
  // ==========================================
  const defaultGroup = activeGroups.find((g) => g.id === initialGroupId) || activeGroups[0]
  const [selectedGroupId, setSelectedGroupId] = useState<string>(defaultGroup?.id || '')
  const [groupWeekNumber, setGroupWeekNumber] = useState<number>(1)
  const [groupTxDate, setGroupTxDate] = useState(toInputDate(new Date()))
  const [groupPayMethod, setGroupPayMethod] = useState<'cash' | 'momo'>('cash')
  const [groupMomoRef, setGroupMomoRef] = useState('')
  const [groupMemberAmounts, setGroupMemberAmounts] = useState<Record<string, number>>({})
  const [batchLoading, setBatchLoading] = useState(false)

  const currentGroup = activeGroups.find((g) => g.id === selectedGroupId)

  // Initialize group member amounts when group or week changes
  const initGroupAmounts = (group: ActiveGroupSummary | undefined, week: number) => {
    if (!group) return
    const amounts: Record<string, number> = {}
    group.loans.forEach((loan) => {
      const inst = loan.schedule.find((s) => s.installment_number === week)
      const due = inst ? Math.max(0, inst.expected_amount - inst.paid_amount) : loan.weekly_installment
      amounts[loan.id] = due > 0 ? due : loan.weekly_installment
    })
    setGroupMemberAmounts(amounts)
  }

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId)
    const grp = activeGroups.find((g) => g.id === groupId)
    initGroupAmounts(grp, groupWeekNumber)
  }

  const handleWeekSelect = (weekNum: number) => {
    setGroupWeekNumber(weekNum)
    initGroupAmounts(currentGroup, weekNum)
  }

  const handleMemberAmountChange = (loanId: string, val: string) => {
    const num = parseFloat(val)
    setGroupMemberAmounts((prev) => ({
      ...prev,
      [loanId]: isNaN(num) ? 0 : num,
    }))
  }

  const totalGroupBatchAmount = Object.values(groupMemberAmounts).reduce((acc, curr) => acc + (curr || 0), 0)

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentGroup) {
      toast({ title: 'Select Group', description: 'Please select an active group', variant: 'destructive' })
      return
    }

    if (groupPayMethod === 'momo' && !groupMomoRef.trim()) {
      toast({ title: 'MoMo Ref Required', description: 'Please provide the batch MoMo reference number', variant: 'destructive' })
      return
    }

    const payload = Object.entries(groupMemberAmounts)
      .filter(([_, amt]) => amt > 0)
      .map(([loanId, amt]) => ({
        loanId,
        amount: amt,
        method: groupPayMethod,
        momoReference: groupPayMethod === 'momo' ? groupMomoRef : undefined,
      }))

    if (payload.length === 0) {
      toast({ title: 'No amounts', description: 'Please enter amounts for at least one member', variant: 'destructive' })
      return
    }

    setBatchLoading(true)

    try {
      const res = await fetch('/api/repayments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repayments: payload,
          transactionDate: groupTxDate,
          defaultMethod: groupPayMethod,
          groupId: currentGroup.id,
          groupName: currentGroup.name,
          weekNumber: groupWeekNumber,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record batch collection')

      toast({
        title: 'Group Collection Recorded!',
        description: `Successfully collected ${formatCurrency(data.summary.totalAmount)} across ${data.summary.successCount} members for Week ${groupWeekNumber}.`,
        variant: 'success',
      })

      router.refresh()
    } catch (err: any) {
      toast({ title: 'Batch Error', description: err.message, variant: 'destructive' })
    } finally {
      setBatchLoading(false)
    }
  }

  return (
    <Tabs defaultValue={initialGroupId ? 'group' : 'individual'} className="space-y-6">
      <TabsList className="bg-gray-100 p-1 rounded-xl">
        <TabsTrigger value="individual" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
          <User className="h-4 w-4 text-blue-600" />
          Individual Client Repayment
        </TabsTrigger>
        <TabsTrigger value="group" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs">
          <UsersRound className="h-4 w-4 text-purple-600" />
          13-Week Group Batch Collection ({activeGroups.length} Groups)
        </TabsTrigger>
      </TabsList>

      {/* ============================================================ */}
      {/* TAB 1: INDIVIDUAL REPAYMENT */}
      {/* ============================================================ */}
      <TabsContent value="individual" className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                  Record Repayment
                </CardTitle>
                <CardDescription>
                  Enter repayment details for automatic FIFO allocation to schedule
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleIndividualSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="loanSelect">Select Active Client Loan *</Label>
                    <select
                      id="loanSelect"
                      value={selectedLoanId}
                      onChange={(e) => handleLoanChange(e.target.value)}
                      className="w-full text-xs font-mono border rounded-md px-3 py-2 bg-white"
                      required
                    >
                      {activeLoans.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.client.full_name} — {l.loan_number} (Bal: {formatCurrency(l.outstanding_balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Repayment Amount (GHS) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="1"
                      value={amount || ''}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      required
                      className="text-lg font-bold font-mono text-blue-900"
                    />
                    {currentLoan && (
                      <p className="text-[11px] text-gray-500">
                        Standard weekly installment: <strong>{formatCurrency(currentLoan.weekly_installment)}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="txDate">Transaction Date *</Label>
                    <Input
                      id="txDate"
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Payment Method *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={method === 'cash' ? 'default' : 'outline'}
                        className={`text-xs gap-1.5 ${method === 'cash' ? 'bg-emerald-700 hover:bg-emerald-800' : ''}`}
                        onClick={() => setMethod('cash')}
                      >
                        <Banknote className="h-4 w-4" /> Cash
                      </Button>
                      <Button
                        type="button"
                        variant={method === 'momo' ? 'default' : 'outline'}
                        className={`text-xs gap-1.5 ${method === 'momo' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                        onClick={() => setMethod('momo')}
                      >
                        <Smartphone className="h-4 w-4" /> MoMo
                      </Button>
                    </div>
                  </div>

                  {method === 'momo' && (
                    <div className="space-y-1.5 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <Label htmlFor="momoReference" className="text-amber-900 text-xs font-bold">
                        MoMo Transaction Reference *
                      </Label>
                      <Input
                        id="momoReference"
                        placeholder="e.g. 24890123910"
                        value={momoReference}
                        onChange={(e) => setMomoReference(e.target.value)}
                        required
                        className="bg-white font-mono"
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !currentLoan}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold pt-2.5 pb-2.5"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Posting Transaction...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Confirm Repayment ({formatCurrency(amount)})
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {currentLoan ? (
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{currentLoan.client.full_name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        A/C: {currentLoan.client.account_number} • Loan: {currentLoan.loan_number}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 font-medium">Outstanding Balance</p>
                      <p className="text-xl font-bold font-mono text-red-600">
                        {formatCurrency(currentLoan.outstanding_balance)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-gray-50">
                        <TableRow className="text-xs">
                          <TableHead className="w-12 text-center">Wk #</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Current Paid</TableHead>
                          <TableHead className="text-right bg-blue-50/50 text-blue-900 font-bold">
                            Live Simulation
                          </TableHead>
                          <TableHead className="text-center">New Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <tbody className="divide-y text-xs font-mono">
                        {simulatedSchedule.map((row) => (
                          <TableRow
                            key={row.id}
                            className={row.simApplied > 0 ? 'bg-blue-50/30 font-medium' : ''}
                          >
                            <td className="p-2.5 text-center font-bold text-gray-500">
                              {row.installment_number}
                            </td>
                            <td className="p-2.5 font-sans">{formatDate(row.due_date)}</td>
                            <td className="p-2.5 text-right">{formatCurrency(row.expected_amount)}</td>
                            <td className="p-2.5 text-right text-gray-600">
                              {formatCurrency(row.paid_amount)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-blue-700 bg-blue-50/40">
                              {row.simApplied > 0 ? `+${formatCurrency(row.simApplied)}` : '—'}
                            </td>
                            <td className="p-2.5 text-center font-sans">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${installmentStatusBadgeClass(
                                  row.simNewStatus
                                )}`}
                              >
                                {row.simNewStatus.replace('_', ' ')}
                              </span>
                            </td>
                          </TableRow>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-12 text-center text-gray-400 border-2 border-dashed rounded-xl">
                No active loan selected
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ============================================================ */}
      {/* TAB 2: GROUP 13-WEEK BATCH COLLECTION */}
      {/* ============================================================ */}
      <TabsContent value="group" className="space-y-6">
        {activeGroups.length === 0 ? (
          <Card className="p-12 text-center text-gray-500">
            <UsersRound className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <h3 className="text-base font-bold text-gray-900">No Active Solidarity Groups</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Create solidarity groups and attach member credit facilities to use the fast 13-week batch collection workflow.
            </p>
          </Card>
        ) : (
          <form onSubmit={handleBatchSubmit} className="space-y-6">
            {/* Group Selection Controls */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                  Select Group & Collection Week
                </CardTitle>
                <CardDescription>
                  Pre-populates expected weekly installments for all 5 group members with instant 1-click batch posting
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="grpSelect">Solidarity Group *</Label>
                  <select
                    id="grpSelect"
                    value={selectedGroupId}
                    onChange={(e) => handleGroupSelect(e.target.value)}
                    className="w-full text-xs font-bold border rounded-md px-3 py-2 bg-white"
                    required
                  >
                    {activeGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.group_number}) — {g.loans.length} Active Loans
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="weekNum">Collection Week (1 to 13) *</Label>
                  <select
                    id="weekNum"
                    value={groupWeekNumber}
                    onChange={(e) => handleWeekSelect(parseInt(e.target.value, 10))}
                    className="w-full text-xs font-bold border rounded-md px-3 py-2 bg-white"
                  >
                    {Array.from({ length: 13 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Week {i + 1} (Installment #{i + 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="grpDate">Collection Date *</Label>
                  <Input
                    id="grpDate"
                    type="date"
                    value={groupTxDate}
                    onChange={(e) => setGroupTxDate(e.target.value)}
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Payment Method *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={groupPayMethod === 'cash' ? 'default' : 'outline'}
                      className={`text-xs gap-1 h-9 ${groupPayMethod === 'cash' ? 'bg-emerald-700 hover:bg-emerald-800' : ''}`}
                      onClick={() => setGroupPayMethod('cash')}
                    >
                      <Banknote className="h-3.5 w-3.5" /> Cash
                    </Button>
                    <Button
                      type="button"
                      variant={groupPayMethod === 'momo' ? 'default' : 'outline'}
                      className={`text-xs gap-1 h-9 ${groupPayMethod === 'momo' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                      onClick={() => setGroupPayMethod('momo')}
                    >
                      <Smartphone className="h-3.5 w-3.5" /> MoMo
                    </Button>
                  </div>
                </div>

                {groupPayMethod === 'momo' && (
                  <div className="lg:col-span-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <Label htmlFor="grpMomoRef" className="text-xs font-bold text-amber-900">
                      MoMo Batch Transaction Reference Number *
                    </Label>
                    <Input
                      id="grpMomoRef"
                      placeholder="e.g. MM-202610-GROUP1-WK3"
                      value={groupMomoRef}
                      onChange={(e) => setGroupMomoRef(e.target.value)}
                      required
                      className="bg-white text-xs mt-1 font-mono"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Member Collection Matrix Table */}
            {currentGroup && (
              <Card className="shadow-sm overflow-hidden">
                <CardHeader className="bg-gray-50/70 border-b pb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-sm font-bold text-gray-900">
                        {currentGroup.name} — Week {groupWeekNumber} Member Roster
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Adjust individual amounts if any member underpaid or overpaid
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500 font-medium">Group Total Collecting:</span>
                      <span className="text-lg font-black font-mono text-blue-900 ml-2">
                        {formatCurrency(totalGroupBatchAmount)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-gray-100 text-xs">
                      <TableRow>
                        <TableHead className="w-10 text-center">S/N</TableHead>
                        <TableHead>Member Name & Account</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Total Loan</TableHead>
                        <TableHead className="text-right">Expected Wk {groupWeekNumber}</TableHead>
                        <TableHead className="text-right w-44 bg-blue-50/50 text-blue-900 font-bold">
                          Amount Collecting (GHS)
                        </TableHead>
                        <TableHead className="text-right">Current Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <tbody className="divide-y text-xs font-mono">
                      {currentGroup.loans.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-gray-400 font-sans">
                            No active loans attached to members of this group.
                          </td>
                        </tr>
                      ) : (
                        currentGroup.loans.map((loan, idx) => {
                          const amt = groupMemberAmounts[loan.id] ?? loan.weekly_installment
                          const inst = loan.schedule.find((s) => s.installment_number === groupWeekNumber)

                          return (
                            <TableRow key={loan.id} className="hover:bg-blue-50/20">
                              <td className="p-3 text-center font-bold text-gray-500">{idx + 1}</td>
                              <td className="p-3 font-sans">
                                <p className="font-bold text-gray-900">{loan.client.full_name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">
                                  {loan.client.account_number} • {loan.loan_number}
                                </p>
                              </td>
                              <td className="p-3 text-right font-medium text-gray-700">
                                {formatCurrency(loan.principal)}
                              </td>
                              <td className="p-3 text-right font-bold text-blue-900">
                                {formatCurrency(loan.total_repayable)}
                              </td>
                              <td className="p-3 text-right font-bold text-gray-700">
                                {formatCurrency(inst?.expected_amount || loan.weekly_installment)}
                              </td>
                              <td className="p-3 text-right bg-blue-50/30">
                                <Input
                                  type="number"
                                  step="0.50"
                                  value={amt}
                                  onChange={(e) => handleMemberAmountChange(loan.id, e.target.value)}
                                  className="h-8 text-xs font-mono font-bold text-right w-36 ml-auto border-blue-300"
                                />
                              </td>
                              <td className="p-3 text-right font-bold text-amber-800">
                                {formatCurrency(loan.outstanding_balance)}
                              </td>
                            </TableRow>
                          )
                        })
                      )}
                    </tbody>
                  </Table>

                  <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-xs text-gray-500">
                      FIFO repayments posted to member ledgers; SMS confirmations sent.
                    </div>

                    <Button
                      type="submit"
                      disabled={batchLoading || totalGroupBatchAmount <= 0}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold min-w-[220px]"
                    >
                      {batchLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Posting Group Batch...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Record Collection ({formatCurrency(totalGroupBatchAmount)})
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        )}
      </TabsContent>
    </Tabs>
  )
}
