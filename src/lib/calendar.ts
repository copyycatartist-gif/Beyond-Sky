/**
 * Calendar / ICS generation helpers.
 */

export interface ICSEvent {
  title: string
  description?: string
  startDate: Date
  endDate?: Date
  location?: string
}

/**
 * Escape special characters in ICS text values per RFC 5545 (section 3.3.11).
 * Backslash, semicolon, comma and newlines must be escaped.
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
}

/**
 * Format a Date as an ICS UTC datetime: YYYYMMDDTHHMMSSZ
 */
function formatICSDateUTC(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

/**
 * Fold long lines to the RFC 5545 75-octet limit (fold with CRLF + space).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let current = line.slice(0, 75)
  let rest = line.slice(75)
  parts.push(current)
  while (rest.length > 0) {
    current = ' ' + rest.slice(0, 74)
    rest = rest.slice(74)
    parts.push(current)
  }
  return parts.join('\r\n')
}

/**
 * Generate a simple pseudo-random UID for the VEVENT.
 */
function generateUID(): string {
  const random = Math.random().toString(36).slice(2, 12)
  const time = Date.now().toString(36)
  return `${time}-${random}@beyondsky`
}

/**
 * Generate valid .ics file content (VCALENDAR with a single VEVENT)
 * for the given event. All timestamps are emitted in UTC format.
 */
export function generateICS(event: ICSEvent): string {
  const dtStart = formatICSDateUTC(event.startDate)
  // Default to a 1-hour event when no end date is supplied
  const endDate = event.endDate ?? new Date(event.startDate.getTime() + 60 * 60 * 1000)
  const dtEnd = formatICSDateUTC(endDate)
  const dtStamp = formatICSDateUTC(new Date())

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beyond Sky//Client Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${generateUID()}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICSText(event.title)}`,
  ]

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICSText(event.description)}`)
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICSText(event.location)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.map(foldLine).join('\r\n') + '\r\n'
}
