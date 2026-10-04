'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
  UserPlus,
  UserMinus,
  Loader2,
  Search,
  Crown,
  DollarSign,
  PenLine,
  User,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShieldAlert,
  AlertTriangle,
  Check,
  X,
  Printer,
  Repeat2,
  ListPlus,
  ChevronUp,
  CalendarCheck,
  TrendingUp,
  Award,
  Sparkles,
  UsersRound,
  Clock,
  Ban,
} from 'lucide-react'

type MemberRole = 'leader' | 'treasurer' | 'secretary' | 'member'

type SortKey = 'name' | 'joined' | 'role' | 'attendance' | 'contributions'
type SortDir = 'asc' | 'desc'

interface MemberClient {
  id: string
  account_number: string
  full_name: string
  phone_number: string
  business_type: string
  market_location?: string | null
  daily_business_income?: number | null
  status?: string | null
  is_watchlisted?: boolean | null
  tier?: string | null
}

interface Member {
  id: string
  client_id: string
  date_joined: string
  date_left: string | null
  role?: MemberRole | null
  removal_reason?: string | null
  attendance_count?: number | null
  contributions_total?: number | null
  client: MemberClient
}

interface AvailableClient {
  id: string
  account_number: string
  full_name: string
  phone_number?: string | null
  business_type?: string | null
  status?: string | null
  is_watchlisted?: boolean | null
  daily_business_income?: number | null
}

interface WaitlistClient {
  id: string
  account_number: string
  full_name: string
  phone_number: string | null
  business_type: string | null
}

interface WaitlistEntry {
  id: string
  group_id: string
  client_id: string
  priority: number
  date_added: string
  added_by: string | null
  notes: string | null
  status: string
  clients: WaitlistClient | null
}

interface OtherGroup {
  id: string
  name: string
  branch: string | null
  max_members: number
}

const ROLE_CONFIG: Record<
  MemberRole,
  { label: string; icon: typeof Crown; className: string }
