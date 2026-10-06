import { SMS_TEMPLATES } from './types'

describe('SMS_TEMPLATES', () => {
  test('welcome mentions account number', () => {
    const msg = SMS_TEMPLATES.welcome('Ama Mensah', 'BSM-000001-8')
    expect(msg).toContain('Ama Mensah')
    expect(msg).toContain('BSM-000001-8')
    expect(msg.toLowerCase()).toContain('welcome')
  })

  test('loan_closed congratulates on full payment', () => {
    const msg = SMS_TEMPLATES.loan_closed('Kofi Boateng', 'BSM-000001-8-L01', 120)
    expect(msg).toContain('Kofi Boateng')
    expect(msg).toContain('FULLY PAID')
    expect(msg).toContain('120.00')
  })

  test('confirmation includes remaining balance', () => {
    const msg = SMS_TEMPLATES.confirmation('Ama', 50, 450, 'LN-1', '06 Oct 2026')
    expect(msg).toContain('50.00')
    expect(msg).toContain('450.00')
  })
})
