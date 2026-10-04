import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, isValidGhanaPhone } from '@/lib/sanitize'
import { sendSms } from '@/lib/sms/send'

const MANAGER_PLUS = ['manager', 'supervisor', 'accountant_admin']
const MAX_MESSAGE_LENGTH = 480

/**
 * POST /api/groups/[id]/sms
 * Broadcast an SMS to all active members of a group. Manager+. Rate limited.
 * Body: { message }
 * Returns { sent, failed, total }.
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

  const rl = rateLimit(`group-sms:${user.id}`, { maxRequests: 3, windowMs: 60000 })
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many broadcast requests. Please wait before trying again.' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = sanitizeInput(typeof body?.message === 'string' ? body.message : '')

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400, headers: getRateLimitHeaders(rl) })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  // Group must exist and not be dissolved
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, status, archived_at')
    .eq('id', params.id)
    .maybeSingle()

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500, headers: getRateLimitHeaders(rl) })
  }
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: getRateLimitHeaders(rl) })
  }
  if ((group as any).status === 'dissolved' || (group as any).archived_at) {
    return NextResponse.json(
      { error: 'Cannot broadcast SMS for a dissolved or archived group' },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  // Fetch active members with their phone numbers
  const { data: members, error: membersError } = await supabase
    .from('group_members' as any)
    .select(
      `
      id, client_id,
      clients:client_id (id, full_name, phone_number, status)
      `
    )
    .eq('group_id', params.id)
    .is('date_left', null)

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500, headers: getRateLimitHeaders(rl) })
  }

  const recipients = ((members || []) as any[])
    .map((m) => m.clients)
    .filter((c): c is any => Boolean(c) && !Array.isArray(c) && c.status === 'active' && c.phone_number)

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No active members with phone numbers found in this group' },
      { status: 400, headers: getRateLimitHeaders(rl) }
    )
  }

  let sent = 0
  let failed = 0
  const failures: Array<{ client_id: string; full_name: string; error: string }> = []

  // Send sequentially to respect provider rate limits (groups cap at 15 members)
  for (const recipient of recipients) {
    const phone = String(recipient.phone_number).trim()

    if (!isValidGhanaPhone(phone)) {
      failed++
      failures.push({
        client_id: recipient.id,
        full_name: recipient.full_name,
        error: 'Invalid phone number format',
      })
      continue
    }

    const result = await sendSms({
      clientId: recipient.id,
      phone,
      messageType: 'broadcast' as any,
      message,
    })

    if (result.success) {
      sent++
    } else {
      failed++
      failures.push({
        client_id: recipient.id,
        full_name: recipient.full_name,
        error: result.error || 'SMS send failed',
      })
    }
  }

  const total = recipients.length

  // Audit trail for the broadcast
  const { error: auditError } = await supabase.from('audit_log').insert({
    table_name: 'groups',
    record_id: params.id,
    action: 'sms_broadcast',
    old_values: null,
    new_values: { message, sent, failed, total },
    changed_by: profile.id,
  })

  if (auditError) {
    console.error('[groups/[id]/sms] audit_log insert failed:', auditError.message)
  }

  return NextResponse.json(
    { sent, failed, total, failures },
    { headers: getRateLimitHeaders(rl) }
  )
}
