import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'accountant_admin' && profile?.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden: Admin or Manager only' }, { status: 403 })
    }

    const body = await request.json()
    const { migrationType = 'legacy_composite', rows } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows provided' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Dispatch by migrationType
    switch (migrationType) {
      case 'group_13week_ledger':
        return await handleGroup13WeekLedgerMigration(rows, user.id, adminClient)
      case 'clients':
        return await handleClientsMigration(rows, user.id, adminClient)
      case 'transactions':
        return await handleTransactionsMigration(rows, user.id, adminClient)
      case 'loans':
        return await handleLoansMigration(rows, user.id, adminClient)
      case 'groups':
        return await handleGroupsMigration(rows, user.id, adminClient)
      case 'legacy_composite':
      default:
        return await handleLegacyCompositeMigration(rows, user.id, adminClient)
    }
  } catch (err: any) {
    console.error('[Migration API Error]', err)
    return NextResponse.json({ error: err.message || 'Migration processing failed' }, { status: 500 })
  }
}

/**
 * 1. Client KYC Onboarding Migration
 * Bulk adds clients with full physical application form data
 */
async function handleClientsMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as Array<{ row: number; name: string; accountNumber: string }>,
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const name = String(row.fullName || row.full_name || '').trim()

    try {
      if (!name) throw new Error('Missing client full name')
      const phone = String(row.phoneNumber || row.phone_number || '').trim()
      if (!phone) throw new Error('Missing client phone number')
      const nationalId = String(row.nationalId || row.national_id || '').trim()
      if (!nationalId) throw new Error('Missing client Ghana Card / National ID')
      const area = String(row.area || '').trim()
      const spouse = String(row.spouseOrFatherName || row.spouse_or_father_name || '').trim()
      if (!spouse) throw new Error('Missing husband / wife / father name')
      const presentAddress = String(row.presentAddress || row.residentialAddress || row.residential_address || '').trim()
      if (!presentAddress) throw new Error('Missing present address')
      const permanentAddress = String(row.permanentAddress || row.permanent_address || '').trim()
      if (!permanentAddress) throw new Error('Missing permanent address')
      const businessType = String(row.businessType || row.business_type || '').trim()
      if (!businessType) throw new Error('Missing business type')
      const marketLocation = String(row.marketLocation || row.market_location || '').trim()
      if (!marketLocation) throw new Error('Missing market location')
      const religion = String(row.religion || '').trim()
      if (!religion) throw new Error('Missing religion')
      const placeOfWorship = String(row.placeOfWorship || row.place_of_worship || '').trim()
      if (!placeOfWorship) throw new Error('Missing place of worship')
      const leaderName = String(row.pastorOrImamName || row.religiousLeaderName || row.religious_leader_name || '').trim()
      if (!leaderName) throw new Error('Missing pastor / imam name')
      const leaderPhone = String(row.pastorOrImamPhone || row.religiousLeaderPhone || row.religious_leader_phone || '').trim()
      if (!leaderPhone) throw new Error('Missing pastor / imam phone')
      const guarantorName = String(row.guarantorName || row.guarantor_name || '').trim()
      if (!guarantorName) throw new Error('Missing guarantor name')
      const guarantorPhone = String(row.guarantorPhone || row.guarantor_phone || '').trim()
      if (!guarantorPhone) throw new Error('Missing guarantor phone')
      const guarantorOccupation = String(row.guarantorOccupation || row.guarantor_occupation || row.guarantorBusiness || row.guarantor_business || '').trim()
      if (!guarantorOccupation) throw new Error('Missing guarantor occupation')
      const guarantorAddress = String(row.guarantorResidentialAddress || row.guarantor_residential_address || '').trim()
      if (!guarantorAddress) throw new Error('Missing guarantor address')

      const age = parseInt(row.age || '0', 10)
      const rawMarital = String(row.maritalStatus || row.marital_status || '').toLowerCase().trim()
      if (!['married', 'unmarried', 'abandoned', 'divorced', 'widow'].includes(rawMarital)) {
        throw new Error('Marital status must be married, unmarried, abandoned, divorced, or widow')
      }
      const rawGender = String(row.guarantorGender || row.guarantor_gender || '').toLowerCase().trim()
      if (rawGender !== 'male' && rawGender !== 'female') {
        throw new Error('Guarantor gender must be male or female')
      }

      const { data: newClient, error: clientErr } = await adminClient
        .from('clients')
        .insert({
          branch: null,
          area: area || null,
          full_name: name,
          phone_number: phone,
          national_id: nationalId,
          spouse_or_father_name: spouse,
          age: age > 0 ? age : null,
          date_of_birth: row.dateOfBirth || row.dob || null,
          marital_status: rawMarital,
          residential_address: presentAddress,
          permanent_address: permanentAddress,
          business_address: String(row.businessAddress || row.business_address || '').trim() || null,
          business_type: businessType,
          market_location: marketLocation,
          daily_business_income: null,
          monthly_income: null,
          religion,
          place_of_worship: placeOfWorship,
          religious_leader_name: leaderName,
          religious_leader_phone: leaderPhone,

          guarantor_name: guarantorName,
          guarantor_gender: rawGender,
          guarantor_account_number: null,
          guarantor_phone: guarantorPhone,
          guarantor_national_id: null,
          guarantor_relationship: null,
          guarantor_business: guarantorOccupation,
          guarantor_occupation: guarantorOccupation,
          guarantor_employer: String(row.guarantorEmployer || row.guarantor_employer || '').trim() || null,
          guarantor_dob: null,
          guarantor_residential_address: guarantorAddress,
          guarantor_religion: null,
          guarantor_place_of_worship: null,

          status: 'active',
          created_by: userId,
          date_registered: row.dateRegistered || new Date().toISOString().split('T')[0],
        })
        .select('id, full_name, account_number')
        .single()

      if (clientErr) throw clientErr

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        name: newClient.full_name,
        accountNumber: newClient.account_number,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: name || `Row ${rowNum}`,
        error: err.message || 'Failed to onboard client',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'clients',
    message: `Client Onboarding completed: ${results.successCount} clients registered successfully, ${results.failedCount} failed.`,
    results,
  })
}

