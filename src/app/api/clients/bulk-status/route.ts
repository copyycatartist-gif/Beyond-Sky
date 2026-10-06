import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput } from '@/lib/sanitize'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !['manager', 'supervisor', 'accountant_admin'].includes(profile.role || '')) {
    return NextResponse.json({ error: 'Forbidden: requires manager role' }, { status: 403 })
  }

  const rl = rateLimit(`bulk-status:${user.id}`, { maxRequests: 10, windowMs: 60000 })
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    )
  }

  const { ids, status } = await request.json()

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const validStatuses = ['active', 'inactive', 'defaulted']
  const cleanStatus = sanitizeInput(status || '')
  if (!validStatuses.includes(cleanStatus)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 clients per bulk operation' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clients')
    .update({ status: cleanStatus as any })
    .in('id', ids)
    .select('id, full_name, status')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data.length, clients: data }, { headers: getRateLimitHeaders(rl) })
}
