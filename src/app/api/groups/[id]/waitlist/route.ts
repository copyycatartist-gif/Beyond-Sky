import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize'

/**
 * GET /api/groups/[id]/waitlist
 * List waiting entries with client info, ordered priority DESC, date_added ASC.
 * Returns { waitlist }.
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

    const { data, error } = await supabase
      .from('group_waitlist' as any)
      .select(
        `
        id, group_id, client_id, priority, date_added, added_by, notes, status,
        client:clients (id, full_name, account_number, phone_number, status)
        `
      )
      .eq('group_id', params.id)
      .eq('status', 'waiting')
      .order('priority', { ascending: false })
      .order('date_added', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ waitlist: (data || []) as any[] })
  } catch (err: any) {
    console.error('[GET /api/groups/[id]/waitlist] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/[id]/waitlist
 * Add a client to the waitlist. Any authenticated staff. Rate limited 20/60s.
 * Body: { client_id, priority?, notes? }
 * Returns { entry } (201).
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

    const rl = rateLimit(`groups:waitlistAdd:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
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

    let priority = 0
    if (clean.priority !== undefined && clean.priority !== null && clean.priority !== '') {
      priority = parseInt(String(clean.priority), 10)
      if (Number.isNaN(priority) || priority < 0) {
        return NextResponse.json(
          { error: 'priority must be a non-negative number' },
          { status: 400, headers: rlHeaders }
        )
      }
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500, headers: rlHeaders })
    }
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404, headers: rlHeaders })
    }

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

    const { data: entry, error } = await supabase
      .from('group_waitlist' as any)
      .insert({
        group_id: params.id,
        client_id: clientId,
        priority,
        notes: typeof clean.notes === 'string' && clean.notes ? clean.notes : null,
        status: 'waiting',
        added_by: profile.id,
      })
      .select('*')
      .single()

    if (error) {
      // UNIQUE(group_id, client_id) violation
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'Client is already on this group\'s waitlist' },
          { status: 409, headers: rlHeaders }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_waitlist',
      record_id: (entry as any).id,
      action: 'group_waitlist_add',
      old_values: null,
      new_values: { group_id: params.id, client_id: clientId, priority },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[POST /api/groups/[id]/waitlist] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ entry }, { status: 201, headers: rlHeaders })
  } catch (err: any) {
    console.error('[POST /api/groups/[id]/waitlist] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}

/**
 * DELETE /api/groups/[id]/waitlist?entryId=<uuid>
 * Remove a waitlist entry (sets status='removed'). Any authenticated staff.
 * Rate limited 20/60s. Returns { success }.
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

    const rl = rateLimit(`groups:waitlistRemove:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
    rlHeaders = getRateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    const entryId = sanitizeInput(request.nextUrl.searchParams.get('entryId') || '')
    if (!entryId) {
      return NextResponse.json(
        { error: 'entryId query parameter is required' },
        { status: 400, headers: rlHeaders }
      )
    }

    const { data: existing, error: fetchError } = await supabase
      .from('group_waitlist' as any)
      .select('*')
      .eq('id', entryId)
      .eq('group_id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404, headers: rlHeaders })
    }

    const { data, error } = await supabase
      .from('group_waitlist' as any)
      .update({ status: 'removed' })
      .eq('id', entryId)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_waitlist',
      record_id: entryId,
      action: 'group_waitlist_remove',
      old_values: { status: (existing as any).status ?? null },
      new_values: { status: 'removed' },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[DELETE /api/groups/[id]/waitlist] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ success: true, entry: data }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[DELETE /api/groups/[id]/waitlist] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
