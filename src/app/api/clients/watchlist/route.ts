import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'

const AUTHORIZED_ROLES = ['manager', 'supervisor', 'accountant_admin']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !AUTHORIZED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { clientId, watchlisted, reason } = await request.json()

  if (!clientId || typeof watchlisted !== 'boolean') {
    return NextResponse.json(
      { error: 'clientId and watchlisted (boolean) are required' },
      { status: 400 }
    )
  }

  if (watchlisted && !reason?.trim()) {
    return NextResponse.json(
      { error: 'reason is required when adding to watchlist' },
      { status: 400 }
    )
  }

  const updates = watchlisted
    ? {
        is_watchlisted: true,
        watchlist_reason: reason.trim(),
        watchlist_by: profile.id,
        watchlist_at: new Date().toISOString(),
      }
    : {
        is_watchlisted: false,
        watchlist_reason: null,
        watchlist_by: null,
        watchlist_at: null,
      }

  const { error } = await supabase
    .from('clients')
    .update(updates as any)
    .eq('id', clientId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
