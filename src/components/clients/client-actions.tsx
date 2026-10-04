'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ShieldAlert, Archive, ArrowLeftRight, X, Check, Loader2,
  Building2, Undo2
} from 'lucide-react'

interface ClientActionsProps {
  clientId: string
  isWatchlisted: boolean
  watchlistReason: string | null
  isArchived: boolean
  currentBranch: string | null
  branches: string[]
  userRole: string
}

export function ClientActions({
  clientId, isWatchlisted, watchlistReason, isArchived,
  currentBranch, branches, userRole
}: ClientActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showWatchlistDialog, setShowWatchlistDialog] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [watchlistReasonInput, setWatchlistReasonInput] = useState('')
  const [transferBranch, setTransferBranch] = useState('')
  const [transferReason, setTransferReason] = useState('')

  const isManager = ['manager', 'supervisor', 'accountant_admin'].includes(userRole)

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

  const handleTransfer = async () => {
    if (!transferBranch) return
    setLoading('transfer')
    const res = await fetch('/api/clients/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, newBranch: transferBranch, reason: transferReason }),
    })
    setLoading(null)
    if (res.ok) {
      setShowTransferDialog(false)
      setTransferBranch('')
      setTransferReason('')
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Watchlist toggle */}
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

        {/* Branch transfer */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 text-gray-600 hover:text-blue-700 hover:border-blue-200"
          onClick={() => setShowTransferDialog(true)}
          title="Transfer to another branch"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Transfer
        </Button>

        {/* Archive / Unarchive */}
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
      </div>

      {/* Watchlist reason dialog */}
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

      {/* Transfer dialog */}
      {showTransferDialog && (
        <div className="focus-trap-overlay" onClick={() => setShowTransferDialog(false)}>
          <div
            role="dialog"
            aria-labelledby="transfer-title"
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="transfer-title" className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Transfer Branch
              </h3>
              <button onClick={() => setShowTransferDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Current branch: <strong>{currentBranch || 'Unassigned'}</strong>
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">New Branch</label>
              <select
                value={transferBranch}
                onChange={(e) => setTransferBranch(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Select branch...</option>
                {branches.filter(b => b !== currentBranch).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Reason (optional)</label>
              <Input
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Client relocated..."
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                onClick={handleTransfer}
                disabled={!transferBranch || loading === 'transfer'}
              >
                {loading === 'transfer' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeftRight className="h-3 w-3" />}
                Transfer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirmation */}
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
    </>
  )
}
