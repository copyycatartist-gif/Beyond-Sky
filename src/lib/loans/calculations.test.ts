import {
  computeDeductions,
  computeLoanTerms,
  computeNetDisbursement,
  computeEligibility,
  buildAmortizationSchedule,
  calculateLoan,
  TOTAL_DEDUCTION_PCT,
} from './calculations'

describe('computeDeductions', () => {
  test('applies the 12% schedule to a 2000 principal', () => {
    const d = computeDeductions(2000)
    expect(d.securityDepositAmount).toBe(200) // 10%
    expect(d.processingFeeAmount).toBe(20) // 1%
    expect(d.loanRiskFundAmount).toBe(20) // 1%
    expect(d.totalDeductions).toBe(240) // 12%
    expect(TOTAL_DEDUCTION_PCT).toBeCloseTo(0.12, 5)
  })

  test('handles zero and non-numeric principal', () => {
    expect(computeDeductions(0).totalDeductions).toBe(0)
    expect(computeDeductions(NaN).totalDeductions).toBe(0)
  })

  test('honours percentage overrides', () => {
    const d = computeDeductions(1000, { processingFee: 0.02 })
    expect(d.processingFeeAmount).toBe(20)
    expect(d.totalDeductions).toBe(130)
  })
})

describe('computeLoanTerms', () => {
  test('total repayable and weekly installment', () => {
    const t = computeLoanTerms({ principal: 2000, interestMultiplier: 1.365, termWeeks: 13 })
    expect(t.totalRepayable).toBe(2730)
    expect(t.weeklyInstallment).toBe(210)
  })

  test('guards against a zero term', () => {
    const t = computeLoanTerms({ principal: 1000, interestMultiplier: 1.365, termWeeks: 0 })
    expect(t.termWeeks).toBe(1)
    expect(t.weeklyInstallment).toBe(1365)
  })
})

describe('computeNetDisbursement', () => {
  test('subtracts deductions and refinance balance', () => {
    expect(
      computeNetDisbursement({ principal: 2000, totalDeductions: 240, refinanceBalance: 300 })
    ).toBe(1460)
  })

  test('never returns a negative figure', () => {
    expect(
      computeNetDisbursement({ principal: 200, totalDeductions: 240, refinanceBalance: 500 })
    ).toBe(0)
  })
})

describe('computeEligibility', () => {
  test('eligible when installment is within threshold', () => {
    // weekly income 700 (100/day), installment 210 => 30% => eligible
    expect(computeEligibility(210, 100, 0.3).flag).toBe('eligible')
  })

  test('caution band between threshold and 1.5x', () => {
    expect(computeEligibility(280, 100, 0.3).flag).toBe('caution')
  })

  test('ineligible with no income', () => {
    expect(computeEligibility(210, 0, 0.3).flag).toBe('ineligible')
  })
})

describe('buildAmortizationSchedule', () => {
  test('produces the right number of weekly rows', () => {
    const rows = buildAmortizationSchedule({
      weeklyInstallment: 210,
      termWeeks: 13,
      startDate: '2026-01-01',
    })
    expect(rows).toHaveLength(13)
    expect(rows[0].dueDate).toBe('2026-01-08')
    expect(rows[1].dueDate).toBe('2026-01-15')
    expect(rows[12].cumulativeExpected).toBe(2730)
  })
})

describe('calculateLoan', () => {
  test('returns a consistent, fully-derived breakdown', () => {
    const c = calculateLoan({
      principal: 2000,
      interestMultiplier: 1.365,
      termWeeks: 13,
      dailyIncome: 100,
      eligibilityRatio: 0.3,
      refinanceBalance: 0,
    })
    expect(c.totalDeductions).toBe(240)
    expect(c.netDisbursement).toBe(1760) // 2000 - 240
    expect(c.totalRepayable).toBe(2730)
    expect(c.weeklyInstallment).toBe(210)
    expect(c.eligibility.flag).toBe('eligible')
  })
})
