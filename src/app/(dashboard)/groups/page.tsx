import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/supabase/auth'
import { GroupList } from '@/components/groups/group-list'
import { GroupListSkeleton } from '@/components/groups/group-list-skeleton'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 15
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'dissolved', 'forming']
const VALID_TYPES = ['solidarity', 'individual', 'cooperative']
const SORTABLE_COLUMNS = ['name', 'group_number', 'status', 'created_at', 'formed_at', 'max_members']
const MANAGER_ROLES = ['manager', 'supervisor', 'accountant_admin']

interface GroupsPageProps {
  searchParams: {
    search?: string
    q?: string
    branch?: string
    status?: string
    type?: string
    page?: string
    sort?: string
    order?: string
  }
}

interface GroupRow {
  id: string
  group_number: string
  name: string
  branch: string | null
  area: string | null
  status: string
  max_members: number
  group_type: string | null
  created_at: string
  formed_at: string | null
  meeting_day: string | null
  leader_id: string | null
  group_members: { id: string; date_left: string | null }[] | null
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const supabase = await createClient()
  const profile = await getCurrentUserProfile()

  // ---------------------------------------------------------------------------
  // 1. Parse & validate URL search params
  // ---------------------------------------------------------------------------
  const search = (searchParams.search ?? searchParams.q ?? '').trim()
  const status = searchParams.status && VALID_STATUSES.includes(searchParams.status)
    ? searchParams.status
    : 'all'
  const branch = searchParams.branch?.trim() || 'all'
  const type = searchParams.type && VALID_TYPES.includes(searchParams.type)
    ? searchParams.type
    : 'all'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const sort = searchParams.sort && SORTABLE_COLUMNS.includes(searchParams.sort)
    ? searchParams.sort
    : 'created_at'
  const order = searchParams.order === 'asc' ? 'asc' : 'desc'

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // ---------------------------------------------------------------------------
  // 2. Filtered + paginated groups (server-side via .range()) with member join
  // ---------------------------------------------------------------------------
  let groupsQuery = supabase
    .from('groups')
    .select(
      `
      id, group_number, name, branch, area, status, max_members, group_type,
      created_at, formed_at, meeting_day, leader_id,
      group_members (id, date_left)
      `,
      { count: 'exact' } as any
    )
    .order(sort as any, { ascending: order === 'asc' })

  if (search) {
    groupsQuery = groupsQuery.or(
      `name.ilike.%${search}%,group_number.ilike.%${search}%`
    )
  }

  if (status !== 'all') {
    groupsQuery = groupsQuery.eq('status', status)
  }

  if (branch !== 'all') {
    groupsQuery = groupsQuery.eq('branch', branch)
  }

  if (type !== 'all') {
    groupsQuery = groupsQuery.eq('group_type', type)
  }

  groupsQuery = groupsQuery.range(from, to)

  const { data: rows, count } = await groupsQuery

  const pageGroups = ((rows || []) as unknown as GroupRow[]).map((g) => ({
    id: g.id,
    group_number: g.group_number,
    name: g.name,
    branch: g.branch,
    area: g.area,
    status: g.status,
    max_members: g.max_members,
    group_type: g.group_type,
    created_at: g.created_at,
    formed_at: g.formed_at,
    meeting_day: g.meeting_day,
    active_member_count: (g.group_members || []).filter((m) => m.date_left === null).length,
    leader_id: g.leader_id,
  }))

  // ---------------------------------------------------------------------------
  // 3. Leader names for the current page
  // ---------------------------------------------------------------------------
  const leaderIds = Array.from(
    new Set(pageGroups.map((g) => g.leader_id).filter(Boolean))
  ) as string[]

  let leaderNameMap: Record<string, string> = {}
  if (leaderIds.length > 0) {
    const { data: leaders } = await supabase
      .from('clients')
      .select('id, full_name')
      .in('id', leaderIds)

    leaderNameMap = Object.fromEntries(
      ((leaders || []) as { id: string; full_name: string }[]).map((l) => [l.id, l.full_name])
    )
  }

  const groups = pageGroups.map((g) => ({
    id: g.id,
    group_number: g.group_number,
    name: g.name,
    branch: g.branch,
    area: g.area,
    status: g.status,
    max_members: g.max_members,
    group_type: g.group_type,
    created_at: g.created_at,
    formed_at: g.formed_at,
    meeting_day: g.meeting_day,
    active_member_count: g.active_member_count,
    leader_name: (g.leader_id && leaderNameMap[g.leader_id]) || null,
  }))

  const totalCount = count || groups.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  // ---------------------------------------------------------------------------
  // 4. Distinct branches for the filter dropdown
  // ---------------------------------------------------------------------------
  const { data: branchRows } = await supabase
    .from('groups')
    .select('branch')
    .not('branch', 'is', null)

  const uniqueBranches = Array.from(
    new Set(
      ((branchRows || []) as { branch: string | null }[])
        .map((b) => b.branch)
        .filter(Boolean) as string[]
    )
  ).sort()

  // ---------------------------------------------------------------------------
  // 5. Aggregate stats (independent of filters)
  // ---------------------------------------------------------------------------
  const { data: allRows } = await supabase
    .from('groups')
    .select('status, max_members, group_members (date_left)')

  const allGroups = (allRows || []) as unknown as {
    status: string
    max_members: number
    group_members: { date_left: string | null }[] | null
  }[]

  let totalMembers = 0
  let activeGroups = 0
  let formingGroups = 0
  let utilizationSum = 0
  let utilizationCount = 0

  allGroups.forEach((g) => {
    const activeMembers = (g.group_members || []).filter((m) => m.date_left === null).length
    totalMembers += activeMembers
    if (g.status === 'active') activeGroups += 1
    if (g.status === 'forming') formingGroups += 1
    if (g.max_members > 0) {
      utilizationSum += (activeMembers / g.max_members) * 100
      utilizationCount += 1
    }
  })

  const stats = {
    total_groups: allGroups.length,
    active_groups: activeGroups,
    forming_groups: formingGroups,
    total_members: totalMembers,
    avg_capacity_pct: utilizationCount > 0 ? Math.round(utilizationSum / utilizationCount) : 0,
  }

  const canManage = MANAGER_ROLES.includes(profile?.role || '')

  // ---------------------------------------------------------------------------
  // 6. Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Lending Groups</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Solidarity, individual, and cooperative lending groups
          </p>
        </div>
      </div>

      <Suspense fallback={<GroupListSkeleton />}>
        <GroupList
          groups={groups as any}
          totalCount={totalCount}
          page={currentPage}
          pageSize={PAGE_SIZE}
          search={search}
          status={status}
          branch={branch}
          type={type}
          sort={sort}
          order={order}
          branches={uniqueBranches}
          stats={stats}
          canManage={canManage}
          userRole={profile?.role || 'loan_officer'}
        />
      </Suspense>
    </div>
  )
}
