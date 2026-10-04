'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { History, UserMinus, ScrollText, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FormerMember {
  id: string
  client_id: string
  date_joined: string
  date_left: string | null
  role: string | null
  removal_reason: string | null
  client: {
    id: string
    account_number: string
    full_name: string
    phone_number: string
    business_type: string
  } | null
}

interface AuditEntry {
  id: string
  action: string
  changed_by: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  changes_diff: Record<string, unknown> | null
  created_at: string
  user?: { full_name: string } | null
}

const ACTION_BADGE: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-800 border-blue-200',
  DELETE: 'bg-red-100 text-red-800 border-red-200',
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)))
}

export function GroupHistoryTab({
  formerMembers,
  auditEntries,
}: {
  formerMembers: FormerMember[]
  auditEntries: AuditEntry[]
}) {
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Former members */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserMinus className="h-4 w-4 text-gray-500" />
          <h3 className="text-base font-bold text-gray-900">Former Members ({formerMembers.length})</h3>
        </div>

        {formerMembers.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
            <p className="text-sm text-gray-400 italic">No member has ever left this group.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
            {formerMembers.map((m) => {
              const tenure = m.date_left ? daysBetween(m.date_joined, m.date_left) : 0
              return (
                <div key={m.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                      {(m.client?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {m.client ? (
                          <Link href={`/clients/${m.client.id}`} className="hover:underline text-blue-600">
                            {m.client.full_name}
                          </Link>
                        ) : (
                          'Unknown client'
                        )}
                        {m.role && m.role !== 'member' && (
                          <span className="ml-2 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 align-middle">
                            {m.role}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {m.client?.account_number ?? '—'} • {m.client?.business_type || 'N/A'} • Tenure: {tenure} day{tenure === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-700">Left {formatDate(m.date_left)}</p>
                    <p className="text-[11px] text-red-600 mt-0.5 max-w-[260px]">
                      {m.removal_reason || <span className="text-gray-400 italic">No removal reason recorded</span>}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-gray-500" />
          <h3 className="text-base font-bold text-gray-900">Change History ({auditEntries.length})</h3>
        </div>

        {auditEntries.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
            <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 italic">
              No audit entries visible for this group.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">
            {auditEntries.map((entry) => {
              const isExpanded = expandedAudit === entry.id
              const diffEntries = entry.changes_diff
                ? Object.entries(entry.changes_diff)
                : []
              return (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                          ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {entry.action}
                      </span>
                      <span className="text-xs text-gray-700 truncate">
                        {entry.user?.full_name || 'System'}
                        {diffEntries.length > 0
                          ? ` changed ${diffEntries.length} field${diffEntries.length === 1 ? '' : 's'}`
                          : ' modified this group'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-gray-400">
                        {formatDate(entry.created_at, 'dd MMM yyyy, HH:mm')}
                      </span>
                      {diffEntries.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setExpandedAudit(isExpanded ? null : entry.id)}
                          aria-label={isExpanded ? 'Collapse changes' : 'Expand changes'}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && diffEntries.length > 0 && (
                    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-gray-500">
                            <th className="px-3 py-1.5 font-semibold">Field</th>
                            <th className="px-3 py-1.5 font-semibold">Old Value</th>
                            <th className="px-3 py-1.5 font-semibold">New Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffEntries.map(([field, change]) => {
                            const oldValue = (change as any)?.old
                            const newValue = (change as any)?.new
                            return (
                              <tr key={field} className="border-b border-gray-100 last:border-0">
                                <td className="px-3 py-1.5 font-mono text-gray-700">{field}</td>
                                <td className="px-3 py-1.5 text-red-600 break-all">
                                  {oldValue === null || oldValue === undefined || oldValue === '' ? '—' : String(oldValue)}
                                </td>
                                <td className="px-3 py-1.5 text-emerald-700 break-all">
                                  {newValue === null || newValue === undefined || newValue === '' ? '—' : String(newValue)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
