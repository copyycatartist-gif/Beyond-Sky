'use client'

import React, { useMemo, useState } from 'react'
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
import { formatDate, cn } from '@/lib/utils'
import {
  CalendarDays, MapPin, Users, ChevronDown, ChevronUp, Loader2, Plus,
  UserCheck, UserX, Clock, ShieldCheck, StickyNote, Check,
} from 'lucide-react'

export interface MeetingAttendanceRow {
  id: string
  client_id: string
  status: 'present' | 'absent' | 'excused' | 'late'
  notes: string | null
}

export interface MeetingRow {
  id: string
  meeting_date: string
  meeting_place: string | null
  agenda: string | null
  notes: string | null
  created_at: string
  meeting_attendance?: MeetingAttendanceRow[]
}

export interface MeetingMember {
  client_id: string
  full_name: string
}

interface GroupMeetingsTabProps {
  groupId: string
  groupName: string
  defaultPlace: string | null
  meetings: MeetingRow[]
  activeMembers: MeetingMember[]
  /** name lookup for former members appearing in old attendance records */
  clientNames: Record<string, string>
  canManage: boolean
}

type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'

const ATTENDANCE_STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; badge: string; icon: typeof UserCheck }
> = {
  present: { label: 'Present', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: UserCheck },
  absent: { label: 'Absent', badge: 'bg-red-100 text-red-700 border-red-200', icon: UserX },
  excused: { label: 'Excused', badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: ShieldCheck },
  late: { label: 'Late', badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
}

function summarizeAttendance(rows: MeetingAttendanceRow[] | undefined) {
  const summary: Record<AttendanceStatus, number> = { present: 0, absent: 0, excused: 0, late: 0 }
  ;(rows ?? []).forEach((r) => {
    if (summary[r.status] !== undefined) summary[r.status] += 1
  })
  return summary
}

export function GroupMeetingsTab({
  groupId,
  groupName,
  defaultPlace,
  meetings,
  activeMembers,
  clientNames,
  canManage,
}: GroupMeetingsTabProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ---------- Schedule dialog state ----------
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [place, setPlace] = useState(defaultPlace ?? '')
  const [agenda, setAgenda] = useState('')
  const [notes, setNotes] = useState('')
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})

  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort(
        (a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()
      ),
    [meetings]
  )

  const openScheduleDialog = () => {
    const today = new Date().toISOString().split('T')[0]
    setMeetingDate(today)
    setPlace(defaultPlace ?? '')
    setAgenda('')
    setNotes('')
    // Default every active member to present
    const initial: Record<string, AttendanceStatus> = {}
    activeMembers.forEach((m) => {
      initial[m.client_id] = 'present'
    })
    setAttendance(initial)
    setDialogOpen(true)
  }

  const handleSchedule = async () => {
    if (!meetingDate) {
      toast({ title: 'Date required', description: 'Pick the meeting date.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const attendancePayload = activeMembers.map((m) => ({
        client_id: m.client_id,
        status: attendance[m.client_id] ?? 'present',
      }))

      const res = await fetch(`/api/groups/${groupId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meetingDate,
          meeting_place: place.trim() || null,
          agenda: agenda.trim() || null,
          notes: notes.trim() || null,
          attendance: attendancePayload,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to record meeting')

      toast({
        title: 'Meeting Recorded',
        description: `Meeting on ${formatDate(meetingDate)} saved with ${attendancePayload.length} attendance records.`,
        variant: 'success',
      })
      setDialogOpen(false)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot save meeting', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const resolveName = (clientId: string) => clientNames[clientId] ?? 'Former member'

  return (
    <div className="space-y-4 print:hidden">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            Meeting Register ({sortedMeetings.length})
          </h3>
          <p className="text-xs text-gray-500">
            Weekly meeting records and attendance roll-call for {groupName}.
          </p>
        </div>
        {canManage && (
          <Button onClick={openScheduleDialog} className="bg-blue-600 hover:bg-blue-700 h-9 text-xs">
            <Plus className="h-4 w-4 mr-1.5" />
            Schedule / Record Meeting
          </Button>
        )}
      </div>

      {/* Meeting list */}
      {sortedMeetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
          <h4 className="mt-3 text-sm font-semibold text-gray-900">No meetings recorded yet</h4>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            Record the weekly gathering with agenda and attendance.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedMeetings.map((m) => {
            const summary = summarizeAttendance(m.meeting_attendance)
            const total = (m.meeting_attendance ?? []).length
            const expanded = expandedId === m.id
            return (
              <li key={m.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : m.id)}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {formatDate(m.meeting_date, 'EEEE, dd MMM yyyy')}
                        </span>
                        {m.meeting_place && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                            <MapPin className="h-3 w-3" />
                            {m.meeting_place}
                          </span>
                        )}
                      </div>
                      {m.agenda && (
                        <p className="mt-1 truncate text-xs text-gray-600">
                          <span className="font-semibold text-gray-700">Agenda:</span> {m.agenda}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {total > 0 ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <UserCheck className="h-3 w-3" /> {summary.present} present
                          </span>
                          {summary.late > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              <Clock className="h-3 w-3" /> {summary.late} late
                            </span>
                          )}
                          {summary.excused > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              <ShieldCheck className="h-3 w-3" /> {summary.excused} excused
                            </span>
                          )}
                          {summary.absent > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              <UserX className="h-3 w-3" /> {summary.absent} absent
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                          <Users className="h-3 w-3" /> No roll-call
                        </span>
                      )}
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
                    {m.notes && (
                      <div className="flex items-start gap-2 text-xs text-gray-600">
                        <StickyNote className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" />
                        <p className="whitespace-pre-wrap">{m.notes}</p>
                      </div>
                    )}
                    {(m.meeting_attendance ?? []).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {(m.meeting_attendance ?? []).map((a) => {
                          const cfg = ATTENDANCE_STATUS_CONFIG[a.status] ?? ATTENDANCE_STATUS_CONFIG.present
                          return (
                            <div
                              key={a.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5"
                            >
                              <span className="truncate text-[11px] font-medium text-gray-800">
                                {resolveName(a.client_id)}
                              </span>
                              <span
                                className={cn(
                                  'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                  cfg.badge
                                )}
                              >
                                {cfg.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ---------- Schedule meeting dialog ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              Record Meeting — {groupName}
            </DialogTitle>
            <DialogDescription>
              Capture the date, agenda and per-member roll-call.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700" htmlFor="mtg-date">
                  Meeting Date *
                </label>
                <Input
                  id="mtg-date"
                  type="date"
                  value={meetingDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700" htmlFor="mtg-place">
                  Meeting Place
                </label>
                <Input
                  id="mtg-place"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder={defaultPlace ?? 'e.g. Makola Market Shed 4'}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="mtg-agenda">
                Agenda
              </label>
              <Input
                id="mtg-agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="e.g. Weekly collection, default follow-up, new member introduction..."
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="mtg-notes">
                Notes / Minutes
              </label>
              <textarea
                id="mtg-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Key decisions, resolutions, issues raised..."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Per-member attendance */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Attendance Roll-call ({activeMembers.length} active members)
              </p>
              {activeMembers.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">
                  No active members — the meeting will be recorded without a roll-call.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {activeMembers.map((m) => {
                    const status = attendance[m.client_id] ?? 'present'
                    return (
                      <div
                        key={m.client_id}
                        className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="truncate text-xs font-medium text-gray-800">{m.full_name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {(['present', 'absent', 'excused', 'late'] as AttendanceStatus[]).map((s) => {
                            const cfg = ATTENDANCE_STATUS_CONFIG[s]
                            const checked = status === s
                            return (
                              <label
                                key={s}
                                className={cn(
                                  'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                                  checked ? cfg.badge : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`attendance-${m.client_id}`}
                                  value={s}
                                  checked={checked}
                                  onChange={() =>
                                    setAttendance((prev) => ({ ...prev, [m.client_id]: s }))
                                  }
                                  className="sr-only"
                                />
                                {checked && <Check className="h-2.5 w-2.5" />}
                                {cfg.label}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={saving || !meetingDate}
              className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Save Meeting
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
