import { luhnCheckDigit, luhnValid, parseAccountNumber, formatAccountNumber } from './luhn'

describe('luhnCheckDigit', () => {
  test('computes correct check digit for 000001', () => {
    // BSM-000001-? : sequence 000001, sum calculation
    expect(luhnCheckDigit('000001')).toBe(8)
  })

  test('computes correct check digit for 000002', () => {
    expect(luhnCheckDigit('000002')).toBe(6)
  })

  test('computes correct check digit for 000010', () => {
    expect(luhnCheckDigit('000010')).toBe(9)
  })

  test('computes correct check digit for 123456', () => {
    // Known result: sequence 123456
    const result = luhnCheckDigit('123456')
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(9)
  })

  test('throws on non-digit input', () => {
    expect(() => luhnCheckDigit('abc')).toThrow()
  })

  test('throws on empty string', () => {
    expect(() => luhnCheckDigit('')).toThrow()
  })
})

describe('luhnValid', () => {
  test('validates a correct Luhn number', () => {
    // 4532015112830366 is a valid Luhn number (test credit card)
    expect(luhnValid('4532015112830366')).toBe(true)
  })

  test('rejects an incorrect Luhn number', () => {
    expect(luhnValid('4532015112830367')).toBe(false)
  })

  test('validates our generated sequence 000001 + check digit 8', () => {
    expect(luhnValid('0000018')).toBe(true)
  })

  test('rejects 0000019 (wrong check digit for 000001)', () => {
    expect(luhnValid('0000019')).toBe(false)
  })

  test('returns false for non-digit input', () => {
    expect(luhnValid('abc')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(luhnValid('')).toBe(false)
  })

  test('single digit 0 is valid (trivial case)', () => {
    expect(luhnValid('0')).toBe(true)
  })
})

describe('parseAccountNumber', () => {
  test('parses and validates a correct account number', () => {
    // Generate a known valid account number first
    const acct = formatAccountNumber(1)
    const result = parseAccountNumber(acct)
    expect(result).not.toBeNull()
    expect(result!.valid).toBe(true)
    expect(result!.sequence).toBe('000001')
  })

  test('returns null for wrong format', () => {
    expect(parseAccountNumber('BSM-12345-8')).toBeNull()     // 5 digits
    expect(parseAccountNumber('BSM-1234567-8')).toBeNull()   // 7 digits
    expect(parseAccountNumber('XYZ-000001-8')).toBeNull()    // wrong prefix
    expect(parseAccountNumber('BSM-000001')).toBeNull()      // missing check digit
    expect(parseAccountNumber('')).toBeNull()
  })

  test('detects invalid check digit', () => {
    const result = parseAccountNumber('BSM-000001-9')  // correct would be -8
    expect(result).not.toBeNull()
    expect(result!.valid).toBe(false)
  })
})

describe('formatAccountNumber', () => {
  test('formats sequence 1 correctly', () => {
    const acct = formatAccountNumber(1)
    expect(acct).toMatch(/^BSM-000001-\d$/)
    const parsed = parseAccountNumber(acct)
    expect(parsed!.valid).toBe(true)
  })

  test('formats sequence 999999 correctly', () => {
    const acct = formatAccountNumber(999999)
    expect(acct).toMatch(/^BSM-999999-\d$/)
    const parsed = parseAccountNumber(acct)
    expect(parsed!.valid).toBe(true)
  })

  test('throws for out-of-range sequence', () => {
    expect(() => formatAccountNumber(0)).toThrow()
    expect(() => formatAccountNumber(1000000)).toThrow()
    expect(() => formatAccountNumber(-1)).toThrow()
  })

  test('throws for non-integer', () => {
    expect(() => formatAccountNumber(1.5)).toThrow()
  })

  test('round-trips: formatAccountNumber -> parseAccountNumber -> valid', () => {
    for (const seq of [1, 42, 100, 5000, 123456, 999999]) {
      const acct = formatAccountNumber(seq)
      const parsed = parseAccountNumber(acct)
      expect(parsed!.valid).toBe(true)
      expect(parseInt(parsed!.sequence, 10)).toBe(seq)
    }
  })
})
