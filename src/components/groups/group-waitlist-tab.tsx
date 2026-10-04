'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { formatDate } from '@/lib/utils'
import {
  ListPlus, Loader2, Trash2, UserPlus, ArrowUpNarrowWide, Users,
} from 'lucide-react'

export interface WaitlistClientInfo {
  id: string
  account_number: string
  full_name: string
  phone_number: string | null
  business_type: string | null
}

export interface WaitlistEntryRow {
  id: string
  client_id: string
  priority: number
  date_added: string
  notes: string | null
  status: string
  clients?: WaitlistClientInfo | null
}

export interface WaitlistCandidateClient {
  id: string
  account_number: string
  full_name: string
  business_type: string | null
}

interface GroupWaitlistTabProps {
  groupId: string
  groupName: string
  entries: WaitlistEntryRow[]
  /** active clients not already in this group and not already queued */
  candidates: WaitlistCandidateClient[]
  slotsRemaining: number
  canManage: boolean
}

export function GroupWaitlistTab({
  groupId,
  groupName,
  entries,
  candidates,
  slotsRemaining,
  canManage,
}: GroupWaitlistTabProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState('')
  const [priority, setPriority] = useState('1')
  const [notes, setNotes] = useState('')

  const [removeTarget, setRemoveTarget] = useState<WaitlistEntryRow | null>(null)
  const [removing, setRemoving] = useState(false)

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return new Date(a.date_added).getTime() - new Date(b.date_added).getTime()
      }),
    [entries]
  )

  const queuedIds = useMemo(() => entries.map((e) => e.client_id), [entries])
  const availableCandidates = useMemo(
    () => candidates.filter((c) => !queuedIds.includes(c.id)),
    [candidates, queuedIds]
  )

  const handleAdd = async () => {
    if (!clientId) return
    const prio = parseInt(priority, 10)
    if (Number.isNaN(prio) || prio < 1 || prio > 99) {
      toast({
        title: 'Invalid priority',
        description: 'Priority must be a number between 1 and 99.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          priority: prio,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to add to waitlist')

      const name = availableCandidates.find((c) => c.id === clientId)?.full_name ?? 'Client'
      toast({
        title: 'Queued on Waitlist',
        description: `${name} was added at priority ${prio}.`,
        variant: 'success',
      })
      setDialogOpen(false)
      setClientId('')
      setPriority('1')
      setNotes('')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot add to waitlist', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/waitlist?entryId=${removeTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to remove waitlist entry')

      toast({ title: 'Removed from Waitlist', variant: 'success' })
      setRemoveTarget(null)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot remove entry', description: err.message, variant: 'destructive' })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4 print:hidden">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-blue-600" />
            Group Waitlist ({sortedEntries.length})
          </h3>
          <p className="text-xs text-gray-500">
            Clients queued for the next opening in {groupName} · {slotsRemaining} slot
            {slotsRemaining === 1 ? '' : 's'} currently free.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={availableCandidates.length === 0}
            className="bg-blue-600 hover:bg-blue-700 h-9 text-xs"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add to Waitlist
          </Button>
        )}
      </div>

      {/* List */}
      {sortedEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <h4 className="mt-3 text-sm font-semibold text-gray-900">Waitlist is empty</h4>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            Queue eligible clients now so the next vacancy is filled instantly without a fresh
            search.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {sortedEntries.map((entry, idx) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-black text-blue-700 border border-blue-100">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/clients/${entry.client_id}`}
                        className="truncate text-sm font-semibold text-blue-600 hover:underline"
                      >
                        {entry.clients?.full_name ?? 'Unknown client'}
                      </Link>
                      {entry.clients?.account_number && (
                        <span className="font-mono text-[11px] text-gray-400">
                          {entry.clients.account_number}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <ArrowUpNarrowWide className="h-2.5 w-2.5" />
                        Priority {entry.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Added {formatDate(entry.date_added)}
                      {entry.clients?.business_type ? ` · ${entry.clients.business_type}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setRemoveTarget(entry)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Add dialog ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-4 w-4 text-blue-600" />
              Add to Waitlist — {groupName}
            </DialogTitle>
            <DialogDescription>
              Queue an eligible, unassigned client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="wl-client">
                Client *
              </label>
              <select
                id="wl-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose a client --</option>
                {availableCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.account_number} — {c.full_name}
                    {c.business_type ? ` (${c.business_type})` : ''}
                  </option>
                ))}
              </select>
              {availableCandidates.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No eligible unassigned clients — everyone is already a member or queued.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="wl-priority">
                Priority (higher = promoted first)
              </label>
              <Input
                id="wl-priority"
                type="number"
                min={1}
                max={99}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="wl-notes">
                Notes (optional)
              </label>
              <Input
                id="wl-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Referred by group leader; attends meetings as observer"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!clientId || saving}
              className="bg-blue-600 hover:bg-blue-700 min-w-[130px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Queuing...
                </>
              ) : (
                'Add to Waitlist'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Remove confirmation ---------- */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" />
              Remove from Waitlist?
            </DialogTitle>
            <DialogDescription>
              {removeTarget?.clients?.full_name ?? 'This client'} will lose their queue position for{' '}
              {groupName}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing} className="min-w-[110px]">
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