/**
 * 2. Transactions & Repayments Batch Migration
 * Bulk records collections or disbursements to append-only ledger
 */
async function handleTransactionsMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as Array<{ row: number; identifier: string; amount: number }>,
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const identifier = String(
      row.clientAccountNumber || row.accountNumber || row.account_number ||
      row.loanNumber || row.loan_number ||
      row.phoneNumber || row.phone_number || ''
    ).trim()

    try {
      if (!identifier) throw new Error('Missing client account number, loan number, or phone number')

      const rawAmount = parseFloat(row.amount)
      if (isNaN(rawAmount) || rawAmount <= 0) throw new Error(`Invalid transaction amount: ${row.amount}`)

      const txType = String(row.type || 'repayment').toLowerCase().trim()
      if (!['repayment', 'disbursement', 'fee'].includes(txType)) {
        throw new Error(`Invalid transaction type: '${txType}'. Must be repayment, disbursement, or fee.`)
      }

      const method = String(row.method || 'cash').toLowerCase().trim() === 'momo' ? 'momo' : 'cash'
      const momoRef = String(row.momoReference || row.momo_reference || '').trim() || null

      if (method === 'momo' && !momoRef) {
        throw new Error('momoReference is required when payment method is momo')
      }

      const txDate = row.transactionDate || row.date || new Date().toISOString().split('T')[0]

      // Resolve loan and client
      let loanId: string | null = null
      let clientId: string | null = null

      if (row.loanNumber || row.loan_number) {
        const { data: loan } = await adminClient
          .from('loans')
          .select('id, client_id, status')
          .eq('loan_number', String(row.loanNumber || row.loan_number).trim())
          .maybeSingle()
        if (loan) {
          loanId = loan.id
          clientId = loan.client_id
        }
      }

      if (!loanId) {
        // Resolve client first
        let clientQuery = adminClient.from('clients').select('id, full_name')
        if (identifier.includes('-') && identifier.startsWith('BSM')) {
          clientQuery = clientQuery.eq('account_number', identifier)
        } else {
          clientQuery = clientQuery.eq('phone_number', identifier)
        }
        const { data: client } = await clientQuery.maybeSingle()
        if (!client) throw new Error(`Client '${identifier}' not found in directory`)
        clientId = client.id

        // Find active or defaulted loan for this client
        const { data: activeLoan } = await adminClient
          .from('loans')
          .select('id, loan_number, status')
          .eq('client_id', clientId)
          .in('status', ['active', 'defaulted'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!activeLoan) {
          throw new Error(`No active or defaulted credit facility found for client ${identifier}`)
        }
        loanId = activeLoan.id
      }

      // Determine direction
      const direction = txType === 'disbursement' ? 'debit' : 'credit'

      // Post transaction
      const { error: txErr } = await adminClient.from('transactions').insert({
        loan_id: loanId,
        client_id: clientId,
        type: txType,
        amount: rawAmount,
        direction,
        method,
        momo_reference: momoRef,
        recorded_by: userId,
        transaction_date: txDate,
      })

      if (txErr) throw txErr

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        identifier: `${identifier} (${txType})`,
        amount: rawAmount,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: identifier || `Row ${rowNum}`,
        error: err.message || 'Transaction recording failed',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'transactions',
    message: `Batch Transactions completed: ${results.successCount} entries applied to ledger, ${results.failedCount} failed.`,
    results,
  })
}

