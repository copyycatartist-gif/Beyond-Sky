'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Printer, Archive, ArchiveRestore, Loader2 } from 'lucide-react'

export function GroupPrintButton() {
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" />
      Print
    </Button>
  )
}

export function GroupArchiveButton({
  groupId,
  groupName,
  archived,
  archivedAt,
}: {
  groupId: string
  groupName: string
  archived: boolean
  archivedAt?: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({ title: 'Action failed', description: data.error || 'Could not update archive state.', variant: 'destructive' })
        return
      }

      toast({
        title: archived ? 'Group restored' : 'Group archived',
        description: archived
          ? `${groupName} is no longer archived.`
          : `${groupName} has been archived and marked inactive.`,
        variant: 'success',
      })
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={`h-9 gap-1.5 ${archived ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50' : 'text-amber-700 border-amber-300 hover:bg-amber-50'}`}
        onClick={() => setOpen(true)}
      >
        {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
        {archived ? 'Unarchive' : 'Archive'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{archived ? 'Restore Group' : 'Archive Group'}</DialogTitle>
            <DialogDescription>
              {archived ? `Restore ${groupName}?` : `Archive ${groupName}? It will be marked inactive.`}
            </DialogDescription>
          </DialogHeader>

          {!archived && archivedAt === undefined && (
            <p className="text-[11px] text-gray-400">Archiving is reversible from this same page.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={loading}
              className={archived ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {archived ? 'Restore Group' : 'Archive Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
