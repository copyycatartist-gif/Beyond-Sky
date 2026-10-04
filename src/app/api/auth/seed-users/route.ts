import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Clean & Re-Seed Staff Test Accounts
 * Safely removes any corrupted mock users and creates fresh, GoTrue-compliant accounts.
 */
export async function GET() {
  try {
    const adminClient = createAdminClient()

    const targetUsers = [
      {
        email: 'officer@test.local',
        password: 'TestPass123!',
        fullName: 'Ama Osei',
        role: 'loan_officer' as const,
      },
      {
        email: 'manager@test.local',
        password: 'TestPass123!',
        fullName: 'Kwame Mensah',
        role: 'manager' as const,
      },
      {
        email: 'supervisor@test.local',
        password: 'TestPass123!',
        fullName: 'Efua Asante',
        role: 'supervisor' as const,
      },
      {
        email: 'admin@test.local',
        password: 'TestPass123!',
        fullName: 'Kofi Boateng',
        role: 'accountant_admin' as const,
      },
    ]

    // 1. Fetch all existing auth users
    const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 100 })
    const existingUsers = listData?.users || []

    const results = []

    for (const target of targetUsers) {
      // Find if user already exists
      const existing = existingUsers.find((u) => u.email?.toLowerCase() === target.email.toLowerCase())

      let userId = existing?.id

      if (existing) {
        // Update existing user's password and confirmed status
        const { data: updated, error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
          password: target.password,
          email_confirm: true,
          user_metadata: {
            full_name: target.fullName,
            role: target.role,
          },
        })

        if (updateErr) {
          // If updating fails due to corrupt identity, delete and recreate
          await adminClient.auth.admin.deleteUser(existing.id)
          userId = undefined
        } else {
          userId = updated.user.id
        }
      }

      if (!userId) {
        // Create fresh user via Auth Admin API
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email: target.email,
          password: target.password,
          email_confirm: true,
          user_metadata: {
            full_name: target.fullName,
            role: target.role,
          },
        })

        if (createErr) {
          throw new Error(`Failed to create ${target.email}: ${createErr.message}`)
        }
        userId = created.user.id
      }

      // 2. Ensure public.users profile exists with correct role
      if (userId) {
        await adminClient.from('users').upsert({
          id: userId,
          full_name: target.fullName,
          email: target.email,
          role: target.role,
          is_active: true,
        })

        results.push({ email: target.email, role: target.role, userId, status: 'ready' })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'All 4 staff test accounts successfully provisioned and synchronized with Supabase GoTrue!',
      users: results,
    })
  } catch (err: any) {
    console.error('[Seed Users API Error]', err)
    return NextResponse.json({ error: err.message || 'Failed to seed users' }, { status: 500 })
  }
}
