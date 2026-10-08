import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { sanitizeInput } from '@/lib/sanitize'

const VALID_STATUSES = ['active', 'inactive', 'suspended', 'dissolved', 'forming']

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
      .eq('group_type', 'disbursement')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) {
      query = query.eq('status', status as any)
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
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('group_type', 'disbursement'),
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('group_type', 'disbursement').eq('status', 'active'),
      supabase.from('groups').select('id', { count: 'exact', head: true }).eq('group_type', 'disbursement').eq('status', 'forming'),
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
 * Disbursement groups are created when a loan is paid out.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Groups are created automatically when a loan is disbursed.' },
    { status: 400 }
  )
}