> = {
  leader: {
    label: 'Leader',
    icon: Crown,
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  treasurer: {
    label: 'Treasurer',
    icon: DollarSign,
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  secretary: {
    label: 'Secretary',
    icon: PenLine,
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  member: {
    label: 'Member',
    icon: User,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
}

const ROLE_ORDER: Record<MemberRole, number> = {
  leader: 0,
  treasurer: 1,
  secretary: 2,
  member: 3,
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)))
}

function tenureLabel(dateStr: string): string {
  const days = daysSince(dateStr)
  if (days === 0) return 'Joined today'
  if (days === 1) return 'Joined 1 day ago'
  return `Joined ${days} days ago`
}

function RoleBadge({ role }: { role: MemberRole }) {
  const config = ROLE_CONFIG[role]
  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        config.className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

export function GroupMembersManager({
  groupId,
  groupName,
  maxMembers,
  currentMembers,
  availableClients,
}: {
  groupId: string
  groupName: string
  maxMembers: number
  currentMembers: Member[]
  availableClients: AvailableClient[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  // ---------- Table state ----------
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('joined')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // ---------- Add members dialog ----------
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [otherGroupMap, setOtherGroupMap] = useState<Record<string, string[]>>({})
  const [guarantorMap, setGuarantorMap] = useState<Record<string, string>>({})

  // ---------- Removal ----------
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removeLoading, setRemoveLoading] = useState(false)

  // ---------- Role assignment ----------
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null)

  // ---------- Transfer ----------
  const [transferTarget, setTransferTarget] = useState<Member | null>(null)
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [otherGroups, setOtherGroups] = useState<OtherGroup[]>([])

  // ---------- Waitlist ----------
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDialogOpen, setWaitlistDialogOpen] = useState(false)
  const [waitlistClientId, setWaitlistClientId] = useState('')
  const [waitlistNotes, setWaitlistNotes] = useState('')
  const [waitlistSaving, setWaitlistSaving] = useState(false)
  const [promotingId, setPromotingId] = useState<string | null>(null)

  const activeMembers = useMemo(
    () => currentMembers.filter((m) => m.date_left === null),
    [currentMembers]
  )
  const activeClientIds = useMemo(
    () => new Set(activeMembers.map((m) => m.client_id)),
    [activeMembers]
  )
  const slotsRemaining = Math.max(0, maxMembers - activeMembers.length)
  const isFull = slotsRemaining === 0

  const topContributorId = useMemo(() => {
    let best: Member | null = null
    for (const m of activeMembers) {
      const total = Number(m.contributions_total ?? 0)
      if (total > 0 && (!best || total > Number(best.contributions_total ?? 0))) {
        best = m
      }
    }
    return best?.id ?? null
  }, [activeMembers])

  // ---------- Filtered + sorted members ----------
  const visibleMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? activeMembers.filter((m) => {
          const role = (m.role ?? 'member') as MemberRole
          return (
            m.client?.full_name?.toLowerCase().includes(q) ||
            m.client?.account_number?.toLowerCase().includes(q) ||
            role.includes(q) ||
            ROLE_CONFIG[role].label.toLowerCase().includes(q)
          )
        })
      : activeMembers

    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * (a.client?.full_name ?? '').localeCompare(b.client?.full_name ?? '')
        case 'joined':
          return dir * new Date(a.date_joined).getTime() - dir * new Date(b.date_joined).getTime()
        case 'role':
          return (
            dir *
            (ROLE_ORDER[(a.role ?? 'member') as MemberRole] -
              ROLE_ORDER[(b.role ?? 'member') as MemberRole])
          )
        case 'attendance':
          return dir * ((a.attendance_count ?? 0) - (b.attendance_count ?? 0))
        case 'contributions':
          return dir * (Number(a.contributions_total ?? 0) - Number(b.contributions_total ?? 0))
        default:
          return 0
      }
    })
  }, [activeMembers, searchQuery, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 text-gray-300" />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600" />
    )
  }

  // ---------- Load waitlist ----------
  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('group_waitlist')
        .select(
          'id, group_id, client_id, priority, date_added, added_by, notes, status, clients(id, account_number, full_name, phone_number, business_type)'
        )
        .eq('group_id', groupId)
        .eq('status', 'waiting')
        .order('priority', { ascending: false })
        .order('date_added', { ascending: true })

      if (error) throw error
      setWaitlist((data as unknown as WaitlistEntry[]) ?? [])
    } catch (err: any) {
      toast({
        title: 'Could not load waitlist',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setWaitlistLoading(false)
    }
  }, [groupId, toast])

  // ---------- Load other groups (for transfer) ----------
  const loadOtherGroups = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, branch, max_members')
        .eq('status', 'active')
        .neq('id', groupId)
        .order('name', { ascending: true })

      if (!error && data) setOtherGroups(data as OtherGroup[])
    } catch {
      // Non-critical: transfer dialog will simply show no options
    }
  }, [groupId])

  useEffect(() => {
    loadWaitlist()
    loadOtherGroups()
  }, [loadWaitlist, loadOtherGroups])

  // ---------- Load cross-group memberships + guarantor names when add dialog opens ----------
  useEffect(() => {
    if (!addDialogOpen) return
    let cancelled = false

    const load = async () => {
      setMembershipsLoading(true)
      try {
        const supabase = createClient()
        const candidateIds = availableClients.map((c) => c.id)

        const membershipMap: Record<string, string[]> = {}
        if (candidateIds.length > 0) {
          const { data } = await supabase
            .from('group_members')
            .select('client_id, groups(name)')
            .in('client_id', candidateIds)
            .is('date_left', null)
            .neq('group_id', groupId)

          ;(data ?? []).forEach((row: any) => {
            const gName = row.groups?.name ?? 'another group'
            membershipMap[row.client_id] = [...(membershipMap[row.client_id] ?? []), gName]
          })
        }

        const gMap: Record<string, string> = {}
        const memberClientIds = activeMembers.map((m) => m.client_id)
        if (memberClientIds.length > 0) {
          const { data } = await supabase
            .from('clients')
            .select('id, full_name, guarantor_name')
            .in('id', memberClientIds)

          ;(data ?? []).forEach((c: any) => {
            if (c.guarantor_name) {
              gMap[String(c.guarantor_name).toLowerCase().trim()] = c.full_name
            }
          })
        }

        if (!cancelled) {
          setOtherGroupMap(membershipMap)
          setGuarantorMap(gMap)
        }
      } finally {
        if (!cancelled) setMembershipsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDialogOpen, groupId])

  // ---------- Add dialog client filtering + eligibility ----------
  const addCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    return availableClients
      .filter((c) => !activeClientIds.has(c.id))
      .map((c) => {
        const blockers: string[] = []
        const warnings: string[] = []

        if (c.status !== 'active') blockers.push(`Client status is "${c.status}" (must be active)`)
        if (c.is_watchlisted) blockers.push('Client is watchlisted')

        const otherGroupsForClient = otherGroupMap[c.id] ?? []
        if (otherGroupsForClient.length > 0) {
          warnings.push(`Already in ${otherGroupsForClient.join(', ')}`)
        }

        const nameKey = c.full_name?.toLowerCase().trim()
        if (nameKey && guarantorMap[nameKey]) {
          warnings.push(
            `Name matches the guarantor of existing member ${guarantorMap[nameKey]} — verify independence`
          )
        }

        return { client: c, blockers, warnings, eligible: blockers.length === 0 }
      })
      .filter((row) => {
        if (!q) return true
        const c = row.client
        return (
          c.full_name?.toLowerCase().includes(q) ||
          c.account_number?.toLowerCase().includes(q) ||
          c.business_type?.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible))
  }, [availableClients, activeClientIds, addSearch, otherGroupMap, guarantorMap])

  const toggleClientSelection = (clientId: string, eligible: boolean) => {
    setSelectedClientIds((prev) => {
      if (prev.includes(clientId)) return prev.filter((id) => id !== clientId)
      if (!eligible) return prev
      if (prev.length >= slotsRemaining) {
        toast({
          title: 'Capacity reached',
          description: `Only ${slotsRemaining} slot${slotsRemaining === 1 ? '' : 's'} remaining in this group.`,
          variant: 'destructive',
        })
        return prev
      }
      return [...prev, clientId]
    })
  }

  const selectedWarnings = useMemo(() => {
    const warnings: string[] = []
    for (const id of selectedClientIds) {
      const row = addCandidates.find((r) => r.client.id === id)
      if (!row) continue
      for (const w of row.warnings) warnings.push(`${row.client.full_name}: ${w}`)
    }
    return warnings
  }, [selectedClientIds, addCandidates])

  const handleBulkAdd = async () => {
    if (selectedClientIds.length === 0) return
    setAddLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: selectedClientIds }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to add members')

      toast({
        title: 'Members Added',
        description: `${selectedClientIds.length} client${selectedClientIds.length === 1 ? '' : 's'} added to ${groupName}.`,
        variant: 'success',
      })
      setAddDialogOpen(false)
      setSelectedClientIds([])
      setAddSearch('')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot add members', description: err.message, variant: 'destructive' })
    } finally {
      setAddLoading(false)
    }
  }

  // ---------- Role change ----------
  const handleRoleChange = async (member: Member, newRole: MemberRole) => {
    const currentRole = (member.role ?? 'member') as MemberRole
    if (newRole === currentRole) return
    setRoleSavingId(member.id)
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: member.id, role: newRole }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to update role')

      toast({
        title: 'Role Updated',
        description: `${member.client?.full_name} is now the group ${ROLE_CONFIG[newRole].label.toLowerCase()}.`,
        variant: 'success',
      })
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot change role', description: err.message, variant: 'destructive' })
    } finally {
      setRoleSavingId(null)
    }
  }

  // ---------- Removal with reason ----------
  const openRemoveDialog = (member: Member) => {
    setRemoveTarget(member)
    setRemoveReason('')
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    if (!removeReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a removal reason for the audit trail.',
        variant: 'destructive',
      })
      return
    }
    setRemoveLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: removeTarget.id,
          removal_reason: removeReason.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to remove member')

      toast({
        title: 'Member Removed',
        description: `${removeTarget.client?.full_name} has been removed from the group.`,
        variant: 'success',
      })
      setRemoveTarget(null)
      setRemoveReason('')
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot remove member', description: err.message, variant: 'destructive' })
    } finally {
      setRemoveLoading(false)
    }
  }

  // ---------- Transfer ----------
  const openTransferDialog = (member: Member) => {
    setTransferTarget(member)
    setTransferGroupId('')
    setTransferReason('')
  }

  const handleTransfer = async () => {
    if (!transferTarget || !transferGroupId) return
    setTransferLoading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/members/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: transferTarget.id,
          target_group_id: transferGroupId,
          reason: transferReason.trim() || null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Failed to transfer member')

      const targetName = otherGroups.find((g) => g.id === transferGroupId)?.name ?? 'target group'
      toast({
        title: 'Member Transferred',
        description: `${transferTarget.client?.full_name} was transferred to ${targetName}.`,
        variant: 'success',
      })
      setTransferTarget(null)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot transfer member', description: err.message, variant: 'destructive' })
    } finally {
      setTransferLoading(false)
    }
  }

  // ---------- Waitlist actions ----------
  const waitlistClientIds = useMemo(() => new Set(waitlist.map((w) => w.client_id)), [waitlist])

  const waitlistCandidates = useMemo(
    () =>
      availableClients.filter(
        (c) => !activeClientIds.has(c.id) && !waitlistClientIds.has(c.id) && c.status === 'active' && !c.is_watchlisted
      ),
    [availableClients, activeClientIds, waitlistClientIds]
  )

  const handleAddToWaitlist = async () => {
    if (!waitlistClientId) return
    setWaitlistSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in')

      const nextPriority = waitlist.reduce((max, w) => Math.max(max, w.priority ?? 0), 0) + 1
      const { error } = await supabase.from('group_waitlist').insert({
        group_id: groupId,
        client_id: waitlistClientId,
        priority: nextPriority,
        added_by: user.id,
        notes: waitlistNotes.trim() || null,
        status: 'waiting',
      })
      if (error) throw error

      const clientName =
        waitlistCandidates.find((c) => c.id === waitlistClientId)?.full_name ?? 'Client'
      toast({
        title: 'Added to Waitlist',
        description: `${clientName} was queued at priority ${nextPriority}.`,
        variant: 'success',
      })
      setWaitlistDialogOpen(false)
      setWaitlistClientId('')
      setWaitlistNotes('')
      await loadWaitlist()
    } catch (err: any) {
      toast({ title: 'Cannot add to waitlist', description: err.message, variant: 'destructive' })
    } finally {
      setWaitlistSaving(false)
    }
  }

  const handlePromote = async (entry: WaitlistEntry) => {
    if (isFull) {
      toast({
        title: 'Group is full',
        description: `Free a slot before promoting. Hard cap is ${maxMembers} members.`,
        variant: 'destructive',
      })
      return
    }
    setPromotingId(entry.id)
    try {
      const supabase = createClient()
      const { error: insertError } = await supabase.from('group_members').insert({
        group_id: groupId,
        client_id: entry.client_id,
        date_joined: new Date().toISOString().split('T')[0],
        role: 'member',
      })
      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('group_waitlist')
        .update({ status: 'promoted' })
        .eq('id', entry.id)
      if (updateError) throw updateError

      toast({
        title: 'Member Promoted',
        description: `${entry.clients?.full_name ?? 'Client'} was promoted from the waitlist into the group.`,
        variant: 'success',
      })
      await loadWaitlist()
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Cannot promote', description: err.message, variant: 'destructive' })
    } finally {
      setPromotingId(null)
    }
  }

  const capacityPct = Math.min(100, Math.round((activeMembers.length / maxMembers) * 100))
  const capacityBarColor = isFull
    ? 'bg-red-500'
    : capacityPct >= 80
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  return (
    <div className="space-y-4">
      {/* ---------- Header + capacity ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-center">
        <div className="min-w-[240px] flex-1">
          <h3 className="text-base font-bold text-gray-900">
            Group Members ({activeMembers.length} / {maxMembers})
          </h3>
          <p className="text-xs text-gray-500">Individual liability applies to every member</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn('h-full rounded-full transition-all', capacityBarColor)}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-gray-600 whitespace-nowrap">
              {capacityPct}% full · {slotsRemaining} slot{slotsRemaining === 1 ? '' : 's'} left
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print List
          </Button>
          <Button
            onClick={() => setAddDialogOpen(true)}
            disabled={isFull}
            className="bg-blue-600 hover:bg-blue-700 text-xs h-9"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            {isFull ? 'Group Full' : 'Add Members'}
          </Button>
        </div>
      </div>

      {isFull && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800 print:hidden">
          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
          <span>Group full — use the waitlist.</span>
        </div>
      )}

      {/* ---------- Search / filter ---------- */}
      {activeMembers.length > 0 && (
        <div className="relative max-w-sm print:hidden">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, account # or role..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      )}

      {/* ---------- Members table ---------- */}
      {activeMembers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center print:hidden">
          <UsersRound className="mx-auto h-10 w-10 text-gray-300" />
          <h4 className="mt-3 text-sm font-semibold text-gray-900">No members yet</h4>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            {groupName} has no active members. Add up to {maxMembers} clients to start building the
            solidarity circle.
          </p>
          <Button
            onClick={() => setAddDialogOpen(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-xs"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add the first members
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  <span className="inline-flex items-center gap-1">
                    Member <SortIcon columnKey="name" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('role')}>
                  <span className="inline-flex items-center gap-1">
                    Role <SortIcon columnKey="role" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('joined')}>
                  <span className="inline-flex items-center gap-1">
                    Tenure <SortIcon columnKey="joined" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('attendance')}>
                  <span className="inline-flex items-center gap-1">
                    Attendance <SortIcon columnKey="attendance" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('contributions')}>
                  <span className="inline-flex items-center gap-1">
                    Contributions <SortIcon columnKey="contributions" />
                  </span>
                </TableHead>
                <TableHead>Performance</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-gray-400 text-xs">
                    No members match &ldquo;{searchQuery}&rdquo;.
                  </TableCell>
                </TableRow>
              ) : (
                visibleMembers.map((m) => {
                  const role = (m.role ?? 'member') as MemberRole
                  const isNew = daysSince(m.date_joined) < 30
                  const perfectAttendance = (m.attendance_count ?? 0) >= 10
                  const isTopContributor = m.id === topContributorId
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/clients/${m.client?.id}`}
                            className="text-sm font-semibold text-blue-600 hover:underline"
                          >
                            {m.client?.full_name}
                          </Link>
                          <span className="font-mono text-[11px] text-gray-500">
                            {m.client?.account_number} · {m.client?.business_type}
                          </span>
                          {m.client?.is_watchlisted && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                              <Ban className="h-3 w-3" /> Watchlisted
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <RoleBadge role={role} />
                          <select
                            value={role}
                            disabled={roleSavingId === m.id}
                            onChange={(e) => handleRoleChange(m, e.target.value as MemberRole)}
                            className="h-7 w-[120px] rounded-md border border-gray-300 bg-white px-1.5 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 print:hidden"
                            aria-label={`Change role for ${m.client?.full_name}`}
                          >
                            <option value="member">Member</option>
                            <option value="leader">Leader</option>
                            <option value="treasurer">Treasurer</option>
                            <option value="secretary">Secretary</option>
                          </select>
                          {roleSavingId === m.id && (
                            <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-gray-700">{formatDate(m.date_joined)}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Clock className="h-3 w-3" />
                            {tenureLabel(m.date_joined)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 text-[11px] font-medium">
                          <CalendarCheck className="h-3 w-3 text-blue-600" />
                          {m.attendance_count ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(Number(m.contributions_total ?? 0))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {perfectAttendance && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <Award className="h-3 w-3" /> Perfect Attendance
                            </span>
                          )}
                          {isTopContributor && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              <TrendingUp className="h-3 w-3" /> Top Contributor
                            </span>
                          )}
                          {isNew && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                              <Sparkles className="h-3 w-3" /> New Member
                            </span>
                          )}
                          {!perfectAttendance && !isTopContributor && !isNew && (
                            <span className="text-[11px] text-gray-300">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openTransferDialog(m)}
                            className="h-7 px-2 text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50"
                            title={`Transfer ${m.client?.full_name} to another group`}
                          >
                            <Repeat2 className="h-3.5 w-3.5 mr-1" />
                            Transfer
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRemoveDialog(m)}
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <UserMinus className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---------- Waitlist section ---------- */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm print:hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <ListPlus className="h-4 w-4 text-blue-600" />
              Waitlist ({waitlist.length})
            </h4>
            <p className="text-[11px] text-gray-500">
              Clients queued for the next available slot, ordered by priority.
            </p>
          </div>
          {isFull && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setWaitlistDialogOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Add to Waitlist
            </Button>
          )}
        </div>

        {waitlistLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading waitlist...
          </div>
        ) : waitlist.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">
            {isFull
              ? 'No one is queued yet. Add clients to the waitlist so the next opening is filled fast.'
              : 'The waitlist is empty. It becomes useful once the group reaches capacity.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {waitlist.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
                      #{w.priority}
                    </span>
                    <Link
                      href={`/clients/${w.client_id}`}
                      className="truncate text-sm font-semibold text-blue-600 hover:underline"
                    >
                      {w.clients?.full_name ?? 'Unknown client'}
                    </Link>
                    <span className="font-mono text-[11px] text-gray-400">
                      {w.clients?.account_number}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Added {formatDate(w.date_added?.split('T')[0])}
                    {w.notes ? ` · ${w.notes}` : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  disabled={isFull || promotingId === w.id}
                  onClick={() => handlePromote(w)}
                  title={isFull ? 'No free slot available' : 'Promote into the group'}
                >
                  {promotingId === w.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <ChevronUp className="h-3.5 w-3.5 mr-1" />
                      Promote
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Add members dialog ---------- */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Members to {groupName}</DialogTitle>
            <DialogDescription>
              Multi-select clients — {slotsRemaining} slot{slotsRemaining === 1 ? '' : 's'}{' '}
              remaining.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search clients by name, account # or business..."
                className="pl-9 h-9 text-xs"
                autoFocus
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200">
              {membershipsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility...
                </div>
              ) : addCandidates.length === 0 ? (
                <p className="py-10 text-center text-xs text-gray-400">
                  No candidate clients match. Register new clients or adjust the search.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {addCandidates.map(({ client, blockers, warnings, eligible }) => {
                    const checked = selectedClientIds.includes(client.id)
                    return (
                      <li key={client.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors',
                            checked ? 'bg-blue-50' : 'hover:bg-gray-50',
                            !eligible && 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={checked}
                            disabled={!eligible}
                            onChange={() => toggleClientSelection(client.id, eligible)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {client.full_name}
                              </span>
                              <span className="font-mono text-[11px] text-blue-700">
                                {client.account_number}
                              </span>
                              <span className="text-[11px] text-gray-500">{client.business_type}</span>
                            </div>
                            {blockers.map((b) => (
                              <p
                                key={b}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600"
                              >
                                <Ban className="h-3 w-3" /> {b}
                              </p>
                            ))}
                            {warnings.map((w) => (
                              <p
                                key={w}
                                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600"
                              >
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
                              </p>
                            ))}
                          </div>
                          {eligible && !checked && <Check className="mt-1 h-4 w-4 text-gray-200" />}
                          {checked && <Check className="mt-1 h-4 w-4 text-blue-600" />}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {selectedWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Conflict warnings for selected clients
                </p>
                <ul className="mt-1.5 list-disc pl-5 text-[11px] text-amber-700">
                  {selectedWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
            <span className="text-xs text-gray-500">
              {selectedClientIds.length} of {slotsRemaining} slot
              {slotsRemaining === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleBulkAdd}
                disabled={selectedClientIds.length === 0 || addLoading}
                className="bg-blue-600 hover:bg-blue-700 min-w-[130px]"
              >
                {addLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Add {selectedClientIds.length > 0 ? selectedClientIds.length : ''} Member
                    {selectedClientIds.length === 1 ? '' : 's'}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Remove member dialog ---------- */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <UserMinus className="h-4 w-4" />
              Remove {removeTarget?.client?.full_name}?
            </DialogTitle>
            <DialogDescription>
              A removal reason is required for the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <label className="text-xs font-medium text-gray-700" htmlFor="removal-reason">
              Removal Reason *
            </label>
            <textarea
              id="removal-reason"
              rows={3}
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="e.g. Relocated out of the market area; requested exit in writing."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['Relocated', 'Defaulted on group rules', 'Voluntary exit', 'Deceased'].map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRemoveReason(preset)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    {preset}
                  </button>
                )
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeLoading || !removeReason.trim()}
              className="min-w-[130px]"
            >
              {removeLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Confirm Removal'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Transfer member dialog ---------- */}
      <Dialog open={!!transferTarget} onOpenChange={(open) => !open && setTransferTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat2 className="h-4 w-4 text-blue-600" />
              Transfer {transferTarget?.client?.full_name}
            </DialogTitle>
            <DialogDescription>
              Move to another active group — history in {groupName} is preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="transfer-group">
                Destination Group *
              </label>
              <select
                id="transfer-group"
                value={transferGroupId}
                onChange={(e) => setTransferGroupId(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose a group --</option>
                {otherGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.branch ?? '—'}, max {g.max_members})
                  </option>
                ))}
              </select>
              {otherGroups.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No other active groups available as a transfer destination.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="transfer-reason">
                Transfer Reason (optional)
              </label>
              <Input
                id="transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Trader relocated to Kaneshie market"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!transferGroupId || transferLoading}
              className="bg-blue-600 hover:bg-blue-700 min-w-[130px]"
            >
              {transferLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferring...
                </>
              ) : (
                'Confirm Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Add to waitlist dialog ---------- */}
      <Dialog open={waitlistDialogOpen} onOpenChange={setWaitlistDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-4 w-4 text-blue-600" />
              Add to Waitlist — {groupName}
            </DialogTitle>
            <DialogDescription>
              Queue an eligible client for the next opening.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="waitlist-client">
                Client *
              </label>
              <select
                id="waitlist-client"
                value={waitlistClientId}
                onChange={(e) => setWaitlistClientId(e.target.value)}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Choose a client --</option>
                {waitlistCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.account_number} — {c.full_name} ({c.business_type})
                  </option>
                ))}
              </select>
              {waitlistCandidates.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  No eligible clients available — everyone is already a member or on the waitlist.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700" htmlFor="waitlist-notes">
                Notes (optional)
              </label>
              <Input
                id="waitlist-notes"
                value={waitlistNotes}
                onChange={(e) => setWaitlistNotes(e.target.value)}
                placeholder="e.g. Referred by group leader; attends meetings as observer"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitlistDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddToWaitlist}
              disabled={!waitlistClientId || waitlistSaving}
              className="bg-blue-600 hover:bg-blue-700 min-w-[130px]"
            >
              {waitlistSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Queuing...
                </>
              ) : (
                'Add to Waitlist'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