/**
 * 3. Active Loans Facilities Migration
 * Bulk imports pre-existing running loans from legacy registers
 */
async function handleLoansMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as Array<{ row: number; identifier: string; loanNumber: string }>,
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  // Fetch loan calculation rules
  const { data: settingsRows } = await adminClient.from('settings').select('key, value')
  const settingsMap: Record<string, string> = {}
  ;(settingsRows || []).forEach((r: any) => { settingsMap[r.key] = r.value })

  const defaultMultiplier = parseFloat(settingsMap['interest_multiplier'] || '1.365')
  const defaultFeePct = parseFloat(settingsMap['fee_percentage'] || '0.01')
  const defaultSecPct = parseFloat(settingsMap['security_deposit_percentage'] || '0.10')
  const defaultRiskPct = parseFloat(settingsMap['loan_risk_fund_percentage'] || '0.01')
  const defaultTerm = parseInt(settingsMap['term_weeks'] || '13', 10)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const identifier = String(
      row.clientAccountNumber || row.accountNumber || row.account_number ||
      row.phoneNumber || row.phone_number ||
      row.nationalId || row.national_id || ''
    ).trim()

    try {
      if (!identifier) throw new Error('Missing client account number, phone, or national ID')

      const principal = parseFloat(row.principal)
      if (isNaN(principal) || principal <= 0) throw new Error(`Invalid loan principal: ${row.principal}`)

      // Resolve client
      let clientQuery = adminClient.from('clients').select('id, full_name, account_number')
      if (identifier.includes('-') && identifier.startsWith('BSM')) {
        clientQuery = clientQuery.eq('account_number', identifier)
      } else if (identifier.startsWith('GHA-')) {
        clientQuery = clientQuery.eq('national_id', identifier)
      } else {
        clientQuery = clientQuery.eq('phone_number', identifier)
      }

      const { data: client } = await clientQuery.maybeSingle()
      if (!client) throw new Error(`Client '${identifier}' not found. Please onboard client first.`)

      const termWeeks = parseInt(row.termWeeks || row.term_weeks || String(defaultTerm), 10)
      const cycleNumber = parseInt(row.cycleNumber || row.cycle_number || '1', 10)
      const disbDate = row.disbursementDate || row.disbursement_date || new Date().toISOString().split('T')[0]

      const secAmount = Math.round(principal * defaultSecPct * 100) / 100
      const feeAmount = Math.round(principal * defaultFeePct * 100) / 100
      const riskAmount = Math.round(principal * defaultRiskPct * 100) / 100
      const totalDeductions = secAmount + feeAmount + riskAmount
      const netDisbursed = principal - totalDeductions
      const totalRepayable = Math.round(principal * defaultMultiplier * 100) / 100
      const weeklyInstallment = Math.round((totalRepayable / termWeeks) * 100) / 100

      // Insert Active Loan
      const { data: newLoan, error: loanErr } = await adminClient
        .from('loans')
        .insert({
          client_id: client.id,
          principal,
          cycle_number: cycleNumber,
          term_weeks: termWeeks,
          interest_multiplier: defaultMultiplier,
          security_deposit_pct: defaultSecPct,
          security_deposit_amount: secAmount,
          processing_fee_pct: defaultFeePct,
          processing_fee_amount: feeAmount,
          loan_risk_fund_pct: defaultRiskPct,
          loan_risk_fund_amount: riskAmount,
          total_deductions: totalDeductions,
          fee_amount: feeAmount,
          net_disbursement_amount: netDisbursed,
          amount_disbursed_to_client: netDisbursed,
          total_repayable: totalRepayable,
          weekly_installment: weeklyInstallment,
          status: 'active',
          submitted_by: userId,
          approved_by: userId,
          approval_date: disbDate,
          disbursement_date: disbDate,
        })
        .select('id, loan_number')
        .single()

      if (loanErr) throw loanErr

      // Post Initial Ledger Transactions (Disbursement debit + Fee credit)
      await adminClient.from('transactions').insert([
        {
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'disbursement',
          amount: netDisbursed,
          direction: 'debit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        },
        {
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'fee',
          amount: feeAmount,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        },
      ])

      // If prior repayments are specified in CSV, apply them
      const totalPaidSoFar = parseFloat(row.totalPaidSoFar || row.totalPaid || row.total_paid || '0')
      if (!isNaN(totalPaidSoFar) && totalPaidSoFar > 0) {
        await adminClient.from('transactions').insert({
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'repayment',
          amount: totalPaidSoFar,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        })
      }

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        identifier: client.full_name,
        loanNumber: newLoan.loan_number,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: identifier || `Row ${rowNum}`,
        error: err.message || 'Failed to import loan facility',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'loans',
    message: `Loan Facilities Migration completed: ${results.successCount} active loans imported, ${results.failedCount} failed.`,
    results,
  })
}

