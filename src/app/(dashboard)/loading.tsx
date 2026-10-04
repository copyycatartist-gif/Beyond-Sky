export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading page">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-56 rounded" />
          <div className="skeleton h-3 w-40 rounded" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between gap-3">
        <div className="skeleton h-10 w-72 rounded-lg" />
        <div className="skeleton h-10 w-32 rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="skeleton h-11 rounded-none border-b border-gray-100" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="skeleton h-14 rounded-none border-b border-gray-100"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
