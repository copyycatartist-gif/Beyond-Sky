export default function LoansLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading loans portfolio">
      {/* Header skeleton */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-6 w-56 rounded" />
          <div className="skeleton h-3 w-72 rounded" />
        </div>
        <div className="skeleton h-10 w-48 rounded-lg" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="skeleton h-10 w-full sm:w-80 rounded-lg" />
        <div className="skeleton h-10 w-40 rounded-lg" />
        <div className="skeleton h-10 w-32 rounded-lg" />
        <div className="skeleton h-10 w-32 rounded-lg ml-auto" />
      </div>

      {/* Status distribution bar skeleton */}
      <div className="skeleton h-3 w-full rounded-full" />

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="skeleton h-11 rounded-none border-b border-gray-100" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="skeleton h-14 rounded-none border-b border-gray-100"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
