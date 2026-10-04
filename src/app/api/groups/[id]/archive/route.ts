import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'

const ARCHIVE_ROLES = ['manager', 'supervisor', 'accountant_admin']

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!ARCHIVE_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden: Only manager, supervisor or accountant_admin can archive groups' },
      { status: 403 }
    )
  }

  const { archived } = await request.json()

  if (typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'archived must be a boolean' }, { status: 400 })
  }

  const updates = archived
    ? {
        status: 'inactive' as const,
        archived_at: new Date().toISOString(),
        archived_by: profile.id,
      }
    : {
        archived_at: null,
        archived_by: null,
      }

  const { data, error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', params.id)
    .select('id, status, archived_at, archived_by')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, group: data })
}
