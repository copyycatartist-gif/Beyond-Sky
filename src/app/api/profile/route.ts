import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name,
        role: profile?.role,
        isActive: profile?.is_active,
        createdAt: profile?.created_at,
        updatedAt: profile?.updated_at,
      },
    })
  } catch (err: any) {
    console.error('Error fetching profile:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { fullName, email, newPassword } = body

    const adminClient = createAdminClient()

    // 1. If changing password, update via Supabase Auth (self only)
    if (newPassword && newPassword.trim()) {
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
      }

      const { error: passErr } = await adminClient.auth.admin.updateUserById(user.id, {
        password: newPassword.trim(),
      })

      if (passErr) {
        throw new Error(passErr.message || 'Failed to update password')
      }
    }

    // 2. If changing email, update auth.users and public.users
    if (email && email.trim() && email.trim().toLowerCase() !== user.email?.toLowerCase()) {
      const newEmail = email.trim().toLowerCase()
      const { error: emailErr } = await adminClient.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true,
      })

      if (emailErr) {
        throw new Error(emailErr.message || 'Failed to update email address')
      }

      await adminClient.from('users').update({ email: newEmail }).eq('id', user.id)
    }

    // 3. Update public.users profile (display name only)
    const profileUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (fullName !== undefined && fullName.trim()) {
      profileUpdates.full_name = fullName.trim()
    }

    const { data: updatedProfile, error: profileErr } = await adminClient
      .from('users')
      .update(profileUpdates as any)
      .eq('id', user.id)
      .select()
      .single()

    if (profileErr) throw profileErr

    // Update user metadata in Auth
    await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: updatedProfile.full_name,
        role: updatedProfile.role,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Your login credentials and profile details were updated successfully.',
      profile: updatedProfile,
    })
  } catch (err: any) {
    console.error('Error updating self profile:', err)
    return NextResponse.json({ error: err.message || 'Failed to update profile' }, { status: 500 })
  }
}
