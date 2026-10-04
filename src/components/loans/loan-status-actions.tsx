'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'

const MANAGER_ROLES = ['manager', 'supervisor', 'accountant_admin']

type TargetStatus = 'closed' | 'defaulted'

interface LoanStatusActionsProps {
  loanId: string
  loanNumber: string
  status: string
  userRole: string
}

/**
 * Manager-only status actions for an ACTIVE loan: Close Loan and Mark
 * Defaulted. Each opens a modal requiring a reason, then POSTs to
 * /api/loans/[id]/status (migration-026 state machine enforces legality).
 */
export function LoanStatusActions({
  loanId,
  loanNumber,
  status,
  userRole,
}: LoanStatusActionsProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [openTarget, setOpenTarget] = React.useState<TargetStatus | null>(null)
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  if (!MANAGER_ROLES.includes(userRole) || status !== 'active') return null

  const closeDialog = () => {
    if (submitting) return
    setOpenTarget(null)
    setReason('')
  }

  const handleSubmit = async () => {
    if (!openTarget || submitting) return
    const trimmed = reason.trim()
    if (!trimmed) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason for this status change.',
        variant: 'warning',
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: openTarget, reason: trimmed }),
      })
      const data = await res.json()

      if (!res.ok || !data?.success) {
        toast({
          title: 'Status change failed',
          description: data?.error || `Could not mark ${loanNumber} as ${openTarget}.`,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: `Loan ${openTarget === 'closed' ? 'closed' : 'marked defaulted'}`,
        description: `${loanNumber} — ${data.message || 'Status updated.'}`,
        variant: 'success',
      })
      setOpenTarget(null)
      setReason('')
      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Network error',
        description: err?.message || 'Could not reach the server.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const isClose = openTarget === 'closed'

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 gap-1.5"
          onClick={() => setOpenTarget('closed')}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Close Loan
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs font-semibold text-rose-700 border-rose-300 hover:bg-rose-50 gap-1.5"
          onClick={() => setOpenTarget('defaulted')}
        >
          <XCircle className="h-3.5 w-3.5" />
          Mark Defaulted
        </Button>
      </div>

      <Dialog open={openTarget !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {isClose ? `Close loan ${loanNumber}?` : `Mark ${loanNumber} as defaulted?`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isClose
                ? 'Closing finalises the loan account — a reason is mandatory.'
                : 'Flagging as defaulted records escalated collections — a reason is mandatory.'}
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for status change…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={submitting}
          />

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
              className={
                isClose
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {isClose ? 'Close Loan' : 'Mark Defaulted'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
