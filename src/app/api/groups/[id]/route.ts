import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeObject } from '@/lib/sanitize'

const MANAGER_PLUS = ['manager', 'supervisor', 'accountant_admin']
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'dissolved', 'forming']
const VALID_GROUP_TYPES = ['solidarity', 'individual', 'cooperative']

const UPDATABLE_STRING_FIELDS = [
  'name',
  'branch',
  'area',
  'meeting_day',
  'meeting_place',
  'group_type',
  'description',
  'photo_url',
] as const

/**
 * GET /api/groups/[id]
 * Full group detail including members (with client join), leader and stats.
 * Returns { group, members, leader, stats }.
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

    const { data: group, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const { data: members, error: membersError } = await supabase
      .from('group_members' as any)
      .select(
        `
        id, client_id, date_joined, date_left, role, removal_reason, removed_by,
        attendance_count, contributions_total,
        client:clients (id, full_name, account_number, phone_number, business_type, market_location, status)
        `
      )
      .eq('group_id', params.id)
      .order('date_joined', { ascending: true })

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    const memberList = (members || []) as any[]
    const activeMembers = memberList.filter((m) => m.date_left === null)

    // Leader record (client) if set
    let leader: any = null
    const leaderId = (group as any).leader_id
    if (leaderId) {
      const { data: leaderData } = await supabase
        .from('clients')
        .select('id, full_name, account_number, phone_number, status')
        .eq('id', leaderId)
        .maybeSingle()
      leader = leaderData ?? null
    }

    const { count: meetingCount } = await supabase
      .from('group_meetings' as any)
      .select('id', { count: 'exact', head: true })
      .eq('group_id', params.id)

    const stats = {
      total_members: memberList.length,
      active_member_count: activeMembers.length,
      former_member_count: memberList.length - activeMembers.length,
      max_members: (group as any).max_members,
      is_full: activeMembers.length >= ((group as any).max_members ?? 15),
      meeting_count: meetingCount ?? 0,
      total_contributions: memberList.reduce((sum, m) => sum + (Number(m.contributions_total) || 0), 0),
      total_attendance: memberList.reduce((sum, m) => sum + (Number(m.attendance_count) || 0), 0),
    }

    return NextResponse.json({ group, members: memberList, leader, stats })
  } catch (err: any) {
    console.error('[GET /api/groups/[id]] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/groups/[id]
 * Update editable group fields. Manager+ only. Rate limited 30/60s.
 * Body: any of { name, branch, area, meeting_day, meeting_place, max_members,
 *                group_type, description, photo_url, leader_id, status,
 *                min_member_tenure_days, require_guarantor_chain }
 * Returns { group }.
 */