/**
 * 4. Solidarity Groups Migration
 * Bulk creates lending groups and links client members
 */
async function handleGroupsMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as Array<{ row: number; groupName: string; groupNumber: string; memberCount: number }>,
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const groupName = String(row.groupName || row.name || '').trim()

    try {
      if (!groupName) throw new Error('Missing group name')

      const branch = String(row.branch || 'Makola Branch').trim()
      const area = String(row.area || 'Central Area').trim()
      const meetingDay = String(row.meetingDay || row.meeting_day || 'Monday').trim()
      const meetingPlace = String(row.meetingPlace || row.meeting_place || 'Makola Market Shed').trim()
      const maxMembers = parseInt(row.maxMembers || row.max_members || '15', 10)

      // Create Group
      const { data: newGroup, error: groupErr } = await adminClient
        .from('groups')
        .insert({
          name: groupName,
          branch,
          area,
          meeting_day: meetingDay,
          meeting_place: meetingPlace,
          max_members: Math.min(15, Math.max(1, maxMembers)),
          status: 'active',
          created_by: userId,
        })
        .select('id, name, group_number')
        .single()

      if (groupErr) throw groupErr

      // Parse member account numbers
      const rawMembers = String(row.memberAccountNumbers || row.members || '').trim()
      let addedMemberCount = 0

      if (rawMembers) {
        const accountNumbers = rawMembers
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)

        for (const accNum of accountNumbers.slice(0, 15)) {
          const { data: client } = await adminClient
            .from('clients')
            .select('id')
            .eq('account_number', accNum)
            .maybeSingle()

          if (client) {
            const { error: memberErr } = await adminClient
              .from('group_members')
              .insert({
                group_id: newGroup.id,
                client_id: client.id,
                date_joined: new Date().toISOString().split('T')[0],
              })
            if (!memberErr) addedMemberCount++
          }
        }
      }

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        groupName: newGroup.name,
        groupNumber: newGroup.group_number,
        memberCount: addedMemberCount,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: groupName || `Row ${rowNum}`,
        error: err.message || 'Failed to create group',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'groups',
    message: `Solidarity Groups Migration completed: ${results.successCount} groups formed, ${results.failedCount} failed.`,
    results,
  })
}

