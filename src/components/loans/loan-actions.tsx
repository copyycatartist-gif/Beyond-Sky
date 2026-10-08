'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { computeDeductions, computeNetDisbursement, round2, MONTHLY_INTEREST_RATES } from '@/lib/loans/calculations'
import { CheckCircle2, XCircle, Banknote, Loader2 } from 'lucide-react'

type ActionKind = 'approve' | 'reject' | 'disburse' | null

export function LoanActions({
  loan,
  userRole,
  oldLoanBalance = 0,
}: {
  loan: {
    id: string
    loan_number: string
    principal: number
    fee_amount: number
    total_repayable: number
    weekly_installment: number
    status: string
    payment_frequency?: string | null
    interest_rate?: number | null
    previous_loan_id?: string | null
    total_deductions?: number | null
    security_deposit_amount?: number | null
    processing_fee_amount?: number | null
    loan_risk_fund_amount?: number | null
    net_disbursement_amount?: number | null
  }
  userRole: string
  oldLoanBalance?: number
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [loadingAction, setLoadingAction] = useState<ActionKind>(null)

  // Modals
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [disburseModalOpen, setDisburseModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'momo'>('cash')
  const [momoReference, setMomoReference] = useState('')
  const [approvedRate, setApprovedRate] = useState<number>(Number(loan.interest_rate) || 0.1)
  const isMonthly = loan.payment_frequency === 'monthly'

  const isManagerOrAdmin = userRole === 'manager' || userRole === 'accountant_admin'
  const isBusy = loadingAction !== null

  // ---- Preview math: shared loan calculations (matches the disburse_loan RPC) ----
  const breakdown = computeDeductions(loan.principal)
  // Authoritative deductions: the stored 12% total_deductions on the loan; fall
  // back to the computed schedule when the column is absent (legacy rows).
  const totalDeductions =
    loan.total_deductions != null ? round2(Number(loan.total_deductions)) : breakdown.totalDeductions
  const netToClient = computeNetDisbursement({
    principal: loan.principal,
    totalDeductions,
    refinanceBalance: oldLoanBalance,
  })

  // Map a failed fetch response to a specific toast
  const showErrorToast = (title: string, status: number, message: string) => {
    if (status === 409) {
      toast({ title: 'Already Processed', description: message, variant: 'warning' })
    } else if (status === 429) {
      toast({ title: 'Too Many Requests', description: message, variant: 'warning' })
    } else if (status === 401 || status === 403) {
      toast({ title: 'Permission Denied', description: message, variant: 'destructive' })
    } else {
      toast({ title, description: message, variant: 'destructive' })
    }
  }

  // Handle Approve
  const handleApprove = async () => {
    setLoadingAction('approve')
    try {
      const res = await fetch('/api/loans/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: loan.id,
          action: 'approve',
          interestRate: isMonthly ? approvedRate : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        showErrorToast('Approval Failed', res.status, data.error || 'Failed to approve loan')
        return
      }

      setApproveModalOpen(false)
      toast({ title: 'Loan Approved', description: data.message, variant: 'success' })
      router.refresh()
    } catch (err: any) {
      showErrorToast('Approval Failed', 0, err.message || 'Network error')
    } finally {
      setLoadingAction(null)
    }
  }

  // Handle Reject
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({ title: 'Reason Required', description: 'Rejection reason is mandatory', variant: 'destructive' })
      return
    }

    setLoadingAction('reject')
    try {
      const res = await fetch('/api/loans/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: loan.id,
          action: 'reject',
          rejectionReason: rejectionReason.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        showErrorToast('Rejection Failed', res.status, data.error || 'Failed to reject loan')
        return
      }

      setRejectModalOpen(false)
      toast({ title: 'Loan Rejected', description: data.message, variant: 'success' })
      router.refresh()
    } catch (err: any) {
      showErrorToast('Rejection Failed', 0, err.message || 'Network error')
    } finally {
      setLoadingAction(null)
    }
  }

  // Handle Disburse
  const handleDisburse = async () => {
    if (paymentMethod === 'momo' && !momoReference.trim()) {
      toast({ title: 'MoMo Reference Required', description: 'Please provide the transaction reference', variant: 'destructive' })
      return
    }

    setLoadingAction('disburse')
    try {
      const res = await fetch('/api/loans/disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: loan.id,
          paymentMethod,
          momoReference: paymentMethod === 'momo' ? momoReference.trim() : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        showErrorToast('Disbursement Failed', res.status, data.error || 'Failed to disburse loan')
        return
      }

      const net = data.netDisbursed != null ? formatCurrency(Number(data.netDisbursed)) : formatCurrency(netToClient)
      setDisburseModalOpen(false)
      toast({
        title: 'Loan Disbursed',
        description: `${data.message || 'Disbursement successful'} Net cash to client: ${net}.`,
        variant: 'success',
      })
      router.refresh()
    } catch (err: any) {
      showErrorToast('Disbursement Failed', 0, err.message || 'Network error')
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 1. Pending Approval actions for Manager */}
      {loan.status === 'pending' && isManagerOrAdmin && (
        <>
          <Button
            onClick={() => setApproveModalOpen(true)}
            disabled={isBusy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Approve Application
          </Button>

          <Button
            variant="outline"
            onClick={() => setRejectModalOpen(true)}
            disabled={isBusy}
            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold"
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Reject with Reason
          </Button>
        </>
      )}

      {/* 2. Approved -> Disburse action for Manager */}
      {loan.status === 'approved' && isManagerOrAdmin && (
        <Button
          onClick={() => setDisburseModalOpen(true)}
          disabled={isBusy}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md"
        >
          <Banknote className="h-4 w-4 mr-1.5" />
          Authorize Disbursement
        </Button>
      )}

      {/* Approve Modal */}
      <Dialog open={approveModalOpen} onOpenChange={(open) => !isBusy && setApproveModalOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Loan Application {loan.loan_number}</DialogTitle>
            <DialogDescription>
              Approve{' '}
              <span className="font-semibold text-gray-900">{formatCurrency(loan.principal)}</span>{' '}
              with {isMonthly ? 'monthly' : 'weekly'} installments of{' '}
              <span className="font-semibold text-gray-900">{formatCurrency(loan.weekly_installment)}</span>{' '}
              — the client is notified by SMS.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-2 text-sm">
            {isMonthly && (
              <div className="space-y-1.5">
                <Label htmlFor="approvedRate">Approved interest rate</Label>
                <select
                  id="approvedRate"
                  value={approvedRate}
                  onChange={(e) => setApprovedRate(parseFloat(e.target.value))}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  {MONTHLY_INTEREST_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {Math.round(rate * 100)}%{rate === Number(loan.interest_rate) ? ' (requested)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500">Change this if the requested rate does not fit the client.</p>
              </div>
            )}
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Principal:</span>
                <span className="font-bold text-gray-900">{formatCurrency(loan.principal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Repayable:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(loan.total_repayable)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveModalOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isBusy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loadingAction === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={(open) => !isBusy && setRejectModalOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Loan Application {loan.loan_number}</DialogTitle>
            <DialogDescription>
              Please enter a clear mandatory reason for rejecting this micro-loan application.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-2">
            <Label htmlFor="rejectionReason">Reason for Rejection *</Label>
            <textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Insufficient declared cashflow to meet weekly installment threshold..."
              rows={3}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModalOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isBusy || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {loadingAction === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disburse Modal */}
      <Dialog open={disburseModalOpen} onOpenChange={(open) => !isBusy && setDisburseModalOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disburse Loan {loan.loan_number}</DialogTitle>
            <DialogDescription>
              Confirm funds transfer and ledger posting for this loan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Gross Principal:</span>
                <span className="font-bold text-gray-900">{formatCurrency(loan.principal)}</span>
              </div>
              <div className="flex justify-between text-amber-700 font-medium">
                <span>10% Security Deposit (Collateral):</span>
                <span>−{formatCurrency(breakdown.securityDepositAmount)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>1% Processing Fee:</span>
                <span>−{formatCurrency(breakdown.processingFeeAmount)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>1% Loan Risk Fund:</span>
                <span>−{formatCurrency(breakdown.loanRiskFundAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-700">
                <span>Total Deductions (12%):</span>
                <span>−{formatCurrency(totalDeductions)}</span>
              </div>
              {oldLoanBalance > 0 && (
                <div className="flex justify-between text-purple-700 font-medium">
                  <span>Refinanced Loan Netting:</span>
                  <span>−{formatCurrency(oldLoanBalance)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-300 font-bold text-sm text-emerald-700">
                <span>Net Cash Disbursed to Client (88%):</span>
                <span>{formatCurrency(netToClient)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="method">Payment Method *</Label>
              <select
                id="method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                disabled={isBusy}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="momo">Mobile Money (MoMo)</option>
              </select>
            </div>

            {paymentMethod === 'momo' && (
              <div className="space-y-1.5">
                <Label htmlFor="momoRef">MoMo Transaction Reference ID *</Label>
                <Input
                  id="momoRef"
                  value={momoReference}
                  onChange={(e) => setMomoReference(e.target.value)}
                  placeholder="e.g. MTN-20260929-881920"
                  disabled={isBusy}
                  required
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDisburseModalOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              onClick={handleDisburse}
              disabled={isBusy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loadingAction === 'disburse' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Banknote className="h-4 w-4 mr-1.5" />
              )}
              Confirm &amp; Disburse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
