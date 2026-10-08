/** Calendar date in Ghana, YYYY-MM-DD. */
export function accraToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Today or an earlier date. Returns an error message, or null when the date is usable. */
export function paymentDateError(value: string): string | null {
  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Payment date must be a real day'
  }
  const [year, month, day] = date.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return 'Payment date must be a real day'
  }
  if (date > accraToday()) {
    return 'Payment date cannot be in the future'
  }
  return null
}

export function overpaymentError(amount: number, outstanding: number): string | null {
  const owed = Math.max(0, outstanding)
  if (amount > owed + 0.009) {
    return `Amount cannot be more than the outstanding balance of GHS ${owed.toFixed(2)}`
  }
  return null
}
