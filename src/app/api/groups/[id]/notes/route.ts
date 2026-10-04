import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize'

/**
 * GET /api/groups/[id]/notes
 * List notes for a group with author name. Returns { notes }.
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
      .from('group_notes' as any)
      .select(
        `
        id, group_id, content, created_by, created_at,
        author:users (full_name)
        `
      )
      .eq('group_id', params.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notes: (data || []) as any[] })
  } catch (err: any) {
    console.error('[GET /api/groups/[id]/notes] error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/[id]/notes
 * Add a note. Any authenticated staff. Rate limited 20/60s.
 * Body: { content }
 * Returns { note } (201).
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

    const rl = rateLimit(`groups:noteAdd:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
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
    const content = typeof clean.content === 'string' ? clean.content : ''

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400, headers: rlHeaders })
    }
    if (content.length > 5000) {
      return NextResponse.json(
        { error: 'content must be 5000 characters or fewer' },
        { status: 400, headers: rlHeaders }
      )
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

    const { data: note, error } = await supabase
      .from('group_notes' as any)
      .insert({
        group_id: params.id,
        content,
        created_by: profile.id,
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_notes',
      record_id: (note as any).id,
      action: 'group_note_add',
      old_values: null,
      new_values: { group_id: params.id, content },
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[POST /api/groups/[id]/notes] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ note }, { status: 201, headers: rlHeaders })
  } catch (err: any) {
    console.error('[POST /api/groups/[id]/notes] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}

/**
 * DELETE /api/groups/[id]/notes?noteId=<uuid>
 * Delete a note. Any authenticated staff. Rate limited 20/60s.
 * Returns { success }.
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

    const rl = rateLimit(`groups:noteDelete:${profile.id}`, { maxRequests: 20, windowMs: 60000 })
    rlHeaders = getRateLimitHeaders(rl)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    const noteId = sanitizeInput(request.nextUrl.searchParams.get('noteId') || '')
    if (!noteId) {
      return NextResponse.json(
        { error: 'noteId query parameter is required' },
        { status: 400, headers: rlHeaders }
      )
    }

    const { data: existing, error: fetchError } = await supabase
      .from('group_notes' as any)
      .select('*')
      .eq('id', noteId)
      .eq('group_id', params.id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500, headers: rlHeaders })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404, headers: rlHeaders })
    }

    const { error } = await supabase
      .from('group_notes' as any)
      .delete()
      .eq('id', noteId)
      .eq('group_id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: rlHeaders })
    }

    const { error: auditError } = await supabase.from('audit_log').insert({
      table_name: 'group_notes',
      record_id: noteId,
      action: 'group_note_delete',
      old_values: existing,
      new_values: null,
      changed_by: profile.id,
    })

    if (auditError) {
      console.error('[DELETE /api/groups/[id]/notes] audit_log insert failed:', auditError.message)
    }

    return NextResponse.json({ success: true }, { headers: rlHeaders })
  } catch (err: any) {
    console.error('[DELETE /api/groups/[id]/notes] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: rlHeaders }
    )
  }
}
