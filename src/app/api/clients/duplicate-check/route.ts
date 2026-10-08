import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput, isValidGhanaPhone } from '@/lib/sanitize'

function normalizePhone(phone: string) {
  const trimmed = phone.trim()
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = rateLimit(`dup-check:${user.id}`, { maxRequests: 20, windowMs: 60000 })
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: getRateLimitHeaders(rl) }
    )
  }

  const { phone, nationalId, excludeId } = await request.json()

  const cleanPhone = phone ? normalizePhone(sanitizeInput(phone)) : null
  const cleanId = nationalId ? sanitizeInput(nationalId).trim().toUpperCase() : null

  const duplicates: { field: string; value: string; client: any }[] = []
  const admin = createAdminClient()

  if (cleanPhone && isValidGhanaPhone(cleanPhone)) {
    const { data } = await admin
      .from('clients')
      .select('id, full_name, account_number, phone_number, status, archived_at')
      .eq('phone_number', cleanPhone)
      .limit(5)

    if (data && data.length > 0) {
      data
        .filter((client) => client.id !== excludeId)
        .forEach((client) => duplicates.push({ field: 'phone_number', value: cleanPhone, client }))
    }
  }

  if (cleanId) {
    const { data } = await admin
      .from('clients')
      .select('id, full_name, account_number, national_id, status, archived_at')
      .eq('national_id', cleanId)
      .limit(5)

    if (data && data.length > 0) {
      data
        .filter((client) => client.id !== excludeId)
        .forEach((client) => duplicates.push({ field: 'national_id', value: cleanId, client }))
    }
  }

  return NextResponse.json({
    hasDuplicates: duplicates.length > 0,
    duplicates,
  }, { headers: getRateLimitHeaders(rl) })
}
