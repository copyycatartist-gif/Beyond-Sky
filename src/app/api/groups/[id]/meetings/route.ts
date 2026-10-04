import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeObject } from '@/lib/sanitize'

const VALID_ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'late']

/**
 * GET /api/groups/[id]/meetings
 * List meetings for a group with attendance counts.
 * Returns { meetings: [{ ...meeting, attendance: { total, present, absent, excused, late } }] }.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUserProfile()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 })
    }
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const { data: meetings, error } = await supabase
      .from('group_meetings' as any)
      .select('*')
      .eq('group_id', params.id)
      .order('meeting_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const meetingList = (meetings || []) as any[]
    const meetingIds = meetingList.map((m) => m.id)

    // Aggregate attendance per meeting
    const attendanceByMeeting: Record<string, any> = {}
    if (meetingIds.length > 0) {
      const { data: attendance, error: attError } = await supabase
        .from('meeting_attendance' as any)
        .select('meeting_id, status')
        .in('meeting_id', meetingIds)

      if (attError) {
        return NextResponse.json({ error: attError.message }, { status: 500 })
      }

      for (const row of (attendance || []) as any[]) {
        const bucket = (attendanceByMeeting[row.meeting_id] ??= {
          total: 0, present: 0, absent: 0, excused: 0, late: 0,
        })
        bucket.total += 1
        if (bucket[row.status] !== undefined) bucket[row.status] += 1
      }
    }

    const result = meetingList.map((m) => ({
      ...m,
      attendance: attendanceByMeeting[m.id] ?? { total: 0, present: 0, absent: 0, excused: 0, late: 0 },
    }))

    return NextResponse.json({ meetings: result })
  } catch (err: any) {
    console.error('[GET /api/groups/[id]/meetings] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/[id]/meetings
 * Create a meeting with optional attendance records. Any authenticated staff.
 * Rate limited 20/60s.
 * Body: { meeting_date, meeting_place?, agenda?, notes?,
 *         attendance?: [{ client_id, status, notes? }] }
 * Increments group_members.attendance_count for 'present' entries.
 * Returns { meeting, attendance } (201).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let rlHeaders: Record<string, string> = {}
  try {
    const supabase = await createClient()
    const profile = await getCurrentUserProfile()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = rateLimit(`groups:meetingCreate:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
    rlHeaders = getRateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: rlHeaders })
    }

    const clean = sanitizeObject(body || {}) as Record<string, any>

    const meetingDate = typeof clean.meeting_date === 'string' ? clean.meeting_date : ''
    if (!meetingDate || Number.isNaN(Date.parse(meetingDate))) {
      return NextResponse.json(
        { error: 'meeting_date is required and must be a valid date' },
        { status: 400, headers: rlHeaders }
      )
    }
    const meetingDateOnly = meetingDate.split('T')[0]

    const attendanceInput = Array.isArray(clean.attendance) ? clean.attendance : []
    for (const entry of attendanceInput) {
      if (!entry || typeof entry.client_id !== 'string' || !entry.client_id) {
        return NextResponse.json(
          { error: 'Each attendance entry requires a client_id' },
          { status: 400, headers: rlHeaders }
        )
      }
      if (!VALID_ATTENDANCE_STATUSES.includes(entry.status)) {
        return NextResponse.json(
          { error: `attendance status must be one of: ${VALID_ATTENDANCE_STATUSES.join(', ')}` },
          { status: 400, headers: rlHeaders }
        )
      }
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, meeting_place, status, archived_at')
      .eq('id', params.id)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500, headers: rlHeaders })
    }
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: rlHeaders })
    }
    if ((group as any).status === 'dissolved' || (group as any).archived_at) {
      return NextResponse.json(
        { error: 'Cannot record meetings for a dissolved or archived group' },
        { status: 400, headers: rlHeaders }
      )
    }

    const { data: meeting, error: insertError } = await supabase
      .from('group_meetings' as any)
      .insert({
        group_id: params.id,
        meeting_date: meetingDateOnly,
        meeting_place: clean.meeting_place || (group as any).meeting_place || null,
        agenda: clean.agenda || null,
        notes: clean.notes || null,
        created_by: profile.id,
      })
      .select('*')
      .single()

    if (insertError) {
      // UNIQUE(group_id, meeting_date) violation
      if ((insertError as any).code === '23505') {
        return NextResponse.json(
          { error: `A meeting already exists for ${meetingDateOnly}` },
          { status: 409, headers: rlHeaders }
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500, headers: rlHeaders })
    }

    let attendanceRows: any[] = []
    if (attendanceInput.length > 0) {
      const rows = attendanceInput.map((entry: any) => ({
        meeting_id: (meeting as any).id,
        client_id: entry.client_id,
        status: entry.status,
        notes: typeof entry.notes === 'string' && entry.notes ? entry.notes : null,
        recorded_by: profile.id,
      }))

      const { data: inserted, error: attError } = await supabase
        .from('meeting_attendance' as any)
        .insert(rows)
        .select('*')

      if (attError) {
        return NextResponse.json(
          { error: `Meeting created but attendance insert failed: ${attError.message}` },
          { status: 500, headers: rlHeaders }
        )
      }
      attendanceRows = (inserted || []) as any[]

      // Increment attendance_count for members marked 'present'
      const presentClientIds = rows.filter((r) => r.status === 'present').map((r) => r.client_id)
      if (presentClientIds.length > 0) {
        const { data: memberRows, error: memberFetchError } = await supabase
          .from('group_members' as any)
          .select('id, attendance_count')
          .eq('group_id', params.id)
          .in('client_id', presentClientIds)
          .is('date_left', null)

        if (!memberFetchError && memberRows) {
          for (const m of memberRows as any[]) {
            await supabase
              .from('group_members' as any)
              .update({ attendance_count: (Number(m.attendance_count) || 0) + 1 })
              .eq('id', m.id)
          }
        }
      }
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_meetings',
      record_id: (meeting as any).id,
      action: 'group_meeting_create',
      old_values: null,
      new_values: {
        group_id: params.id,
        meeting_date: meetingDateOnly,
        attendance_recorded: attendanceRows.length,
      },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[POST /api/groups/[id]/meetings] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json(
      { meeting, attendance: attendanceRows },
      { status: 201, headers: rlHeaders }
    )
  } catch (err: any) {
    console.error('[POST /api/groups/[id]/meetings] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
