import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'

/**
 * POST /api/loans/[id]/status
 *
 * Manager-only loan status transitions guarded by the migration-026 state
 * machine. Only legal transitions are accepted here (active -> closed and
 * active -> defaulted); the DB trigger enforces the same rule as a backstop
 * and the generic audit trigger records the row diff. The mandatory reason
 * is written as an extra audit_log entry so it is preserved immutably.
 *
 * Body: { status: 'closed' | 'defaulted', reason: string }
 */

const MANAGER_ROLES = ['manager', 'supervisor', 'accountant_admin']
const ALLOWED_TARGETS = ['closed', 'defaulted'] as const

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !MANAGER_ROLES.includes((profile as any).role)) {
      return NextResponse.json(
        { error: 'Forbidden: only managers can change loan status' },
        { status: 403 }
      )
    }

    const limit = rateLimit(`loan-status:${user.id}:${params.id}`, {
      maxRequests: 5,
      windowMs: 60 * 1000,
    })
    const rateHeaders = getRateLimitHeaders(limit)
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many status change attempts. Please wait a minute.' },
        { status: 429, headers: rateHeaders }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: rateHeaders }
      )
    }

    const targetStatus = typeof body?.status === 'string' ? body.status.trim() : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!ALLOWED_TARGETS.includes(targetStatus as any)) {
      return NextResponse.json(
        { error: `Invalid target status. Allowed: ${ALLOWED_TARGETS.join(', ')}` },
        { status: 400, headers: rateHeaders }
      )
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'A reason is mandatory for this status change' },
        { status: 400, headers: rateHeaders }
      )
    }

    const adminClient = createAdminClient()

    const { data: loan, error: loanErr } = await adminClient
      .from('loans')
      .select('id, loan_number, status')
      .eq('id', params.id)
      .maybeSingle()

    if (loanErr || !loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404, headers: rateHeaders }
      )
    }

    // Legal transitions for this endpoint: active -> closed | active -> defaulted
    if ((loan as any).status !== 'active') {
      return NextResponse.json(
        {
          error: `Illegal status transition: ${(loan as any).status} -> ${targetStatus}. Only active loans can be closed or marked defaulted here.`,
        },
        { status: 409, headers: rateHeaders }
      )
    }

    if (targetStatus === 'closed') {
      const { data: summary } = await adminClient
        .from('client_ledger_summary')
        .select('outstanding_balance')
        .eq('loan_id', params.id)
        .maybeSingle()
      const outstanding = Number((summary as { outstanding_balance?: number } | null)?.outstanding_balance || 0)
      if (outstanding > 0.009) {
        return NextResponse.json(
          {
            error: `This loan still has GHS ${outstanding.toFixed(2)} outstanding. It can be marked defaulted, and it closes on its own when the balance is paid.`,
          },
          { status: 409, headers: rateHeaders }
        )
      }
    }

    // database.types.ts is stale for some loans columns — cast the builder
    const loansTable: any = adminClient.from('loans')
    const { data: updated, error: updateErr } = await loansTable
      .update({ status: targetStatus })
      .eq('id', params.id)
      .select('id, status')
      .single()

    if (updateErr) {
      // The state-machine trigger raises on illegal transitions
      return NextResponse.json(
        { error: updateErr.message || 'Failed to update loan status' },
        { status: 400, headers: rateHeaders }
      )
    }

    // Persist the mandatory reason as an immutable audit entry (best effort —
    // the generic trigger already logged the row diff).
    try {
      await adminClient.from('audit_log').insert({
        table_name: 'loans',
        record_id: params.id,
        action: 'UPDATE',
        changed_by: user.id,
        old_values: { status: 'active' },
        new_values: { status: targetStatus, status_reason: reason },
      } as any)
    } catch (auditErr) {
      console.error('[Loan Status] audit reason insert failed', auditErr)
    }

    return NextResponse.json(
      {
        success: true,
        message: `Loan marked as ${targetStatus}`,
        loan: updated,
      },
      { headers: rateHeaders }
    )
  } catch (err: any) {
    console.error('[Loan Status Error]', err)
    return NextResponse.json(
      { error: err?.message || 'Server error' },
      { status: 500 }
    )
  }
}
