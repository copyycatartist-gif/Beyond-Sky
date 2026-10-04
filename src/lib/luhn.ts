/**
 * Luhn algorithm — pure TypeScript implementation.
 * Used for generating and validating client account numbers (BSM-######-C).
 *
 * The same algorithm is implemented in Postgres (migration 004_clients.sql).
 * This version is used client-side for instant validation feedback and for tests.
 */

/**
 * Compute the Luhn check digit for a string of digits.
 * @param digits - A string of digits (e.g., "000001")
 * @returns A single check digit (0–9)
 */
export function luhnCheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error(`luhnCheckDigit: input must be digits only, got "${digits}"`)
  }

  let sum = 0
  let double = true // rightmost digit gets doubled first

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10)
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return (10 - (sum % 10)) % 10
}

/**
 * Validate a full account number string (digits only, including check digit).
 * @param fullDigits - The complete digit string to validate (e.g., "0000018")
 * @returns true if the Luhn checksum is valid
 */
export function luhnValid(fullDigits: string): boolean {
  if (!/^\d+$/.test(fullDigits)) return false

  let sum = 0
  let double = false // rightmost digit (check digit) is not doubled

  for (let i = fullDigits.length - 1; i >= 0; i--) {
    let digit = parseInt(fullDigits[i], 10)
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return sum % 10 === 0
}

/**
 * Parse a client account number (BSM-######-C) and extract the 6-digit
 * sequence and check digit for validation.
 *
 * @param accountNumber - e.g., "BSM-000001-8"
 * @returns { valid: boolean, sequence: string, checkDigit: number } or null if format invalid
 */
export function parseAccountNumber(accountNumber: string): {
  valid: boolean
  sequence: string
  checkDigit: number
} | null {
  const match = accountNumber.match(/^BSM-(\d{6})-(\d)$/)
  if (!match) return null

  const sequence = match[1]
  const checkDigit = parseInt(match[2], 10)
  const expected = luhnCheckDigit(sequence)

  return {
    valid: checkDigit === expected,
    sequence,
    checkDigit,
  }
}

/**
 * Format a sequence number into a client account number.
 * @param sequence - A positive integer (e.g., 1, 42, 999999)
 * @returns Full account number string (e.g., "BSM-000001-8")
 */
export function formatAccountNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new Error(`formatAccountNumber: sequence must be 1–999999, got ${sequence}`)
  }
  const padded = sequence.toString().padStart(6, '0')
  const check = luhnCheckDigit(padded)
  return `BSM-${padded}-${check}`
}
