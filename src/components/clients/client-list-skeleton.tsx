export function ClientListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading clients">
      {/* Analytics header skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-3 bg-white rounded-xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="skeleton w-9 h-9 rounded-lg" />
              <div className="space-y-1.5">
                <div className="skeleton h-5 w-12" />
                <div className="skeleton h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search bar skeleton */}
      <div className="flex gap-3">
        <div className="skeleton h-10 flex-1 max-w-lg rounded-md" />
        <div className="skeleton h-10 w-24 rounded-md" />
        <div className="skeleton h-10 w-36 rounded-md" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="skeleton h-3 flex-1" />
            ))}
          </div>
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-3 border-b border-gray-100 flex items-center gap-4">
            <div className="skeleton w-8 h-8 rounded-full shrink-0" />
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-3 flex-1" />
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-7 w-14 rounded-md" />
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex justify-between items-center">
        <div className="skeleton h-3 w-32" />
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
