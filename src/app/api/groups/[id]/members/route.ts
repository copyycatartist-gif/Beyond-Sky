import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize'

const VALID_MEMBER_ROLES = ['leader', 'treasurer', 'secretary', 'member']

/**
 * GET /api/groups/[id]/members
 * List all members of a group (active and former) with client info.
 * Returns { members, active, former }.
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

    const { data, error } = await supabase
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const members = (data || []) as any[]

    return NextResponse.json({
      members,
      active: members.filter((m) => m.date_left === null),
      former: members.filter((m) => m.date_left !== null),
    })
  } catch (err: any) {
    console.error('[GET /api/groups/[id]/members] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/[id]/members
 * Add a client to the group. Any authenticated staff. Rate limited 20/60s.
 * Body: { client_id, role? }
 * The DB trigger `group_members_enforce_size` enforces the max_members cap.
 * Returns { member } (201).
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

    const rl = rateLimit(`groups:memberAdd:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
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
    const clientId = typeof clean.client_id === 'string' ? clean.client_id : ''

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400, headers: rlHeaders })
    }

    let memberRole = 'member'
    if (clean.role !== undefined && clean.role !== null && clean.role !== '') {
      memberRole = String(clean.role)
      if (!VALID_MEMBER_ROLES.includes(memberRole)) {
        return NextResponse.json(
          { error: `role must be one of: ${VALID_MEMBER_ROLES.join(', ')}` },
          { status: 400, headers: rlHeaders }
        )
      }
    }

    // Group must exist and not be dissolved/archived
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name, max_members, status, archived_at')
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
        { error: 'Cannot add members to a dissolved or archived group' },
        { status: 400, headers: rlHeaders }
      )
    }

    // Client must exist and be active
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, status')
      .eq('id', clientId)
      .maybeSingle()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500, headers: rlHeaders })
    }
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: rlHeaders })
    }
    if ((client as any).status !== 'active') {
      return NextResponse.json(
        { error: 'Client must be active to join a group' },
        { status: 400, headers: rlHeaders }
      )
    }

    // Client must not already be an active member of this group
    const { data: existingMembership, error: membershipError } = await supabase
      .from('group_members' as any)
      .select('id')
      .eq('group_id', params.id)
      .eq('client_id', clientId)
      .is('date_left', null)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500, headers: rlHeaders })
    }
    if (existingMembership) {
      return NextResponse.json(
        { error: 'Client is already an active member of this group' },
        { status: 409, headers: rlHeaders }
      )
    }

    const { data, error } = await supabase
      .from('group_members' as any)
      .insert({
        group_id: params.id,
        client_id: clientId,
        role: memberRole,
        date_joined: new Date().toISOString().split('T')[0],
      })
      .select('*')
      .single()

    if (error) {
      // DB trigger `group_members_enforce_size` raises when the group is full
      const isCapError =
        (error as any).code === 'P0001' && /max|full|size|member/i.test((error as any).message || '')
      if (isCapError) {
        return NextResponse.json(
          { error: `Group is full (max ${(group as any).max_members ?? 15} members). Consider the waitlist.` },
          { status: 409, headers: rlHeaders }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_members',
      record_id: (data as any).id,
      action: 'group_member_add',
      old_values: null,
      new_values: { group_id: params.id, client_id: clientId, role: memberRole },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[POST /api/groups/[id]/members] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ member: data }, { status: 201, headers: rlHeaders })
  } catch (err: any) {
    console.error('[POST /api/groups/[id]/members] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}

/**
 * PATCH /api/groups/[id]/members
 * Update a member's role. Any authenticated staff. Rate limited 30/60s.
 * Body: { member_id, role }
 * Returns { member }.
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

    const rl = rateLimit(`groups:memberRole:${profile.id}`, { maxRequests: 30, windowMs: 60000 })
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
    const memberId = typeof clean.member_id === 'string' ? clean.member_id : ''
    const role = typeof clean.role === 'string' ? clean.role : ''

    if (!memberId) {
      return NextResponse.json({ error: 'member_id is required' }, { status: 400, headers: rlHeaders })
    }
    if (!role || !VALID_MEMBER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${VALID_MEMBER_ROLES.join(', ')}` },
        { status: 400, headers: rlHeaders }
      )
    }

    const { data: membership, error: fetchError } = await supabase
      .from('group_members' as any)
      .select('*')
      .eq('id', memberId)
      .eq('group_id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!membership) {
      return NextResponse.json(
        { error: 'Membership record not found in this group' },
        { status: 404, headers: rlHeaders }
      )
    }
    if ((membership as any).date_left !== null) {
      return NextResponse.json(
        { error: 'Cannot change the role of a former member' },
        { status: 409, headers: rlHeaders }
      )
    }

    const oldRole = (membership as any).role

    const { data, error } = await supabase
      .from('group_members' as any)
      .update({ role })
      .eq('id', memberId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_members',
      record_id: memberId,
      action: 'group_member_role',
      old_values: { role: oldRole ?? null },
      new_values: { role },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[PATCH /api/groups/[id]/members] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ member: data }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[PATCH /api/groups/[id]/members] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}

/**
 * DELETE /api/groups/[id]/members?memberId=<uuid>
 * Remove an active member (soft removal: sets date_left, removal_reason, removed_by).
 * Any authenticated staff. Rate limited 20/60s.
 * Body (optional): { removal_reason? }
 * Returns { success, member }.
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

    const rl = rateLimit(`groups:memberRemove:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
    rlHeaders = getRateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    const memberId = sanitizeInput(request.nextUrl.searchParams.get('memberId') || '')
    if (!memberId) {
      return NextResponse.json(
        { error: 'memberId query parameter is required' },
        { status: 400, headers: rlHeaders }
      )
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const clean = sanitizeObject(body || {}) as Record<string, any>
    const removalReason =
      typeof clean.removal_reason === 'string' && clean.removal_reason ? clean.removal_reason : null

    const { data: membership, error: fetchError } = await supabase
      .from('group_members' as any)
      .select('*')
      .eq('id', memberId)
      .eq('group_id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!membership) {
      return NextResponse.json(
        { error: 'Membership record not found in this group' },
        { status: 404, headers: rlHeaders }
      )
    }
    if ((membership as any).date_left !== null) {
      return NextResponse.json(
        { error: 'Member has already left the group' },
        { status: 409, headers: rlHeaders }
      )
    }

    const { data, error } = await supabase
      .from('group_members' as any)
      .update({
        date_left: new Date().toISOString().split('T')[0],
        removal_reason: removalReason,
        removed_by: profile.id,
      })
      .eq('id', memberId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_members',
      record_id: memberId,
      action: 'group_member_remove',
      old_values: { date_left: null, removal_reason: null },
      new_values: {
        date_left: (data as any).date_left,
        removal_reason: removalReason,
        client_id: (membership as any).client_id,
        group_id: params.id,
      },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[DELETE /api/groups/[id]/members] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ success: true, member: data }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[DELETE /api/groups/[id]/members] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
