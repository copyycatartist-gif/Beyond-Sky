import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTemplatedSms } from '@/lib/sms/send'

/**
 * POST /api/clients/welcome-sms
 * Body: { clientId: string }
 * Sends the welcome SMS after a client is first registered.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const clientId = body?.clientId as string | undefined

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: client, error } = await adminClient
      .from('clients')
      .select('id, full_name, phone_number, account_number')
      .eq('id', clientId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    if (!client.phone_number) {
      return NextResponse.json({ error: 'Client has no phone number' }, { status: 400 })
    }

    // Avoid duplicate welcome SMS if one was already logged for this client
    const { data: existing } = await adminClient
      .from('sms_log')
      .select('id')
      .eq('client_id', client.id)
      .eq('message_type', 'welcome')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Welcome SMS already sent for this client',
      })
    }

    const result = await sendTemplatedSms(
      client.phone_number,
      'welcome',
      [client.full_name, client.account_number],
      { clientId: client.id }
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send welcome SMS' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Welcome SMS sent',
    })
  } catch (err: any) {
    console.error('[Welcome SMS Error]', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to send welcome SMS' },
      { status: 500 }
    )
  }
}
