import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput } from '@/lib/sanitize'
import { sendTemplatedSms } from '@/lib/sms/send'
import {
  LINK_DAYS,
  applicationUrl,
  clientApplyBlock,
} from '@/lib/loans/application-link'

/**
 * Create a private loan application link for one registered client.
 * Body: { clientId, sendSms?: boolean }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rl = rateLimit(`loan-link:${user.id}`, { maxRequests: 10, windowMs: 60_000 })
  const headers = getRateLimitHeaders(rl)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many links. Wait a minute and try again.' }, { status: 429, headers })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers })
  }

  const clientId = sanitizeInput(String(body.clientId || ''))
  const sendSms = body.sendSms === true
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400, headers })

  const admin = createAdminClient()
  const { data: client, error: clientError } = await admin
    .from('clients' as any)
    .select('id, full_name, phone_number, status, is_watchlisted, archived_at')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404, headers })
  }

  const blocked = await clientApplyBlock(admin, client)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409, headers })

  const now = new Date()
  const expires = new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000)

  await admin
    .from('loan_application_links' as any)
    .update({ revoked_at: now.toISOString() } as never)
    .eq('client_id', clientId)
    .is('used_at', null)
    .is('revoked_at', null)

  const { data: link, error: insertError } = await admin
    .from('loan_application_links' as any)
    .insert({
      client_id: clientId,
      created_by: user.id,
      expires_at: expires.toISOString(),
    } as never)
    .select('id')
    .single()

  if (insertError || !link) {
    return NextResponse.json({ error: insertError?.message || 'Could not create the link' }, { status: 500, headers })
  }

  const url = applicationUrl(request, (link as any).id)
  let smsSent = false
  let smsError: string | null = null
  if (sendSms) {
    const result = await sendTemplatedSms(
      (client as any).phone_number,
      'application_link',
      [(client as any).full_name, url],
      { clientId }
    )
    smsSent = result.success
    smsError = result.success ? null : result.error || 'The text could not be sent. Copy the link instead.'
  }

  return NextResponse.json({
    url,
    expiresAt: expires.toISOString(),
    smsSent,
    smsError,
  }, { headers })
}
