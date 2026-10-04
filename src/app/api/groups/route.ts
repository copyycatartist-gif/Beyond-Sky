import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize'

const MANAGER_PLUS = ['manager', 'supervisor', 'accountant_admin']
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'dissolved', 'forming']
const VALID_GROUP_TYPES = ['solidarity', 'individual', 'cooperative']

/**
 * GET /api/groups
 * List lending groups with server-side pagination, filters and stat-card aggregates.
 * Query params: search, branch, status, page (default 1), limit (default 20, max 100).
 * Returns { groups, total, page, totalPages, stats: { total_groups, active_groups, total_members, forming_groups } }.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const profile = await getCurrentUserProfile()

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const search = sanitizeInput(searchParams.get('search') || '')
    const branch = sanitizeInput(searchParams.get('branch') || '')
    const status = sanitizeInput(searchParams.get('status') || '')

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('groups')
      .select(
        `
        id, group_number, name, branch, area, meeting_day, meeting_place,
        max_members, status, group_type, description, photo_url, leader_id,
        formed_at, archived_at, dissolution_reason, min_member_tenure_days,
        require_guarantor_chain, created_by, created_at, updated_at,
        group_members (id, date_left)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) {
      query = query.eq('status', status)
    }
    if (branch) {
      query = query.eq('branch', branch)
    }
    if (search) {
      const escaped = search.replace(/[%_,()]/g, ' ').trim()
      if (escaped) {
        query = query.or(`name.ilike.%${escaped}%,group_number.ilike.%${escaped}%`)
      }
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const groups = (data || []).map((g: any) => {
      const activeMemberCount = (g.group_members || []).filter((m: any) => m.date_left === null).length
      const { group_members, ...rest } = g
      return { ...rest, active_member_count: activeMemberCount }
    })

    const total = count ?? groups.length
    const totalPages = Math.max(1, Math.ceil(total / limit))

    // Aggregate counts for stat cards (global, not filtered)
    const [totalGroupsRes, activeGroupsRes, formingGroupsRes, totalMembersRes] = await Promise.all([
      supabase.from('groups').select('id', { count: 'exact', head: true }),
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('status', 'forming'),
      supabase.from('group_members' as any).select('id', { count: 'exact', head: true }).is('date_left', null),
    ])

    const stats = {
      total_groups: totalGroupsRes.count ?? 0,
      active_groups: activeGroupsRes.count ?? 0,
      total_members: totalMembersRes.count ?? 0,
      forming_groups: formingGroupsRes.count ?? 0,
    }

    return NextResponse.json({ groups, total, page, totalPages, stats })
  } catch (err: any) {
    console.error('[GET /api/groups] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups
 * Create a lending group. Manager+ only. Rate limited 20/60s.
 * Body: { name, branch?, area?, meeting_day?, meeting_place?, max_members?,
 *         group_type?, description?, status? }
 * Returns { group } (201).
 */
export async function POST(request: NextRequest) {
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

    const rl = rateLimit(`groups:create:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
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

    const name = typeof clean.name === 'string' ? clean.name : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400, headers: rlHeaders })
    }
    if (name.length > 150) {
      return NextResponse.json({ error: 'name must be 150 characters or fewer' }, { status: 400, headers: rlHeaders })
    }

    let maxMembers = 15
    if (clean.max_members !== undefined && clean.max_members !== null && clean.max_members !== '') {
      maxMembers = parseInt(String(clean.max_members), 10)
      if (Number.isNaN(maxMembers) || maxMembers < 1 || maxMembers > 15) {
        return NextResponse.json(
          { error: 'max_members must be a number between 1 and 15' },
          { status: 400, headers: rlHeaders }
        )
      }
    }

    if (clean.group_type && !VALID_GROUP_TYPES.includes(clean.group_type)) {
      return NextResponse.json(
        { error: `group_type must be one of: ${VALID_GROUP_TYPES.join(', ')}` },
        { status: 400, headers: rlHeaders }
      )
    }

    const status = clean.status && VALID_STATUSES.includes(clean.status) ? clean.status : 'forming'

    const insertPayload: Record<string, any> = {
      name,
      branch: clean.branch || null,
      area: clean.area || null,
      meeting_day: clean.meeting_day || null,
      meeting_place: clean.meeting_place || null,
      max_members: maxMembers,
      group_type: clean.group_type || null,
      description: clean.description || null,
      status,
      created_by: profile.id,
    }

    const { data, error } = await supabase
      .from('groups')
      .insert(insertPayload as any)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'groups',
      record_id: (data as any).id,
      action: 'group_create',
      old_values: null,
      new_values: data,
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[POST /api/groups] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ group: data }, { status: 201, headers: rlHeaders })
  } catch (err: any) {
    console.error('[POST /api/groups] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
