export function GroupListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading lending groups">
      {/* Quick stats header skeleton (5 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
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

      {/* Search + filters + actions bar skeleton */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2 max-w-2xl">
          <div className="skeleton h-10 flex-1 rounded-md" />
          <div className="skeleton h-10 w-36 rounded-md" />
          <div className="skeleton h-10 w-36 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-10 w-20 rounded-md" />
          <div className="skeleton h-10 w-16 rounded-md" />
          <div className="skeleton h-10 w-32 rounded-md" />
        </div>
      </div>

      {/* Results count skeleton */}
      <div className="skeleton h-3 w-48" />

      {/* Table skeleton */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="skeleton h-3 flex-1" />
            ))}
          </div>
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-3 border-b border-gray-100 flex items-center gap-4">
            <div className="skeleton w-4 h-4 rounded shrink-0" />
            <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-3 w-40" />
              <div className="skeleton h-2.5 w-20" />
            </div>
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-2 w-28 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-7 w-14 rounded-md" />
          </div>
        ))}
      </div>

      {/* Card skeleton (mobile) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 bg-white rounded-xl border border-gray-200 space-y-3">
            <div className="flex items-start gap-3">
              <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32" />
                <div className="skeleton h-2.5 w-20" />
                <div className="skeleton h-4 w-24 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton w-11 h-11 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-2.5 w-full rounded-full" />
                <div className="flex gap-1">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="skeleton w-6 h-6 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
            </div>
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
