/** Shared group status badge styles — safe to import from Server Components. */

export function groupStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    inactive: 'bg-gray-100 text-gray-700 border-gray-200',
    suspended: 'bg-amber-100 text-amber-800 border-amber-200',
    dissolved: 'bg-red-100 text-red-800 border-red-200 font-semibold',
    forming: 'bg-blue-100 text-blue-800 border-blue-200',
    defaulted: 'bg-rose-100 text-rose-800 border-rose-200',
  }
  return map[status] ?? 'bg-gray-100 text-gray-800 border-gray-200'
}