export async function PATCH(
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

    if (!MANAGER_PLUS.includes(profile.role || '')) {
      return NextResponse.json(
        { error: 'Forbidden: requires manager role or above' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`groups:update:${profile.id}`, { maxRequests: 30, windowMs: 60000 })
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

    const { data: existing, error: fetchError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: rlHeaders })
    }

    const updates: Record<string, any> = {}

    for (const field of UPDATABLE_STRING_FIELDS) {
      if (clean[field] !== undefined) {
        if (field === 'name' && (typeof clean[field] !== 'string' || clean[field] === '')) {
          return NextResponse.json({ error: 'name cannot be empty' }, { status: 400, headers: rlHeaders })
        }
        updates[field] = clean[field] === '' ? null : clean[field]
      }
    }
    if (updates.name === null) delete updates.name

    if (updates.group_type && !VALID_GROUP_TYPES.includes(updates.group_type)) {
      return NextResponse.json(
        { error: `group_type must be one of: ${VALID_GROUP_TYPES.join(', ')}` },
        { status: 400, headers: rlHeaders }
      )
    }

    if (clean.max_members !== undefined) {
      const maxMembers = parseInt(String(clean.max_members), 10)
      if (Number.isNaN(maxMembers) || maxMembers < 1 || maxMembers > 15) {
        return NextResponse.json(
          { error: 'max_members must be a number between 1 and 15' },
          { status: 400, headers: rlHeaders }
        )
      }

      // Cannot shrink below current active membership
      const { count: activeCount } = await supabase
        .from('group_members' as any)
        .select('id', { count: 'exact', head: true })
        .eq('group_id', params.id)
        .is('date_left', null)

      if ((activeCount ?? 0) > maxMembers) {
        return NextResponse.json(
          { error: `Group currently has ${activeCount} active members. Cannot set max_members below that.` },
          { status: 400, headers: rlHeaders }
        )
      }
      updates.max_members = maxMembers
    }

    if (clean.status !== undefined) {
      if (!VALID_STATUSES.includes(clean.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400, headers: rlHeaders }
        )
      }
      updates.status = clean.status
    }

    if (clean.leader_id !== undefined) {
      if (clean.leader_id === null || clean.leader_id === '') {
        updates.leader_id = null
      } else {
        // Leader must be an active member of this group
        const { data: leaderMembership } = await supabase
          .from('group_members' as any)
          .select('id')
          .eq('group_id', params.id)
          .eq('client_id', clean.leader_id)
          .is('date_left', null)
          .maybeSingle()

        if (!leaderMembership) {
          return NextResponse.json(
            { error: 'leader_id must reference an active member of this group' },
            { status: 400, headers: rlHeaders }
          )
        }
        updates.leader_id = clean.leader_id
      }
    }

    if (clean.min_member_tenure_days !== undefined) {
      const tenure = parseInt(String(clean.min_member_tenure_days), 10)
      if (Number.isNaN(tenure) || tenure < 0 || tenure > 3650) {
        return NextResponse.json(
          { error: 'min_member_tenure_days must be a number between 0 and 3650' },
          { status: 400, headers: rlHeaders }
        )
      }
      updates.min_member_tenure_days = tenure
    }

    if (clean.require_guarantor_chain !== undefined) {
      if (typeof clean.require_guarantor_chain !== 'boolean') {
        return NextResponse.json(
          { error: 'require_guarantor_chain must be a boolean' },
          { status: 400, headers: rlHeaders }
        )
      }
      updates.require_guarantor_chain = clean.require_guarantor_chain
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400, headers: rlHeaders }
      )
    }

    updates.updated_at = new Date().toISOString()

    // Build old/new value maps for the audit trail (changed fields only)
    const oldValues: Record<string, any> = {}
    const newValues: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'updated_at') continue
      if ((existing as any)[key] !== value) {
        oldValues[key] = (existing as any)[key] ?? null
        newValues[key] = value
      }
    }

    const { data, error } = await supabase
      .from('groups')
      .update(updates as any)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    if (Object.keys(newValues).length > 0) {
      const { error: auditError } = await supabase.from('audit_log').insert({
        table_name: 'groups',
        record_id: params.id,
        action: 'group_update',
        old_values: oldValues,
        new_values: newValues,
        changed_by: profile.id,
      })

      if (auditError) {
        console.error('[PATCH /api/groups/[id]] audit_log insert failed:', auditError.message)
      }
    }

    return NextResponse.json({ group: data }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[PATCH /api/groups/[id]] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}

/**
 * DELETE /api/groups/[id]
 * Soft archive: sets status='inactive', archived_at, archived_by. Manager+ only.
 * Body (optional): { dissolution_reason? }
 * Returns { success, group }.
 */
export async function DELETE(
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

    if (!MANAGER_PLUS.includes(profile.role || '')) {
      return NextResponse.json(
        { error: 'Forbidden: requires manager role or above' },
        { status: 403 }
      )
    }

    const rl = rateLimit(`groups:archive:${profile.id}`, { maxRequests: 10, windowMs: 60000 })
    rlHeaders = getRateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    let body: any = {}
    try {
      // DELETE may or may not carry a body
      body = await request.json()
    } catch {
      body = {}
    }

    const clean = sanitizeObject(body || {}) as Record<string, any>
    const dissolutionReason =
      typeof clean.dissolution_reason === 'string' && clean.dissolution_reason
        ? clean.dissolution_reason
        : null

    const { data: existing, error: fetchError } = await supabase
      .from('groups')
      .select('id, status, archived_at')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: rlHeaders })
    }
    if ((existing as any).archived_at) {
      return NextResponse.json(
        { error: 'Group is already archived' },
        { status: 409, headers: rlHeaders }
      )
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('groups')
      .update({
        status: 'inactive',
        archived_at: now,
        archived_by: profile.id,
        dissolution_reason: dissolutionReason,
        updated_at: now,
      } as any)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'groups',
      record_id: params.id,
      action: 'group_archive',
      old_values: { status: (existing as any).status ?? null, archived_at: null },
      new_values: { status: 'inactive', archived_at: now, dissolution_reason: dissolutionReason },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[DELETE /api/groups/[id]] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ success: true, group: data }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[DELETE /api/groups/[id]] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
