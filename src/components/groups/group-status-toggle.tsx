'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import {
  Activity, Archive, Loader2, Printer, CheckCircle2, PauseCircle,
  Ban, XCircle, Sprout, AlertTriangle,
} from 'lucide-react'

type GroupStatus = 'active' | 'inactive' | 'suspended' | 'dissolved' | 'forming'

const STATUS_OPTIONS: Array<{
  value: GroupStatus
  label: string
  description: string
  icon: typeof CheckCircle2
  className: string
}> = [
  {
    value: 'active',
    label: 'Active',
    description: 'Group is operating normally and eligible for loans.',
    icon: CheckCircle2,
    className: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    description: 'Group is paused — no new loans until reactivated.',
    icon: PauseCircle,
    className: 'text-gray-700 border-gray-200 bg-gray-50',
  },
  {
    value: 'suspended',
    label: 'Suspended',
    description: 'Disciplinary pause due to defaults or rule violations.',
    icon: Ban,
    className: 'text-amber-700 border-amber-200 bg-amber-50',
  },
  {
    value: 'dissolved',
    label: 'Dissolved',
    description: 'Group is permanently closed. A reason is required.',
    icon: XCircle,
    className: 'text-red-700 border-red-200 bg-red-50',
  },
  {
    value: 'forming',
    label: 'Forming',
    description: 'Group is still being constituted and vetted.',
    icon: Sprout,
    className: 'text-blue-700 border-blue-200 bg-blue-50',
  },
]

export { groupStatusBadgeClass } from '@/lib/group-status'

interface GroupStatusToggleProps {
  groupId: string
  groupName: string
  currentStatus: string
}

export function GroupStatusToggle({ groupId, groupName, currentStatus }: GroupStatusToggleProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<GroupStatus | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const openDialog = () => {
    setSelected(null)
    setReason('')
    setOpen(true)
  }

  const handleConfirm = async () => {
    if (!selected || selected === currentStatus) return
    if (selected === 'dissolved' && !reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'A dissolution reason must be recorded for the audit trail.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selected,
          ...(selected === 'dissolved' ? { dissolution_reason: reason.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to change group status')

      toast({
        title: 'Status Updated',
        description: `${groupName} is now "${selected}".`,
        variant: 'success',
      })
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot change status', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const selectedOption = selected ? STATUS_OPTIONS.find((o) => o.value === selected) : null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 text-gray-600 hover:text-blue-700 hover:border-blue-200"
        onClick={openDialog}
      >
        <Activity className="h-3.5 w-3.5" />
        Change Status
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              Change Group Status
            </DialogTitle>
            <DialogDescription>
              Current status: <strong className="capitalize">{currentStatus}</strong>. Status changes
              affect loan eligibility for every member of {groupName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-1">
            {STATUS_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isCurrent = opt.value === currentStatus
              const isSelected = selected === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    setSelected(opt.value)
                    setReason('')
                  }}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  } ${isCurrent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`mt-0.5 rounded-full border p-1.5 ${opt.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-900">
                      {opt.label}
                      {isCurrent && (
                        <span className="ml-2 text-[10px] font-medium text-gray-400">(current)</span>
                      )}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">{opt.description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {selected === 'dissolved' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Dissolution is permanent. A reason is required.
              </div>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. All members graduated; group voted to dissolve on 12/03/2026..."
                className="text-sm"
                autoFocus
              />
            </div>
          )}

          {selectedOption && selectedOption.value !== 'dissolved' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
              Confirm change from <strong className="capitalize">{currentStatus}</strong> to{' '}
              <strong>{selectedOption.label}</strong>?
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selected || selected === currentStatus || loading}
              className={
                selected === 'dissolved'
                  ? 'bg-red-600 hover:bg-red-700 text-white min-w-[130px]'
                  : 'bg-blue-600 hover:bg-blue-700 min-w-[130px]'
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm Change'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface GroupArchiveButtonProps {
  groupId: string
  groupName: string
  isArchived: boolean
}

/** Soft-archive / restore via DELETE /api/groups/[id] (archive) — restore uses PATCH status. */
export function GroupArchiveButton({ groupId, groupName, isArchived }: GroupArchiveButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleArchive = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to archive group')

      toast({
        title: 'Group Archived',
        description: `${groupName} was soft-archived and hidden from the active directory.`,
        variant: 'success',
      })
      setConfirmOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot archive group', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (isArchived) {
    return (
      <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
        <Archive className="h-3.5 w-3.5" />
        Archived
      </span>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 text-gray-600 hover:text-red-600 hover:border-red-200"
        onClick={() => setConfirmOpen(true)}
      >
        <Archive className="h-3.5 w-3.5" />
        Archive
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Archive className="h-4 w-4" />
              Archive {groupName}?
            </DialogTitle>
            <DialogDescription>
              Archive {groupName}? It will be hidden from active workflows.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={loading}
              className="min-w-[120px]"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              Archive Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Simple print trigger button (client component so onClick works in the server page). */
export function GroupPrintButton() {
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      Print
    </Button>
  )
}
