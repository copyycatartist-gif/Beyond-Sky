import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { sendTemplatedSms } from '@/lib/sms/send'
import { formatDate } from '@/lib/utils'

interface RepaymentItem {
  loanId: string
  amount: number
  method?: 'cash' | 'momo'
  momoReference?: string
}

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
    if (role !== 'supervisor' && role !== 'manager' && role !== 'accountant_admin' && role !== 'loan_officer') {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient privileges to record batch repayments' },
        { status: 403 }
      )
    }

    const payload = await request.json()
    const {
      repayments,
      transactionDate,
      defaultMethod = 'cash',
      groupId,
      groupName,
      weekNumber,
    } = payload as {
      repayments: RepaymentItem[]
      transactionDate?: string
      defaultMethod?: 'cash' | 'momo'
      groupId?: string
      groupName?: string
      weekNumber?: number
    }

    if (!Array.isArray(repayments) || repayments.length === 0) {
      return NextResponse.json({ error: 'No repayment records provided' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const txDate = transactionDate || new Date().toISOString().split('T')[0]

    let totalAmount = 0
    let successCount = 0
    let failedCount = 0
    const processed: any[] = []
    const errors: any[] = []

    for (let i = 0; i < repayments.length; i++) {
      const item = repayments[i]
      const amt = Number(item.amount)

      if (!item.loanId || isNaN(amt) || amt <= 0) {
        continue // skip zero or unselected
      }

      try {
        const payMethod = item.method || defaultMethod || 'cash'

        // 1. Fetch loan & client
        const { data: loan, error: loanErr } = await adminClient
          .from('loans')
          .select(`
            *,
            clients (id, full_name, phone_number, account_number)
          `)
          .eq('id', item.loanId)
          .single()

        if (loanErr || !loan) {
          throw new Error(`Loan ID ${item.loanId} not found`)
        }

        if (loan.status !== 'active' && loan.status !== 'defaulted') {
          throw new Error(`Loan ${loan.loan_number} is in '${loan.status}' status (cannot receive repayments)`)
        }

        // 2. Insert transaction (triggers FIFO repayment schedule allocation)
        const { data: tx, error: txErr } = await adminClient
          .from('transactions')
          .insert({
            loan_id: loan.id,
            client_id: loan.client_id,
            type: 'repayment',
            amount: amt,
            direction: 'credit',
            method: payMethod,
            momo_reference: payMethod === 'momo' ? (item.momoReference || 'GROUP-MOMO-BATCH').trim() : null,
            recorded_by: user.id,
            transaction_date: txDate,
          })
          .select()
          .single()

        if (txErr) throw txErr

        // 3. Compute remaining balance for SMS
        const { data: summary } = await adminClient
          .from('client_ledger_summary')
          .select('outstanding_balance')
          .eq('loan_id', loan.id)
          .single()

        const remainingBal = Math.max(0, Number(summary?.outstanding_balance) || 0)
        const loanFullyPaid = remainingBal <= 0.009

        // 4. Send Confirmation SMS (+ payoff SMS when cleared)
        if (loan.clients?.phone_number) {
          ;(async () => {
            await sendTemplatedSms(
              loan.clients.phone_number,
              'confirmation',
              [loan.clients.full_name, amt, remainingBal, loan.loan_number, formatDate(txDate)],
              { clientId: loan.client_id, loanId: loan.id }
            )
            if (loanFullyPaid) {
              await sendTemplatedSms(
                loan.clients.phone_number,
                'loan_closed',
                [loan.clients.full_name, loan.loan_number, amt],
                { clientId: loan.client_id, loanId: loan.id }
              )
            }
          })().catch((smsErr) => console.error('[Batch Repayment SMS Failed]', smsErr))
        }

        totalAmount += amt
        successCount++
        processed.push({
          loanId: loan.id,
          loanNumber: loan.loan_number,
          clientName: loan.clients?.full_name,
          accountNumber: loan.clients?.account_number,
          amountPaid: amt,
          newBalance: remainingBal,
        })
      } catch (err: any) {
        failedCount++
        errors.push({
          loanId: item.loanId,
          error: err.message || 'Failed to record repayment',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Batch collection recorded successfully: GHS ${totalAmount.toFixed(2)} collected across ${successCount} member(s).`,
      summary: {
        totalAmount,
        successCount,
        failedCount,
        transactionDate: txDate,
        groupName,
        weekNumber,
      },
      processed,
      errors,
    })
  } catch (err: any) {
    console.error('Batch repayment error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
