import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { formatDate } from '@/lib/utils'
import { assignDisbursementGroup } from '@/lib/groups/cohort'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check: manager or accountant_admin
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'manager' && profile.role !== 'accountant_admin')) {
      return NextResponse.json(
        { error: 'Forbidden: Only managers can authorize loan disbursements' },
        { status: 403 }
      )
    }

    // Rate limiting: 20 disbursement attempts per minute per user
    const limit = rateLimit(`loans:disburse:${user.id}`, { maxRequests: 20, windowMs: 60000 })
    const rateHeaders = getRateLimitHeaders(limit)
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many disbursement requests. Please try again shortly.' },
        { status: 429, headers: rateHeaders }
      )
    }

    const { loanId, paymentMethod = 'cash', momoReference } = await request.json()

    if (!loanId) {
      return NextResponse.json(
        { error: 'Loan ID required' },
        { status: 400, headers: rateHeaders }
      )
    }

    if (paymentMethod === 'momo' && (!momoReference || !momoReference.trim())) {
      return NextResponse.json(
        { error: 'MoMo reference is required when disbursing via MoMo' },
        { status: 400, headers: rateHeaders }
      )
    }

    const adminClient = createAdminClient()

    // Fetch loan + client up-front (for early status guard, loan_number and SMS params).
    // The authoritative atomic write is the disburse_loan RPC below.
    const { data: loanData, error: loanErr } = await adminClient
      .from('loans' as any)
      .select(`
        *,
        clients (id, full_name, phone_number)
      `)
      .eq('id', loanId)
      .single()
    const loan = loanData as any

    if (loanErr || !loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404, headers: rateHeaders }
      )
    }

    // Idempotency / double-submit guard (early exit; the RPC + status trigger
    // are the authoritative backstop inside the transaction).
    if (loan.status !== 'approved') {
      return NextResponse.json(
        { error: 'Loan already disbursed or not in approved status' },
        { status: 409, headers: rateHeaders }
      )
    }

    // The client must land in the Monday–Sunday (or calendar month) cohort
    // before money moves. If that fails, the loan stays approved.
    let cohort: { groupId: string; addedMember: boolean }
    try {
      cohort = await assignDisbursementGroup(adminClient as any, {
        clientId: loan.client_id,
        loanId,
        frequency: loan.payment_frequency === 'monthly' ? 'monthly' : 'weekly',
        disbursedOn: new Date().toISOString().slice(0, 10),
        actorId: user.id,
      })
    } catch (cohortErr: any) {
      return NextResponse.json(
        { error: cohortErr?.message || 'Disbursement group could not be created. The loan is still approved.' },
        { status: 400, headers: rateHeaders }
      )
    }

    // SINGLE atomic RPC: validates status, computes net = principal −
    // total_deductions − refinance_balance, activates the loan (fires the
    // repayment-schedule trigger), posts disbursement + fee transactions and
    // nets off / marks the previous loan 'refinanced' — all in ONE transaction.
    const { data: netDisbursed, error: rpcErr } = await adminClient.rpc(
      'disburse_loan' as any,
      {
        p_loan_id: loanId,
        p_payment_method: paymentMethod,
        p_momo_reference: paymentMethod === 'momo' ? momoReference.trim() : null,
        p_actor: user.id,
      } as any
    )

    if (rpcErr) {
      if (cohort.addedMember) {
        await adminClient
          .from('group_members')
          .delete()
          .eq('group_id', cohort.groupId)
          .eq('client_id', loan.client_id)
          .is('date_left', null)
        await adminClient.from('loans').update({ group_id: null } as never).eq('id', loanId)
      }
      // Map transaction-level failures to clear structured errors
      const msg = String(rpcErr.message || '')
      const code = String((rpcErr as any).code || '')

      if (
        code === '22023' ||
        msg.includes('must be approved') ||
        msg.includes('Illegal loan status transition') ||
        code === '23514'
      ) {
        return NextResponse.json(
          { error: 'Loan already disbursed or not in approved status' },
          { status: 409, headers: rateHeaders }
        )
      }
      if (code === 'P0002' || msg.includes('not found')) {
        return NextResponse.json(
          { error: 'Loan not found' },
          { status: 404, headers: rateHeaders }
        )
      }
      console.error('[Loan Disbursement RPC Error]', rpcErr)
      return NextResponse.json(
        { error: msg || 'Disbursement failed' },
        { status: 500, headers: rateHeaders }
      )
    }

    const netToClient = Number(netDisbursed ?? 0)

    // SMS notification — best-effort; a provider failure must NEVER fail the
    // (already committed) disbursement.
    try {
      if (loan.clients?.phone_number) {
        const { data: firstInstallment } = await adminClient
          .from('repayment_schedule')
          .select('due_date')
          .eq('loan_id', loanId)
          .order('installment_number', { ascending: true })
          .limit(1)
          .maybeSingle()

        const firstDueDate =
          firstInstallment?.due_date ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        await sendTemplatedSms(
          loan.clients.phone_number,
          'disbursement',
          [loan.clients.full_name, netToClient, loan.loan_number, formatDate(firstDueDate)],
          { clientId: loan.client_id, loanId: loan.id }
        )
      }
    } catch (smsErr) {
      console.error('[Loan Disbursement SMS Error]', smsErr)
    }

    return NextResponse.json(
      {
        success: true,
        netDisbursed: netToClient,
        message: `Loan ${loan.loan_number} successfully disbursed. GHS ${netToClient.toFixed(2)} sent to client.`,
      },
      { headers: rateHeaders }
    )
  } catch (err: any) {
    console.error('[Loan Disbursement Error]', err)
    return NextResponse.json({ error: err.message || 'Disbursement failed' }, { status: 500 })
  }
}
