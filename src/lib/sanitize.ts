/**
 * Input sanitization helpers for user-supplied data.
 *
 * These are defense-in-depth utilities — always validate with zod schemas
 * and rely on Supabase/Postgres parameterized queries as the primary
 * protection against injection.
 */

/** Ghana mobile number: 0XXXXXXXXX (10 digits starting with 0) or +233XXXXXXXXX */
const GHANA_PHONE_REGEX = /^(?:0\d{9}|\+233\d{9})$/

/** Ghana national ID: GHA-XXXXXXXX-X (8 digits, dash, 1 digit) */
const GHANA_ID_REGEX = /^GHA-\d{8}-\d$/

/**
 * Sanitize a raw input string:
 * - removes null bytes and other ASCII control characters
 * - strips HTML tags
 * - normalizes unicode to NFC
 * - trims surrounding whitespace
 *
 * @param str - The untrusted input string
 * @returns The sanitized string ('' for null/undefined input)
 */
export function sanitizeInput(str: string): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/\0/g, '') // strip null bytes
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u001F\u007F]/g, '') // strip control characters
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .normalize('NFC') // normalize unicode
    .trim()
}

/**
 * Recursively sanitize all string values in an object.
 * Arrays are traversed; non-string primitives are left untouched.
 *
 * @param obj - Object containing untrusted values
 * @returns A new object with all strings sanitized
 */
export function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      item !== null && typeof item === 'object' ? sanitizeObject(item) : typeof item === 'string' ? sanitizeInput(item) : item
    )
  }

  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeInput(value)
    } else if (value !== null && typeof value === 'object') {
      result[key] = sanitizeObject(value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Validate a Ghana phone number.
 * Accepts local format 0XXXXXXXXX or international +233XXXXXXXXX.
 *
 * @param phone - The phone number to validate (whitespace is trimmed)
 * @returns true if the number matches a valid Ghana format
 */
export function isValidGhanaPhone(phone: string): boolean {
  if (typeof phone !== 'string') return false
  return GHANA_PHONE_REGEX.test(phone.trim())
}

/**
 * Validate a Ghana national ID number.
 * Accepts the GHA-XXXXXXXX-X pattern (8 digits, dash, 1 check digit).
 *
 * @param id - The ID to validate (whitespace is trimmed)
 * @returns true if the ID matches the GHA-XXXXXXXX-X pattern
 */
export function isValidGhanaId(id: string): boolean {
  if (typeof id !== 'string') return false
  return GHANA_ID_REGEX.test(id.trim())
}
