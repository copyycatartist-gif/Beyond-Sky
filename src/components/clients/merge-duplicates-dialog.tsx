'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge, ArrowLeftRight, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PotentialDuplicateClient {
  id: string
  full_name: string
  account_number: string
  phone_number: string
  national_id: string
}

interface MergeDuplicatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: PotentialDuplicateClient[]
  userRole: string
}

const ALLOWED_ROLES = ['manager', 'supervisor', 'accountant_admin']

type MergeStatus = 'idle' | 'loading' | 'success' | 'error'

// Fields compared side-by-side; keys match the API whitelist.
const COMPARE_FIELDS: { key: keyof Omit<PotentialDuplicateClient, 'id'>; label: string }[] = [
  { key: 'full_name', label: 'Full name' },
  { key: 'account_number', label: 'Account number' },
  { key: 'phone_number', label: 'Phone number' },
  { key: 'national_id', label: 'National ID' },
]

export function MergeDuplicatesDialog({
  open,
  onOpenChange,
  clients,
  userRole,
}: MergeDuplicatesDialogProps) {
  const router = useRouter()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Which of the two selected records is the primary ("A" or "B" by selection order)
  const [primaryIsFirst, setPrimaryIsFirst] = useState(true)
  const [fieldSelections, setFieldSelections] = useState<Record<string, 'primary' | 'duplicate'>>({})
  const [status, setStatus] = useState<MergeStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canMerge = ALLOWED_ROLES.includes(userRole)

  const [recordA, recordB] = useMemo(() => {
    const a = clients.find(c => c.id === selectedIds[0]) ?? null
    const b = clients.find(c => c.id === selectedIds[1]) ?? null
    return [a, b] as const
  }, [clients, selectedIds])

  // "primary" is the record being kept; "duplicate" is the one being merged in.
  const primary = primaryIsFirst ? recordA : recordB
  const duplicate = primaryIsFirst ? recordB : recordA

  const resetState = () => {
    setSelectedIds([])
    setPrimaryIsFirst(true)
    setFieldSelections({})
    setStatus('idle')
    setErrorMessage(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (status === 'loading') return
    if (!next) resetState()
    onOpenChange(next)
  }

  const toggleSelect = (id: string) => {
    if (status === 'loading') return
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      }
      if (prev.length >= 2) {
        // Replace the second pick when both slots are filled
        return [prev[0], id]
      }
      return [...prev, id]
    })
    setFieldSelections({})
  }

  const handleSwapPrimary = () => {
    setPrimaryIsFirst(prev => !prev)
    setFieldSelections({})
  }

  const selectFieldValue = (field: string, source: 'primary' | 'duplicate') => {
    setFieldSelections(prev => ({ ...prev, [field]: source }))
  }

  const selectionFor = (field: string): 'primary' | 'duplicate' =>
    fieldSelections[field] ?? 'primary'

  const handleMerge = async () => {
    if (!primary || !duplicate) return
    setStatus('loading')
    setErrorMessage(null)
    try {
      // Default every compared field to keeping the primary's value unless
      // the user explicitly picked the duplicate's value.
      const selections: Record<string, 'primary' | 'duplicate'> = {}
      for (const { key } of COMPARE_FIELDS) {
        selections[key] = selectionFor(key)
      }

      const res = await fetch('/api/clients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: primary.id,
          duplicateId: duplicate.id,
          fieldSelections: selections,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Merge failed (HTTP ${res.status})`)
      }

      setStatus('success')
      router.refresh()
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong while merging.')
    }
  }

  if (!canMerge) {
    return null
  }

  const bothSelected = Boolean(primary && duplicate)
  const comparedFields = bothSelected ? COMPARE_FIELDS : []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="fixed inset-0 top-0 left-0 translate-x-0 translate-y-0 max-w-none w-full h-full overflow-hidden p-0 rounded-none sm:rounded-none border-0 flex flex-col"
        aria-label="Merge duplicate clients"
      >
        <DialogHeader className="border-b border-gray-200 px-6 py-4 text-left shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-blue-600" />
            Merge duplicate clients
          </DialogTitle>
          <DialogDescription>
            Select the duplicate and primary records, then choose which field values to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {status === 'success' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Merge complete</h3>
              <p className="max-w-md text-sm text-gray-500">
                The duplicate record was archived and its loans, transactions, and group
                memberships were reassigned to the primary client.
              </p>
            </div>
          ) : (
            <>
              {/* Step 1: pick the two records */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  1. Select two records ({selectedIds.length}/2)
                </h3>
                {clients.length < 2 ? (
                  <p className="text-sm text-gray-500">
                    At least two potential duplicates are required to merge.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {clients.map(client => {
                      const isSelected = selectedIds.includes(client.id)
                      const order = selectedIds.indexOf(client.id)
                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => toggleSelect(client.id)}
                          disabled={status === 'loading'}
                          className={cn(
                            'rounded-lg border p-3 text-left transition-colors disabled:opacity-50',
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{client.full_name}</span>
                            {isSelected && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                                {order + 1}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                            <p>Acct: {client.account_number || '—'}</p>
                            <p>Phone: {client.phone_number || '—'}</p>
                            <p>National ID: {client.national_id || '—'}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: comparison */}
              {bothSelected && primary && duplicate && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                      2. Choose primary record &amp; field values
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={handleSwapPrimary}
                      disabled={status === 'loading'}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Swap primary
                    </Button>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-4 py-3 text-left font-medium text-gray-500">Field</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="radio"
                                name="primary-record"
                                className="h-4 w-4 accent-blue-600"
                                checked={primaryIsFirst}
                                onChange={() => !primaryIsFirst && handleSwapPrimary()}
                                disabled={status === 'loading'}
                              />
                              <span>
                                {recordA?.full_name}
                                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                  Record A
                                </span>
                              </span>
                            </label>
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">
                            <label className="flex cursor-pointer items-center gap-2">
                              <input
                                type="radio"
                                name="primary-record"
                                className="h-4 w-4 accent-blue-600"
                                checked={!primaryIsFirst}
                                onChange={() => primaryIsFirst && handleSwapPrimary()}
                                disabled={status === 'loading'}
                              />
                              <span>
                                {recordB?.full_name}
                                <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                                  Record B
                                </span>
                              </span>
                            </label>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparedFields.map(({ key, label }) => {
                          // Map the visual column (A/B) to primary/duplicate for this row
                          const primaryValue = primary[key] || '—'
                          const duplicateValue = duplicate[key] || '—'
                          const aIsPrimary = primaryIsFirst
                          const selected = selectionFor(key)
                          return (
                            <tr key={key} className="border-b border-gray-100 last:border-0">
                              <td className="px-4 py-3 font-medium text-gray-700">{label}</td>
                              {[
                                { source: aIsPrimary ? 'primary' : 'duplicate' as 'primary' | 'duplicate', value: aIsPrimary ? primaryValue : duplicateValue, side: 'A' },
                                { source: aIsPrimary ? 'duplicate' : 'primary' as 'primary' | 'duplicate', value: aIsPrimary ? duplicateValue : primaryValue, side: 'B' },
                              ].map(col => (
                                <td key={col.side} className="px-4 py-3">
                                  <label
                                    className={cn(
                                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                                      selected === col.source
                                        ? 'bg-blue-50 text-gray-900'
                                        : 'text-gray-600 hover:bg-gray-50'
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      name={`field-${key}`}
                                      className="h-4 w-4 accent-blue-600"
                                      checked={selected === col.source}
                                      onChange={() => selectFieldValue(key, col.source)}
                                      disabled={status === 'loading'}
                                    />
                                    <span className="break-all">{col.value}</span>
                                    {selected === col.source && (
                                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    )}
                                  </label>
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    The primary record is kept; the duplicate is archived (status set to inactive)
                    and its related records are reassigned to the primary.
                  </p>
                </div>
              )}

              {status === 'error' && errorMessage && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4">
          {status === 'success' ? (
            <div className="flex justify-end">
              <Button variant="success" onClick={() => handleOpenChange(false)}>
                <Check className="mr-1.5 h-4 w-4" />
                Done
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={status === 'loading'}
              >
                <X className="mr-1.5 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleMerge}
                disabled={!bothSelected || status === 'loading'}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="mr-1.5 h-4 w-4" />
                    Merge
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