/**
 * 5. Legacy Composite Migration (Backwards Compatibility)
 * Handles legacy CSV containing client + loan + transaction in one row
 */
async function handleLegacyCompositeMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as any[],
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  const { data: settingsRows } = await adminClient.from('settings').select('key, value')
  const settingsMap: Record<string, string> = {}
  ;(settingsRows || []).forEach((r: any) => { settingsMap[r.key] = r.value })

  const multiplier = parseFloat(settingsMap['interest_multiplier'] || '1.365')
  const feePct = parseFloat(settingsMap['fee_percentage'] || '0.05')
  const term = parseInt(settingsMap['term_weeks'] || '13', 10)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const name = row.fullName || 'Unknown'

    try {
      if (!row.fullName || !row.phoneNumber || !row.nationalId || !row.principal) {
        throw new Error('Missing required fields: fullName, phoneNumber, nationalId, or principal')
      }

      const principal = parseFloat(row.principal)
      if (isNaN(principal) || principal <= 0) {
        throw new Error(`Invalid Principal: ${row.principal}`)
      }

      // Create Client
      const { data: client, error: clientErr } = await adminClient
        .from('clients')
        .insert({
          full_name: String(row.fullName).trim(),
          phone_number: String(row.phoneNumber).trim(),
          national_id: String(row.nationalId).trim(),
          business_type: String(row.businessType || 'General Trader').trim(),
          market_location: String(row.marketLocation || 'Makola Market').trim(),
          daily_business_income: null,
          guarantor_name: String(row.guarantorName || 'Family Guarantor').trim(),
          guarantor_phone: String(row.guarantorPhone || row.phoneNumber).trim(),
          guarantor_national_id: null,
          guarantor_relationship: null,
          guarantor_business: String(row.guarantorBusiness || 'Trader').trim(),
          created_by: userId,
          status: 'active',
          date_registered: row.disbursementDate || new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (clientErr) throw clientErr

      // Create Active Loan
      const disbDate = row.disbursementDate || new Date().toISOString().split('T')[0]
      const fee = Math.round(principal * feePct * 100) / 100
      const totalRepayable = Math.round(principal * multiplier * 100) / 100
      const weekly = Math.round((totalRepayable / term) * 100) / 100
      const netDisbursed = principal - fee

      const { data: loan, error: loanErr } = await adminClient
        .from('loans')
        .insert({
          client_id: client.id,
          principal,
          fee_amount: fee,
          interest_multiplier: multiplier,
          total_repayable: totalRepayable,
          weekly_installment: weekly,
          term_weeks: term,
          amount_disbursed_to_client: netDisbursed,
          status: 'active',
          submitted_by: userId,
          approved_by: userId,
          approval_date: disbDate,
          disbursement_date: disbDate,
        })
        .select()
        .single()

      if (loanErr) throw loanErr

      // Post Transactions
      await adminClient.from('transactions').insert([
        {
          loan_id: loan.id,
          client_id: client.id,
          type: 'disbursement',
          amount: netDisbursed,
          direction: 'debit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        },
        {
          loan_id: loan.id,
          client_id: client.id,
          type: 'fee',
          amount: fee,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        },
      ])

      const totalPaidSoFar = parseFloat(row.totalPaid || '0')
      if (!isNaN(totalPaidSoFar) && totalPaidSoFar > 0) {
        await adminClient.from('transactions').insert({
          loan_id: loan.id,
          client_id: client.id,
          type: 'repayment',
          amount: totalPaidSoFar,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: disbDate,
        })
      }

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        identifier: name,
        loanNumber: loan.loan_number,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: name || `Row ${rowNum}`,
        error: err.message || 'Validation/DB error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'legacy_composite',
    message: `Composite Import completed: ${results.successCount} imported successfully, ${results.failedCount} failed.`,
    results,
  })
}

/**
 * 5. 13-Week Group Repayment Ledger Migration
 * Direct migration of the client's official 13-Week Field Collection Matrix
 */
async function handleGroup13WeekLedgerMigration(rows: any[], userId: string, adminClient: any) {
  const results = {
    total: rows.length,
    successCount: 0,
    failedCount: 0,
    importedItems: [] as Array<{ row: number; groupName: string; clientName: string; loanNumber: string; principal: number }>,
    errors: [] as Array<{ row: number; identifier: string; error: string }>,
  }

  // Fetch settings for lending math
  const { data: settings } = await adminClient.from('settings').select('key, value')
  const settingsMap: Record<string, string> = {}
  ;(settings || []).forEach((s: any) => {
    settingsMap[s.key] = s.value
  })

  const multiplier = parseFloat(settingsMap['interest_multiplier'] || '1.365')
  const feePct = parseFloat(settingsMap['fee_percentage'] || '0.01')
  const secPct = parseFloat(settingsMap['security_deposit_percentage'] || '0.10')
  const riskPct = parseFloat(settingsMap['loan_risk_fund_percentage'] || '0.01')
  const termWeeks = 13

  // Cache groups created during this batch
  const groupCache: Record<string, string> = {}

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const groupName = String(row.groupName || row.group_name || 'GROUP 1').trim()
    const fullName = String(row.fullName || row.clientName || row.name || '').trim()

    try {
      if (!fullName) throw new Error('Missing client full name')

      let principal = parseFloat(String(row.principal || '').replace(/,/g, ''))
      const loanAmount = parseFloat(String(row.loanAmount || row.loan || '').replace(/,/g, ''))

      if (isNaN(principal) || principal <= 0) {
        if (!isNaN(loanAmount) && loanAmount > 0) {
          principal = Math.round((loanAmount / multiplier) * 100) / 100
        } else {
          throw new Error('Missing or invalid principal / loan amount')
        }
      }

      // 1. Resolve or Create Group
      let groupId = groupCache[groupName.toLowerCase()]
      if (!groupId) {
        const { data: existingGroup } = await adminClient
          .from('groups')
          .select('id')
          .ilike('name', groupName)
          .maybeSingle()

        if (existingGroup) {
          groupId = existingGroup.id
        } else {
          const { data: newGrp, error: grpErr } = await adminClient
            .from('groups')
            .insert({
              name: groupName,
              branch: 'Makola Branch',
              area: 'Accra Central',
              meeting_day: 'Weekly',
              meeting_place: 'Market Shed',
              max_members: 15,
              status: 'active',
              created_by: userId,
            })
            .select('id')
            .single()

          if (grpErr) throw grpErr
          groupId = newGrp.id
        }
        groupCache[groupName.toLowerCase()] = groupId
      }

      // 2. Resolve or Create Client
      let phone = String(row.phoneNumber || row.phone || '').trim().replace(/\D/g, '')
      if (!phone) {
        phone = `024${String(1000000 + (rowNum * 137)).slice(0, 7)}`
      } else if (phone.length === 9 && !phone.startsWith('0')) {
        phone = `0${phone}`
      }

      let clientQuery = adminClient.from('clients').select('id, full_name, account_number')
      let { data: client } = await clientQuery.ilike('full_name', fullName).maybeSingle()

      if (!client) {
        const nationalId = `GHA-${String(700000000 + (rowNum * 313)).slice(0, 9)}-${(rowNum % 9) + 1}`

        const { data: newClient, error: clientErr } = await adminClient
          .from('clients')
          .insert({
            full_name: fullName,
            phone_number: phone,
            national_id: nationalId,
            branch: 'Makola Branch',
            area: 'Accra Central',
            business_type: 'Market Trader',
            market_location: 'Makola Market',
            daily_business_income: null,
            monthly_income: null,
            marital_status: 'married',
            religion: 'Christianity',
            guarantor_name: 'Family Guarantor',
            guarantor_gender: 'male',
            guarantor_phone: phone,
            guarantor_national_id: null,
            guarantor_relationship: null,
            guarantor_business: 'Trader / Business',
            guarantor_occupation: 'Trader',
            guarantor_employer: 'Self-employed',
            status: 'active',
            created_by: userId,
          })
          .select('id, full_name, account_number')
          .single()

        if (clientErr) throw clientErr
        client = newClient
      }

      // 3. Link Client to Group
      const { data: existingMember } = await adminClient
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('client_id', client.id)
        .is('date_left', null)
        .maybeSingle()

      if (!existingMember) {
        await adminClient.from('group_members').insert({
          group_id: groupId,
          client_id: client.id,
          date_joined: new Date().toISOString().split('T')[0],
        })
      }

      // 4. Create 13-Week Active Loan
      const secAmount = Math.round(principal * secPct * 100) / 100
      const feeAmount = Math.round(principal * feePct * 100) / 100
      const riskAmount = Math.round(principal * riskPct * 100) / 100
      const totalDeductions = secAmount + feeAmount + riskAmount
      const netDisbursed = principal - totalDeductions
      const totalRepayable = Math.round(principal * multiplier * 100) / 100
      const weeklyInstallment = Math.round((totalRepayable / termWeeks) * 100) / 100
      const today = new Date().toISOString().split('T')[0]

      const { data: newLoan, error: loanErr } = await adminClient
        .from('loans')
        .insert({
          client_id: client.id,
          principal,
          cycle_number: 1,
          term_weeks: termWeeks,
          interest_multiplier: multiplier,
          security_deposit_pct: secPct,
          security_deposit_amount: secAmount,
          processing_fee_pct: feePct,
          processing_fee_amount: feeAmount,
          loan_risk_fund_pct: riskPct,
          loan_risk_fund_amount: riskAmount,
          total_deductions: totalDeductions,
          fee_amount: feeAmount,
          net_disbursement_amount: netDisbursed,
          amount_disbursed_to_client: netDisbursed,
          total_repayable: totalRepayable,
          weekly_installment: weeklyInstallment,
          status: 'active',
          submitted_by: userId,
          approved_by: userId,
          approval_date: today,
          disbursement_date: today,
        })
        .select('id, loan_number')
        .single()

      if (loanErr) throw loanErr

      // Post Initial Ledger Transactions
      await adminClient.from('transactions').insert([
        {
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'disbursement',
          amount: netDisbursed,
          direction: 'debit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: today,
        },
        {
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'fee',
          amount: feeAmount,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: today,
        },
      ])

      // 5. Apply any prior payments from weekly columns (wk1..wk13) or cumPaid
      let cumulativePaid = parseFloat(String(row.cumPaid || row.cum || row.cumulativePaid || '0').replace(/,/g, ''))
      if (isNaN(cumulativePaid) || cumulativePaid <= 0) {
        // Sum individual weeks
        let weekSum = 0
        for (let w = 1; w <= 13; w++) {
          const wVal = parseFloat(String(row[`wk${w}`] || row[`wk_${w}`] || row[`week${w}`] || '0').replace(/,/g, ''))
          if (!isNaN(wVal) && wVal > 0) weekSum += wVal
        }
        cumulativePaid = weekSum
      }

      if (cumulativePaid > 0) {
        await adminClient.from('transactions').insert({
          loan_id: newLoan.id,
          client_id: client.id,
          type: 'repayment',
          amount: cumulativePaid,
          direction: 'credit',
          method: 'cash',
          recorded_by: userId,
          transaction_date: today,
        })
      }

      results.successCount++
      results.importedItems.push({
        row: rowNum,
        groupName,
        clientName: fullName,
        loanNumber: newLoan.loan_number,
        principal,
      })
    } catch (err: any) {
      results.failedCount++
      results.errors.push({
        row: rowNum,
        identifier: fullName || `Row ${rowNum}`,
        error: err.message || 'Failed to import 13-week group member',
      })
    }
  }

  return NextResponse.json({
    success: true,
    migrationType: 'group_13week_ledger',
    message: `13-Week Group Ledger Migration completed: ${results.successCount} group loans imported, ${results.failedCount} failed.`,
    results,
  })
}

