import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'accountant_admin' && profile?.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden: Only a manager or super admin can modify business rule settings' },
        { status: 403 }
      )
    }

    const { settings } = await request.json()

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    for (const [key, value] of Object.entries(settings)) {
      await adminClient
        .from('settings')
        .update({
          value: String(value),
          updated_by: user.id,
        })
        .eq('key', key)
    }

    return NextResponse.json({ success: true, message: 'Settings updated successfully' })
  } catch (err: any) {
    console.error('[Settings Update Error]', err)
    return NextResponse.json({ error: err.message || 'Failed to update settings' }, { status: 500 })
  }
}
