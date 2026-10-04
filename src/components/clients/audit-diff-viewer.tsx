'use client'

import { useMemo, useState } from 'react'
import { History, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

interface AuditEntry {
  id: string
  action: string
  performed_by: string
  created_at: string
  old_values: any
  new_values: any
  changes_diff?: any
}

interface FieldChange {
  field: string
  old: any
  new: any
}

function actionBadgeVariant(action: string): 'success' | 'default' | 'destructive' | 'secondary' {
  switch (action?.toUpperCase()) {
    case 'INSERT':
      return 'success'
    case 'UPDATE':
      return 'default'
    case 'DELETE':
      return 'destructive'
    default:
      return 'secondary'
  }
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Build a list of field-level changes from changes_diff if present,
 * otherwise fall back to comparing old_values / new_values.
 */
function buildChanges(entry: AuditEntry): FieldChange[] {
  const diff = entry.changes_diff
  if (diff && typeof diff === 'object' && !Array.isArray(diff)) {
    return Object.entries(diff).map(([field, change]) => {
      const c = change as any
      if (c && typeof c === 'object' && ('old' in c || 'new' in c)) {
        return { field, old: c.old, new: c.new }
      }
      return { field, old: undefined, new: c }
    })
  }

  const oldObj = entry.old_values && typeof entry.old_values === 'object' ? entry.old_values : {}
  const newObj = entry.new_values && typeof entry.new_values === 'object' ? entry.new_values : {}
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  const changes: FieldChange[] = []
  keys.forEach(field => {
    const oldVal = oldObj[field]
    const newVal = newObj[field]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, old: oldVal, new: newVal })
    }
  })
  return changes
}

function ChangeRow({ change }: { change: FieldChange }) {
  const hadOld = change.old !== null && change.old !== undefined
  const hasNew = change.new !== null && change.new !== undefined

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap align-top">
        {change.field}
      </td>
      <td className="px-2 py-1.5 align-top">
        {!hadOld && hasNew ? (
          // Added value
          <span className="inline-block bg-emerald-50 text-emerald-800 rounded px-1.5 py-0.5">
            {formatValue(change.new)}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {/* Removed / old value */}
            <span className="inline-block bg-red-50 text-red-700 line-through rounded px-1.5 py-0.5">
              {formatValue(change.old)}
            </span>
            {hasNew && (
              <>
                <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                {/* New value */}
                <span className="inline-block bg-emerald-50 text-emerald-800 rounded px-1.5 py-0.5">
                  {formatValue(change.new)}
                </span>
              </>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}

export function AuditDiffViewer({ entries }: { entries: AuditEntry[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const visibleEntries = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return showAll ? sorted : sorted.slice(0, 5)
  }, [entries, showAll])

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 italic p-3">
        <History className="h-4 w-4" />
        No audit history recorded yet.
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="relative pl-4 space-y-2 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
        {visibleEntries.map(entry => {
          const expanded = expandedIds.has(entry.id)
          const changes = buildChanges(entry)
          return (
            <div key={entry.id} className="relative">
              {/* Timeline dot */}
              <span className="absolute -left-4 top-3 h-[11px] w-[11px] rounded-full border-2 border-white bg-gray-300 ring-1 ring-gray-200" />
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Badge variant={actionBadgeVariant(entry.action)} className="px-1.5 py-0 text-[10px]">
                      {entry.action}
                    </Badge>
                    <span className="text-gray-700 font-medium truncate">
                      {entry.performed_by || 'System'}
                    </span>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {formatDate(entry.created_at, 'dd MMM yyyy, HH:mm')}
                    </span>
                    {changes.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {changes.length} field{changes.length === 1 ? '' : 's'} changed
                      </span>
                    )}
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 max-h-64 overflow-y-auto">
                    {changes.length === 0 ? (
                      <p className="px-3 py-2 text-gray-400 italic">No field-level changes recorded.</p>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {changes.map(change => (
                            <ChangeRow key={change.field} change={change} />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {entries.length > 5 && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-gray-500"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show all ({entries.length})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
