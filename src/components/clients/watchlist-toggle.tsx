'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const AUTHORIZED_ROLES = ['manager', 'supervisor', 'accountant_admin']

interface WatchlistToggleProps {
  clientId: string
  isWatchlisted: boolean
  userRole: string
}

export function WatchlistToggle({ clientId, isWatchlisted, userRole }: WatchlistToggleProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close the reason popover when clicking outside
  useEffect(() => {
    if (!showReason) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowReason(false)
        setReason('')
        setError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showReason])

  if (!AUTHORIZED_ROLES.includes(userRole)) {
    return null
  }

  const postWatchlist = async (payload: { watchlisted: boolean; reason?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/clients/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...payload }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to update watchlist status')
      }
      setShowReason(false)
      setReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (loading) return
    if (isWatchlisted) {
      postWatchlist({ watchlisted: false })
    } else {
      setShowReason(true)
    }
  }

  const handleConfirmAdd = () => {
    if (!reason.trim() || loading) return
    postWatchlist({ watchlisted: true, reason: reason.trim() })
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        type="button"
        variant={isWatchlisted ? 'destructive' : 'outline'}
        size="sm"
        className={
          isWatchlisted
            ? 'gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
            : 'gap-1.5 text-gray-600 hover:text-gray-900'
        }
        onClick={handleClick}
        disabled={loading}
        title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldAlert className={isWatchlisted ? 'h-4 w-4' : 'h-4 w-4 text-gray-500'} />
        )}
        {isWatchlisted ? 'Watchlisted' : 'Watchlist'}
      </Button>

      {showReason && !isWatchlisted && (
        <div className="absolute z-50 mt-2 w-72 rounded-lg border border-amber-200 bg-white p-3 shadow-lg">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <ShieldAlert className="h-3.5 w-3.5" />
            Add client to watchlist
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmAdd()
              if (e.key === 'Escape') {
                setShowReason(false)
                setReason('')
                setError(null)
              }
            }}
            placeholder="Reason for watchlisting..."
            className="h-8 text-xs focus-visible:ring-amber-300 focus-visible:border-amber-400"
            autoFocus
            disabled={loading}
          />
          {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowReason(false)
                setReason('')
                setError(null)
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 bg-amber-600 text-xs text-white hover:bg-amber-700"
              onClick={handleConfirmAdd}
              disabled={loading || !reason.trim()}
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default WatchlistToggle
