import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { sanitizeInput } from '@/lib/sanitize'

/**
 * POST /api/loans — server-side loan application creation.
 *
 * Replaces the old direct browser-Supabase insert. The `compute_loan_amounts`
 * DB trigger derives every money field (deductions, net disbursement, weekly
 * installment, cycle number, eligibility flag, …) from `settings`, so this
 * route only writes the contract inputs.
 */

interface CachedResponse {
  status: number
  body: Record<string, unknown>
}

/** Module-level idempotency cache: `${userId}:${idempotencyKey}` -> response */
const idempotencyCache = new Map<string, { result: CachedResponse; ts: number }>()
const IDEMPOTENCY_TTL_MS = 120_000

/** Opportunistically drop stale idempotency entries. */
function cleanupIdempotencyCache() {
  const now = Date.now()
  idempotencyCache.forEach((entry, key) => {
    if (now - entry.ts > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(key)
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Any staff profile may submit applications (loan officers create them).
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Forbidden: no staff profile found for this account' },
        { status: 403 }
      )
    }

    // Rate limit per user
    const rl = rateLimit(`loans:create:${user.id}`, { maxRequests: 10, windowMs: 60_000 })
    const rlHeaders = getRateLimitHeaders(rl)

    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many loan submissions. Please wait a minute and try again.' },
        { status: 429, headers: rlHeaders }
      )
    }

    // Idempotency: replay a cached response for a repeated key within 120s
    cleanupIdempotencyCache()
    const idempotencyKey = sanitizeInput(request.headers.get('Idempotency-Key') || '')
    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : ''
    if (cacheKey) {
      const cached = idempotencyCache.get(cacheKey)
      if (cached && Date.now() - cached.ts <= IDEMPOTENCY_TTL_MS) {
        return NextResponse.json(cached.result.body, {
          status: cached.result.status,
          headers: rlHeaders,
        })
      }
    }

    // Parse + sanitize body
    let raw: Record<string, unknown>
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: rlHeaders })
    }

    const clientId = sanitizeInput(String(raw.clientId ?? ''))
    const principal = Number(raw.principal)
    const termWeeksRaw = raw.termWeeks
    const previousLoanId = sanitizeInput(String(raw.previousLoanId ?? '')) || null
    const agreementTown = sanitizeInput(String(raw.agreementTown ?? '')) || null
    const agreementDistrict = sanitizeInput(String(raw.agreementDistrict ?? '')) || null
    const agreementRegion = sanitizeInput(String(raw.agreementRegion ?? '')) || null
    const overrideReason = sanitizeInput(String(raw.overrideReason ?? '')) || null

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400, headers: rlHeaders })
    }

    if (!Number.isFinite(principal) || principal <= 0) {
      return NextResponse.json(
        { error: 'principal must be a positive number' },
        { status: 400, headers: rlHeaders }
      )
    }

    const adminClient = createAdminClient()

    // Read authoritative loan bounds from settings (fallback 1000 / 5000)
    const { data: settingsRows } = await adminClient
      .from('settings' as any)
      .select('key, value')

    const settingsMap: Record<string, string> = {}
    ;(settingsRows || []).forEach((r: any) => {
      settingsMap[r.key] = r.value
    })
    const minLoan = parseFloat(settingsMap['min_loan_amount'] || '1000') || 1000
    const maxLoan = parseFloat(settingsMap['max_loan_amount'] || '5000') || 5000

    if (principal < minLoan || principal > maxLoan) {
      return NextResponse.json(
        { error: `Loan principal must be between GHS ${minLoan} and GHS ${maxLoan}` },
        { status: 400, headers: rlHeaders }
      )
    }

    // Optional term_weeks must be a sane integer when supplied
    let termWeeks: number | null = null
    if (termWeeksRaw !== undefined && termWeeksRaw !== null && termWeeksRaw !== '') {
      termWeeks = Number(termWeeksRaw)
      if (!Number.isInteger(termWeeks) || termWeeks < 1 || termWeeks > 104) {
        return NextResponse.json(
          { error: 'termWeeks must be an integer between 1 and 104' },
          { status: 400, headers: rlHeaders }
        )
      }
    }

    // Verify client exists and is active
    const { data: client, error: clientErr } = await adminClient
      .from('clients' as any)
      .select('id, full_name, status')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) {
      return NextResponse.json(
        { error: 'Client not found. Select a registered client.' },
        { status: 400, headers: rlHeaders }
      )
    }
    if ((client as any).status !== 'active') {
      return NextResponse.json(
        { error: `Client is not active (status: ${(client as any).status}). Only active clients can borrow.` },
        { status: 400, headers: rlHeaders }
      )
    }

    // Duplicate-active-loan guard (the DB trigger is the backstop).
    const { data: activeLoans } = await adminClient
      .from('loans' as any)
      .select('id, loan_number')
      .eq('client_id', clientId)
      .eq('status', 'active')

    if (activeLoans && activeLoans.length > 0 && !previousLoanId) {
      return NextResponse.json(
        {
          error: `Client already has an active loan (${(activeLoans[0] as any).loan_number}). Submit the new application as a refinance of that loan.`,
        },
        { status: 409, headers: rlHeaders }
      )
    }

    // Insert — the compute_loan_amounts trigger derives all money fields.
    const insertPayload: Record<string, unknown> = {
      client_id: clientId,
      principal,
      status: 'pending',
      submitted_by: user.id,
    }
    if (termWeeks !== null) insertPayload.term_weeks = termWeeks
    if (previousLoanId) insertPayload.previous_loan_id = previousLoanId
    if (agreementTown) insertPayload.agreement_town = agreementTown
    if (agreementDistrict) insertPayload.agreement_district = agreementDistrict
    if (agreementRegion) insertPayload.agreement_region = agreementRegion

    const { data: loan, error: insertErr } = await adminClient
      .from('loans' as any)
      .insert(insertPayload as never)
      .select('id, loan_number')
      .single()

    if (insertErr) {
      const msg = insertErr.message || 'Failed to create loan application'
      // Surface the one-active-loan-per-client trigger cleanly
      if (/active loan/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 409, headers: rlHeaders })
      }
      if (/principal/i.test(msg) && /between|check/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 400, headers: rlHeaders })
      }
      console.error('[POST /api/loans insert error]', insertErr)
      return NextResponse.json({ error: msg }, { status: 500, headers: rlHeaders })
    }

    const row = loan as any
    const responseBody: Record<string, unknown> = {
      success: true,
      loan: { id: row.id, loan_number: row.loan_number },
    }
    const meta: Record<string, unknown> = {}
    if (overrideReason) meta.overrideReason = overrideReason
    if (Object.keys(meta).length > 0) responseBody.meta = meta

    if (cacheKey) {
      idempotencyCache.set(cacheKey, {
        result: { status: 200, body: responseBody },
        ts: Date.now(),
      })
    }

    return NextResponse.json(responseBody, { status: 200, headers: rlHeaders })
  } catch (err: any) {
    console.error('[POST /api/loans error]', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
