import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput } from '@/lib/sanitize'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = rateLimit(`groups:transfer:${profile.id}`, { maxRequests: 20, windowMs: 60_000 })
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many transfer attempts. Please wait a moment.' },
      { status: 429, headers: getRateLimitHeaders(limit) }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const memberId = typeof body?.member_id === 'string' ? body.member_id : null
  const targetGroupId = typeof body?.target_group_id === 'string' ? body.target_group_id : null
  const reason = body?.reason ? sanitizeInput(String(body.reason)) : null

  if (!memberId) {
    return NextResponse.json({ error: 'member_id is required' }, { status: 400 })
  }
  if (!targetGroupId) {
    return NextResponse.json({ error: 'target_group_id is required' }, { status: 400 })
  }
  if (targetGroupId === params.id) {
    return NextResponse.json({ error: 'Target group must differ from the current group' }, { status: 400 })
  }

  // Load the membership row being transferred
  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('id, group_id, client_id, date_left')
    .eq('id', memberId)
    .maybeSingle()

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Membership record not found' }, { status: 404 })
  }
  if (membership.group_id !== params.id) {
    return NextResponse.json({ error: 'Member does not belong to this group' }, { status: 400 })
  }
  if (membership.date_left) {
    return NextResponse.json({ error: 'Member has already left this group' }, { status: 409 })
  }

  // Validate the target group exists, is active, and has capacity
  const { data: targetGroup, error: targetError } = await supabase
    .from('groups')
    .select('id, name, status, max_members')
    .eq('id', targetGroupId)
    .maybeSingle()

  if (targetError || !targetGroup) {
    return NextResponse.json({ error: 'Target group not found' }, { status: 404 })
  }
  if (targetGroup.status === 'dissolved' || targetGroup.status === 'inactive') {
    return NextResponse.json(
      { error: `Target group is ${targetGroup.status} and cannot accept members` },
      { status: 409 }
    )
  }

  const { count: targetActiveCount, error: countError } = await supabase
    .from('group_members' as any)
    .select('id', { count: 'exact', head: true })
    .eq('group_id', targetGroupId)
    .is('date_left', null)

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }
  if ((targetActiveCount ?? 0) >= targetGroup.max_members) {
    return NextResponse.json(
      { error: `Target group is full (${targetGroup.max_members} member cap reached)` },
      { status: 409 }
    )
  }

  // Guard against an already-active membership in the target group
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', targetGroupId)
    .eq('client_id', membership.client_id)
    .is('date_left', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Client is already an active member of the target group' },
      { status: 409 }
    )
  }

  const today = new Date().toISOString().split('T')[0]

  // 1) Close out the membership in the source group
  const { error: leaveError } = await supabase
    .from('group_members')
    .update({
      date_left: today,
      removal_reason: reason ?? 'Transferred to another group',
      removed_by: profile.id,
    })
    .eq('id', memberId)

  if (leaveError) {
    return NextResponse.json({ error: leaveError.message }, { status: 500 })
  }

  // 2) Create the membership in the target group
  const { data: newMembership, error: joinError } = await supabase
    .from('group_members')
    .insert({
      group_id: targetGroupId,
      client_id: membership.client_id,
      date_joined: today,
      role: 'member',
    })
    .select('id')
    .single()

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 })
  }

  // 3) Audit trail
  await supabase.from('audit_log').insert({
    table_name: 'group_members',
    record_id: membership.client_id,
    action: 'group_member_transfer',
    old_values: { group_id: params.id, member_id: memberId },
    new_values: { group_id: targetGroupId, member_id: newMembership?.id ?? null, reason },
    changed_by: profile.id,
  })

  return NextResponse.json({ success: true, targetGroupName: targetGroup.name })
}
