import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { assignableStaffRoles, canAdministerStaff, visibleStaff } from '@/lib/roles'

export async function GET() {
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

    if (!canAdministerStaff(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden: Staff administration access required' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const { data: users, error } = await adminClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ users: visibleStaff(users || [], profile?.role) })
  } catch (err: any) {
    console.error('Error fetching users:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (!canAdministerStaff(currentProfile?.role)) {
      return NextResponse.json({ error: 'Forbidden: Only a super admin or manager can create staff' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, fullName, role = 'loan_officer' } = body

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Missing required fields: email, password, fullName' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const validRoles = assignableStaffRoles(currentProfile?.role)
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        role: role,
      },
    })

    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Failed to create user in Auth system')
    }

    // 2. Ensure profile row exists in public.users
    const { data: profileData, error: profileError } = await adminClient
      .from('users')
      .upsert({
        id: authData.user.id,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role: role,
        branch: null,
        is_active: true,
      })
      .select()
      .single()

    if (profileError) {
      console.error('Error upserting public.users profile:', profileError)
    }

    return NextResponse.json({
      success: true,
      message: `Staff user '${fullName}' successfully created with role '${role}'.`,
      user: profileData || {
        id: authData.user.id,
        email: authData.user.email,
        full_name: fullName,
        role,
        branch: null,
        is_active: true,
      },
    })
  } catch (err: any) {
    console.error('Error creating staff user:', err)
    return NextResponse.json({ error: err.message || 'Failed to create user' }, { status: 500 })
  }
}
