import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { UserRole } from '@/lib/supabase/database.types'

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

    if (currentProfile?.role !== 'accountant_admin') {
      return NextResponse.json({ error: 'Forbidden: Only accountant_admin can modify staff accounts' }, { status: 403 })
    }

    const targetUserId = params.id
    const body = await request.json()
    const { role, is_active, fullName, branch, email, newPassword } = body

    const adminClient = createAdminClient()

    // Prevent admin from accidentally decommissioning their own account
    if (targetUserId === currentUser.id && is_active === false) {
      return NextResponse.json(
        { error: 'Cannot decommission your own active super-admin account' },
        { status: 400 }
      )
    }

    // 1. Prepare updates for public.users
    const profileUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (role !== undefined) {
      const validRoles: UserRole[] = ['loan_officer', 'supervisor', 'manager', 'accountant_admin']
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

    if (branch !== undefined) {
      profileUpdates.branch = branch ? branch.trim() : null
    }

    if (email !== undefined && email.trim()) {
      profileUpdates.email = email.trim().toLowerCase()
    }

    const { data: updatedProfile, error: profileErr } = await adminClient
      .from('users')
      .update(profileUpdates as any)
      .eq('id', targetUserId)
      .select()
      .single()

    if (profileErr) throw profileErr

    // 2. Prepare updates for Auth (auth.users)
    const authUpdates: Record<string, any> = {}

    if (newPassword && newPassword.trim()) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      authUpdates.password = newPassword.trim()
    }

    if (email && email.trim()) {
      authUpdates.email = email.trim().toLowerCase()
    }

    if (fullName || role || branch) {
      authUpdates.user_metadata = {
        full_name: updatedProfile.full_name,
        role: updatedProfile.role,
        branch: updatedProfile.branch,
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

    if (currentProfile?.role !== 'accountant_admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const targetUserId = params.id
    if (targetUserId === currentUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const adminClient = createAdminClient()

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
