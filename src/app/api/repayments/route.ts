import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { formatDate } from '@/lib/utils'

export async function POST(request: Request) {
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

    const role = profile?.role
    if (role !== 'supervisor' && role !== 'manager' && role !== 'accountant_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only supervisors, managers, or admins can record repayments' },
        { status: 403 }
      )
    }

    const { loanId, amount, method, momoReference, transactionDate } = await request.json()

    if (!loanId || !amount || amount <= 0 || !method) {
      return NextResponse.json({ error: 'Invalid repayment payload' }, { status: 400 })
    }

    if (method === 'momo' && (!momoReference || !momoReference.trim())) {
      return NextResponse.json({ error: 'MoMo reference is mandatory for MoMo transactions' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // 1. Fetch loan and client details
    const { data: loan, error: loanErr } = await adminClient
      .from('loans')
      .select(`
        *,
        clients (id, full_name, phone_number, account_number)
      `)
      .eq('id', loanId)
      .single()

    if (loanErr || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    if (loan.status !== 'active' && loan.status !== 'defaulted') {
      return NextResponse.json(
        { error: `Cannot record repayment for loan in '${loan.status}' status` },
        { status: 400 }
      )
    }

    const date = transactionDate || new Date().toISOString().split('T')[0]

    // 2. Insert into append-only transactions table (credit)
    // The Postgres trigger `transactions_apply_repayment` will automatically execute FIFO application
    // to repayment_schedule rows and update loan status to 'closed' if paid in full!
    const { data: tx, error: txErr } = await adminClient
      .from('transactions')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        type: 'repayment',
        amount: parseFloat(amount),
        direction: 'credit',
        method: method,
        momo_reference: method === 'momo' ? momoReference.trim() : null,
        recorded_by: user.id,
        transaction_date: date,
      })
      .select()
      .single()

    if (txErr) throw txErr

    // 3. Compute remaining balance after repayment for SMS notification
    const { data: summary } = await adminClient
      .from('client_ledger_summary')
      .select('outstanding_balance')
      .eq('loan_id', loan.id)
      .single()

    const remainingBal = Math.max(0, summary?.outstanding_balance || 0)

    // 4. Send Confirmation SMS to client
    if (loan.clients?.phone_number) {
      await sendTemplatedSms(
        loan.clients.phone_number,
        'confirmation',
        [loan.clients.full_name, parseFloat(amount), remainingBal, loan.loan_number, formatDate(date)],
        { clientId: loan.client_id, loanId: loan.id }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Repayment of GHS ${parseFloat(amount).toFixed(2)} recorded successfully via ${method.toUpperCase()}. Remaining balance: GHS ${remainingBal.toFixed(2)}.`,
      remainingBalance: remainingBal,
    })
  } catch (err: any) {
    console.error('[Repayment Recording Error]', err)
    return NextResponse.json({ error: err.message || 'Failed to record repayment' }, { status: 500 })
  }
}
