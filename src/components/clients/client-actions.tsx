'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ShieldAlert, Archive, X, Check, Loader2, Undo2, Trash2
} from 'lucide-react'
import { canDeleteClients } from '@/lib/roles'
import { useToast } from '@/components/ui/use-toast'

interface ClientActionsProps {
  clientId: string
  clientName?: string
  isWatchlisted: boolean
  watchlistReason: string | null
  isArchived: boolean
  currentBranch?: string | null
  branches?: string[]
  userRole: string
}

export function ClientActions({
  clientId,
  clientName,
  isWatchlisted,
  watchlistReason,
  isArchived,
  userRole,
}: ClientActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [showWatchlistDialog, setShowWatchlistDialog] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [watchlistReasonInput, setWatchlistReasonInput] = useState('')

  const isManager = ['manager', 'supervisor', 'accountant_admin'].includes(userRole)
  const canDelete = canDeleteClients(userRole)

  if (!isManager) return null

  const handleWatchlistToggle = async () => {
    if (!isWatchlisted && !watchlistReasonInput.trim()) return
    setLoading('watchlist')
    const res = await fetch('/api/clients/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        watchlisted: !isWatchlisted,
        reason: isWatchlisted ? null : watchlistReasonInput.trim(),
      }),
    })
    setLoading(null)
    if (res.ok) {
      setShowWatchlistDialog(false)
      setWatchlistReasonInput('')
      router.refresh()
    }
  }

  const handleArchive = async () => {
    setLoading('archive')
    const res = await fetch('/api/clients/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, archived: !isArchived }),
    })
    setLoading(null)
    if (res.ok) {
      setShowArchiveConfirm(false)
      router.refresh()
    }
  }

  const handleDelete = async () => {
    setLoading('delete')
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast({
          title: 'Cannot delete client',
          description: data?.error || 'Delete failed.',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Client deleted',
        description: data?.message || 'Client was permanently removed.',
        variant: 'success',
      })
      setShowDeleteConfirm(false)
      router.push('/clients')
      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Cannot delete client',
        description: err.message || 'Network error',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  const deleteLabel = clientName?.trim() || 'DELETE'

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={`h-8 text-xs gap-1.5 ${isWatchlisted ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'text-gray-600 hover:text-amber-700 hover:border-amber-200'}`}
          onClick={() => isWatchlisted ? handleWatchlistToggle() : setShowWatchlistDialog(true)}
          disabled={loading === 'watchlist'}
          title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {loading === 'watchlist' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
          {isWatchlisted ? 'Unwatch' : 'Watchlist'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={`h-8 text-xs gap-1.5 ${isArchived ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' : 'text-gray-600 hover:text-red-600 hover:border-red-200'}`}
          onClick={() => setShowArchiveConfirm(true)}
          disabled={loading === 'archive'}
          title={isArchived ? 'Restore client' : 'Archive client'}
        >
          {loading === 'archive' ? <Loader2 className="h-3 w-3 animate-spin" /> : isArchived ? <Undo2 className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
          {isArchived ? 'Restore' : 'Archive'}
        </Button>

        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300"
            onClick={() => {
              setDeleteConfirmText('')
              setShowDeleteConfirm(true)
            }}
            disabled={loading === 'delete'}
            title="Permanently delete client"
          >
            {loading === 'delete' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete
          </Button>
        )}
      </div>

      {showWatchlistDialog && (
        <div className="focus-trap-overlay" onClick={() => setShowWatchlistDialog(false)}>
          <div
            role="dialog"
            aria-labelledby="watchlist-title"
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="watchlist-title" className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Add to Watchlist
              </h3>
              <button onClick={() => setShowWatchlistDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reason (required)</label>
              <Input
                value={watchlistReasonInput}
                onChange={(e) => setWatchlistReasonInput(e.target.value)}
                placeholder="e.g. Multiple missed payments, fraudulent activity..."
                className="text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowWatchlistDialog(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                onClick={handleWatchlistToggle}
                disabled={!watchlistReasonInput.trim() || loading === 'watchlist'}
              >
                {loading === 'watchlist' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Confirm Watchlist
              </Button>
            </div>
          </div>
        </div>
      )}

      {showArchiveConfirm && (
        <div className="focus-trap-overlay" onClick={() => setShowArchiveConfirm(false)}>
          <div
            role="dialog"
            aria-labelledby="archive-title"
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="archive-title" className="text-sm font-bold text-gray-900 flex items-center gap-2">
                {isArchived ? <Undo2 className="h-4 w-4 text-emerald-600" /> : <Archive className="h-4 w-4 text-red-600" />}
                {isArchived ? 'Restore Client' : 'Archive Client'}
              </h3>
              <button onClick={() => setShowArchiveConfirm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              {isArchived
                ? 'This will restore the client to active status and make them visible in the directory again.'
                : 'Marks the client inactive and hides them from the directory (reversible).'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowArchiveConfirm(false)}>Cancel</Button>
              <Button
                size="sm"
                className={isArchived ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                onClick={handleArchive}
                disabled={loading === 'archive'}
              >
                {loading === 'archive' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {isArchived ? 'Restore' : 'Archive'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="focus-trap-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div
            role="dialog"
            aria-labelledby="delete-client-title"
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="delete-client-title" className="text-sm font-bold text-red-800 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Client Permanently
              </h3>
              <button onClick={() => setShowDeleteConfirm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              This permanently removes <strong>{clientName || 'this client'}</strong> and related notes/tasks.
              Clients with loan history cannot be deleted — archive them instead.
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Type <span className="font-mono">{deleteLabel}</span> to confirm
              </label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteLabel}
                className="text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                onClick={handleDelete}
                disabled={deleteConfirmText !== deleteLabel || loading === 'delete'}
              >
                {loading === 'delete' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
