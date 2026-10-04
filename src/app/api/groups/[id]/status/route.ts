import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput } from '@/lib/sanitize'

const MANAGER_PLUS = ['manager', 'supervisor', 'accountant_admin']

/** Allowed group status transitions. 'dissolved' is terminal. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  active: ['inactive', 'dissolved'],
  inactive: ['active', 'dissolved'],
  dissolved: [],
}

/**
 * POST /api/groups/[id]/status
 * Change a group's status. Requires manager or above. Rate limited.
 * Body: { new_status, reason? }. Logs the change to audit_log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !MANAGER_PLUS.includes(profile.role || '')) {
    return NextResponse.json(
      { error: 'Forbidden: requires manager role or above' },
      { status: 403 }
    )
  }

  const rl = rateLimit(`group-status:${user.id}`, { maxRequests: 10, windowMs: 60000 })
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const newStatus = sanitizeInput(typeof body?.new_status === 'string' ? body.new_status : '')
  const reason = sanitizeInput(typeof body?.reason === 'string' ? body.reason : '') || null

  if (!newStatus) {
    return NextResponse.json({ error: 'new_status is required' }, { status: 400, headers: getRateLimitHeaders(rl) })
  }
  if (!Object.keys(ALLOWED_TRANSITIONS).includes(newStatus)) {
    return NextResponse.json(
      { error: `new_status must be one of: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}` },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  const { data: group, error: fetchError } = await supabase
    .from('groups')
    .select('id, name, status, archived_at')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500, headers: getRateLimitHeaders(rl) })
  }
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: getRateLimitHeaders(rl) })
  }

  const currentStatus = (group as any).status as string
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status transition: '${currentStatus}' -> '${newStatus}'`,
        allowed_transitions: allowed,
      },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  if (newStatus === 'dissolved' && !reason) {
    return NextResponse.json(
      { error: 'reason is required when dissolving a group' },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  const now = new Date().toISOString()

  const updates: Record<string, any> = {
    status: newStatus,
    updated_at: now,
  }

  // Dissolving via status change also archives the group
  if (newStatus === 'dissolved') {
    updates.archived_at = now
    updates.archived_by = profile.id
    updates.dissolution_reason = reason
  }

  const { data, error } = await supabase
    .from('groups')
    .update(updates as any)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: getRateLimitHeaders(rl) })
  }

  // Audit trail
  const { error: auditError } = await supabase.from('audit_log').insert({
    table_name: 'groups',
    record_id: params.id,
    action: 'status_change',
    old_values: { status: currentStatus },
    new_values: { status: newStatus, reason },
    changed_by: profile.id,
  })

  if (auditError) {
    console.error('[groups/[id]/status] audit_log insert failed:', auditError.message)
  }

  return NextResponse.json(
    { success: true, group: data, previous_status: currentStatus },
    { headers: getRateLimitHeaders(rl) }
  )
}
