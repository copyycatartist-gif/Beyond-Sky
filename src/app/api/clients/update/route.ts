import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeObject } from '@/lib/sanitize'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getCurrentUserProfile()
  if (!profile || !['manager', 'accountant_admin', 'supervisor', 'loan_officer'].includes(profile.role || '')) {
    return NextResponse.json(
      { error: 'You do not have permission to edit client details' },
      { status: 403 }
    )
  }

  const rl = rateLimit(`update:${user.id}`, { maxRequests: 30, windowMs: 60000 })
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    )
  }

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'Client id is required' }, { status: 400 })
  }

  const allowedFields = [
    'full_name', 'phone_number', 'national_id', 'spouse_or_father_name',
    'age', 'date_of_birth', 'marital_status', 'residential_address',
    'permanent_address', 'business_address', 'business_type', 'market_location',
    'religion', 'place_of_worship', 'monthly_income',
    'religious_leader_name', 'religious_leader_phone', 'branch', 'area',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    'guarantor_name', 'guarantor_gender', 'guarantor_phone', 'guarantor_occupation',
    'guarantor_employer', 'guarantor_residential_address', 'guarantor_business',
    'notes', 'status',
  ]

  const sanitized = sanitizeObject(updates)
  const filteredUpdates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (field in sanitized) {
      filteredUpdates[field] = sanitized[field] === '' ? null : sanitized[field]
    }
  }

  if ('branch' in filteredUpdates) {
    const branch = String(filteredUpdates.branch || '').trim()
    if (!branch) {
      return NextResponse.json({ error: 'Branch is required' }, { status: 400 })
    }
    filteredUpdates.branch = branch
  }

  if ('monthly_income' in filteredUpdates) {
    const income = Number(filteredUpdates.monthly_income)
    if (!Number.isFinite(income) || income <= 0) {
      return NextResponse.json({ error: 'Monthly income must be greater than 0' }, { status: 400 })
    }
    filteredUpdates.monthly_income = income
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clients')
    .update(filteredUpdates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { headers: getRateLimitHeaders(rl) })
}
