import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { assignableStaffRoles, canAdministerStaff, SUPER_ADMIN_ROLE } from '@/lib/roles'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
      return NextResponse.json({ error: 'Forbidden: Only a super admin or manager can modify staff accounts' }, { status: 403 })
    }

    const targetUserId = params.id
    const body = await request.json()
    const { role, is_active, fullName, email, newPassword } = body

    // Login email and password may only be changed by the account holder via /api/profile
    if (email !== undefined || newPassword !== undefined) {
      return NextResponse.json(
        { error: 'Only the account holder can change login credentials' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    const { data: targetProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', targetUserId)
      .maybeSingle()

    if (
      !targetProfile ||
      (targetProfile.role === SUPER_ADMIN_ROLE && currentProfile?.role !== SUPER_ADMIN_ROLE)
    ) {
      return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
    }

    // Prevent staff administrators from decommissioning their own account
    if (targetUserId === currentUser.id && is_active === false) {
      return NextResponse.json(
        { error: 'Cannot decommission your own account' },
        { status: 400 }
      )
    }

    // 1. Prepare updates for public.users (role / status / display name only)
    const profileUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (role !== undefined) {
      const validRoles = assignableStaffRoles(currentProfile?.role)
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 })
      }
      profileUpdates.role = role
    }

    if (is_active !== undefined) {
      profileUpdates.is_active = Boolean(is_active)
    }

    if (fullName !== undefined && fullName.trim()) {
      profileUpdates.full_name = fullName.trim()
    }

    const { data: updatedProfile, error: profileErr } = await adminClient
      .from('users')
      .update(profileUpdates as any)
      .eq('id', targetUserId)
      .select()
      .single()

    if (profileErr) throw profileErr

    // 2. Auth updates for metadata / ban status only (never credentials)
    const authUpdates: Record<string, any> = {}

    if (fullName || role) {
      authUpdates.user_metadata = {
        full_name: updatedProfile.full_name,
        role: updatedProfile.role,
      }
    }

    // If user is decommissioned, ban their auth account or vice versa
    if (is_active === false) {
      authUpdates.ban_duration = '876000h' // 100 years
    } else if (is_active === true) {
      authUpdates.ban_duration = 'none'
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        authUpdates
      )
      if (authErr) {
        console.error('Error updating auth.users for user', targetUserId, authErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Staff account updated successfully',
      user: updatedProfile,
    })
  } catch (err: any) {
    console.error('Error updating user:', err)
    return NextResponse.json({ error: err.message || 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
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
      return NextResponse.json({ error: 'Forbidden: Only a super admin or manager can remove staff accounts' }, { status: 403 })
    }

    const targetUserId = params.id
    if (targetUserId === currentUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: targetProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', targetUserId)
      .maybeSingle()

    if (
      !targetProfile ||
      (targetProfile.role === SUPER_ADMIN_ROLE && currentProfile?.role !== SUPER_ADMIN_ROLE)
    ) {
      return NextResponse.json({ error: 'Staff account not found' }, { status: 404 })
    }

    // 1. Decommission or delete user from Auth
    const { error: authErr } = await adminClient.auth.admin.deleteUser(targetUserId)
    if (authErr) throw authErr

    // 2. Remove profile from public.users
    await adminClient.from('users').delete().eq('id', targetUserId)

    return NextResponse.json({
      success: true,
      message: 'User successfully removed from system',
    })
  } catch (err: any) {
    console.error('Error deleting user:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete user' }, { status: 500 })
  }
}
