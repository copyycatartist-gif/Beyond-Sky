'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, humanizeStatus } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import {
  Search, PlusCircle, Users, Users2, Eye, Pencil, UserPlus, Ban, Printer,
  MoreHorizontal, X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, Download, Grid, List,
  CheckCircle2, AlertTriangle, Clock, PauseCircle, Sparkles, Calendar,
  MapPin, Crown, RefreshCw, CircleSlash, Filter, Columns3,
  Bookmark, BookmarkCheck, History, Trash2, WifiOff, Gauge, Link2, User,
  Building2, Loader2, ArrowUpDown
} from 'lucide-react'

interface Group {
  id: string
  group_number: string
  name: string
  branch: string | null
  area: string | null
  status: 'active' | 'inactive' | 'suspended' | 'dissolved' | 'forming'
  max_members: number
  group_type: 'solidarity' | 'individual' | 'cooperative' | string | null
  active_member_count: number
  created_at: string
  formed_at: string | null
  meeting_day?: string | null
  leader_name?: string | null
}

interface GroupListStats {
  total_groups: number
  active_groups: number
  forming_groups: number
  total_members: number
  avg_capacity_pct: number
}

interface GroupListProps {
  groups: Group[]
  totalCount: number
  page: number
  pageSize: number
  search: string
  status: string
  branch: string
  type: string
  sort: string
  order: string
  branches: string[]
  stats: GroupListStats
  canManage: boolean
  userRole: string
}

interface SavedFilter {
  name: string
  params: Record<string, string>
}

type ViewMode = 'table' | 'cards'

const STORAGE_KEYS = {
  viewMode: 'beyondsky.groups.viewMode',
  columns: 'beyondsky.groups.columns',
  recentSearches: 'beyondsky.groups.recentSearches',
  savedFilters: 'beyondsky.groups.savedFilters',
}

const STATUS_CONFIG: Record<string, { badge: string; icon: typeof CheckCircle2 }> = {
  active: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  forming: { badge: 'bg-blue-100 text-blue-800 border-blue-200', icon: Sparkles },
  suspended: { badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: PauseCircle },
  dissolved: { badge: 'bg-slate-200 text-slate-700 border-slate-300', icon: CircleSlash },
  inactive: { badge: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock },
}

const GROUP_TYPE_CONFIG: Record<string, { badge: string; label: string; icon: typeof Link2 }> = {
  solidarity: { badge: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Solidarity', icon: Link2 },
  individual: { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', label: 'Individual', icon: User },
  cooperative: { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Cooperative', icon: Building2 },
}

interface ColumnDef {
  key: string
  label: string
  locked: boolean
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'group', label: 'Group', locked: true },
  { key: 'type', label: 'Type', locked: false },
  { key: 'capacity', label: 'Capacity', locked: false },
  { key: 'status', label: 'Status', locked: false },
  { key: 'branch', label: 'Area', locked: false },
  { key: 'meeting', label: 'Meeting Day', locked: false },
  { key: 'leader', label: 'Leader', locked: false },
  { key: 'formed', label: 'Formed', locked: false },
  { key: 'created', label: 'Created', locked: false },
  { key: 'actions', label: 'Actions', locked: true },
]

type ColumnKey = typeof ALL_COLUMNS[number]['key']

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'group_number:asc', label: 'Group # ascending' },
  { value: 'status:asc', label: 'Status' },
  { value: 'max_members:desc', label: 'Max members' },
  { value: 'formed_at:desc', label: 'Recently formed' },
]

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
    'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} wk ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mo ago`
  return `${Math.floor(diffDays / 365)} yr ago`
}

function capacityPct(group: Group): number {
  if (!group.max_members || group.max_members <= 0) return 0
  return Math.round((group.active_member_count / group.max_members) * 100)
}

function slotsLeft(group: Group): number {
  return Math.max(0, group.max_members - group.active_member_count)
}

/** Heatmap level: green (<75%), amber (75–99%), red (FULL) */
function capacityLevel(group: Group): 'green' | 'amber' | 'red' {
  const pct = capacityPct(group)
  if (pct >= 100) return 'red'
  if (pct >= 75) return 'amber'
  return 'green'
}

const ROW_HEATMAP = {
  green: 'bg-emerald-50/40 hover:bg-emerald-50/70',
  amber: 'bg-amber-50/40 hover:bg-amber-50/70',
  red: 'bg-red-50/40 hover:bg-red-50/70',
}

const BAR_HEATMAP = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.inactive
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.badge}`}>
      <Icon className="h-3 w-3" />
      {humanizeStatus(status)}
    </span>
  )
}

function GroupTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const config = GROUP_TYPE_CONFIG[type]
  if (!config) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-gray-50 text-gray-600 border-gray-200 capitalize">
        {type}
      </span>
    )
  }
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${config.badge}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  )
}

function CapacityBar({ group }: { group: Group }) {
  const level = capacityLevel(group)
  const left = slotsLeft(group)
  const pct = capacityPct(group)
  return (
    <div className="w-36">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">
          {group.active_member_count} / {group.max_members}
        </span>
        {left === 0 ? (
          <span className="text-[10px] font-bold text-red-600 uppercase">Full</span>
        ) : (
          <span className={`text-[10px] font-semibold ${level === 'amber' ? 'text-amber-600' : 'text-emerald-600'}`}>
            {left} slot{left === 1 ? '' : 's'} left
          </span>
        )}
      </div>
      <div
        className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${group.name} capacity ${pct}%`}
      >
        <div
          className={`h-full rounded-full transition-all ${BAR_HEATMAP[level]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function GroupList({
  groups, totalCount, page, pageSize, search, status, branch, type,
  sort, order, branches, stats, canManage, userRole
}: GroupListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [isNavPending, startNav] = useTransition()

  const [searchInput, setSearchInput] = useState(search)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map(c => c.key))
  )
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showSearchHistory, setShowSearchHistory] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [isOnline, setIsOnline] = useState(true)

  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const canExport = ['manager', 'supervisor', 'accountant_admin', 'loan_officer'].includes(userRole)

  // ---------------------------------------------------------------------------
  // Persistence: load UI prefs from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const vm = localStorage.getItem(STORAGE_KEYS.viewMode)
      if (vm === 'cards' || vm === 'table') setViewMode(vm)
      const cols = localStorage.getItem(STORAGE_KEYS.columns)
      if (cols) {
        const parsed = JSON.parse(cols) as string[]
        const next = new Set<ColumnKey>()
        parsed.forEach(c => {
          if (ALL_COLUMNS.some(ac => ac.key === c)) next.add(c as ColumnKey)
        })
        // Locked columns always visible
        next.add('group')
        next.add('actions')
        setVisibleColumns(next)
      }
      const rs = localStorage.getItem(STORAGE_KEYS.recentSearches)
      if (rs) setRecentSearches(JSON.parse(rs))
      const sf = localStorage.getItem(STORAGE_KEYS.savedFilters)
      if (sf) setSavedFilters(JSON.parse(sf))
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.viewMode, viewMode) } catch {}
  }, [viewMode])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(Array.from(visibleColumns))) } catch {}
  }, [visibleColumns])

  // ---------------------------------------------------------------------------
  // Offline indicator
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Sync local search input when the URL changes externally (back/forward)
  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Clear selection when the page of data changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [groups])

  // Close kebab menus & column picker on outside click
  useEffect(() => {
    if (!openMenuId && !showColumnPicker) return
    const handler = () => {
      setOpenMenuId(null)
      setShowColumnPicker(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId, showColumnPicker])

  // ---------------------------------------------------------------------------
  // URL state
  // ---------------------------------------------------------------------------
  const updateURL = useCallback((params: Record<string, string>) => {
    const current = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value === 'all' || value === '' || (value === '1' && key === 'page')) {
        current.delete(key)
      } else {
        current.set(key, value)
      }
    })
    if (
      params.search !== undefined || params.status !== undefined ||
      params.branch !== undefined || params.type !== undefined ||
      params.sort !== undefined || params.order !== undefined
    ) {
      current.delete('page')
    }
    // Remove legacy q param once search is used
    if (params.search !== undefined) current.delete('q')
    startNav(() => {
      router.push(`/groups?${current.toString()}`, { scroll: false })
    })
  }, [router, searchParams, startNav])

  const saveRecentSearch = useCallback((term: string) => {
    if (!term.trim()) return
    setRecentSearches(prev => {
      const next = [term, ...prev.filter(s => s !== term)].slice(0, 8)
      try { localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateURL({ search: value })
      if (value.trim()) saveRecentSearch(value.trim())
      setShowSearchHistory(false)
    }, 350)
  }, [updateURL, saveRecentSearch])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const handleSort = (column: string) => {
    const newOrder = sort === column && order === 'desc' ? 'asc' : 'desc'
    updateURL({ sort: column, order: newOrder })
  }

  const handleSortSelect = (value: string) => {
    const [col, dir] = value.split(':')
    updateURL({ sort: col, order: dir })
  }

  const handlePageChange = (newPage: number) => {
    updateURL({ page: String(newPage) })
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === groups.length && groups.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(groups.map(g => g.id)))
    }
  }

  // ---------------------------------------------------------------------------
  // Status updates via API
  // ---------------------------------------------------------------------------
  const changeStatus = async (id: string, newStatus: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/groups/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    const ids = Array.from(selectedIds)
    const results = await Promise.all(ids.map(id => changeStatus(id, newStatus)))
    const okCount = results.filter(r => r).length
    const failCount = results.length - okCount
    setBulkBusy(false)
    if (okCount > 0) {
      toast({
        title: 'Groups updated',
        description: `${okCount} group${okCount === 1 ? '' : 's'} marked ${humanizeStatus(newStatus).toLowerCase()}.`,
      })
      setSelectedIds(new Set())
      router.refresh()
    }
    if (failCount > 0) {
      toast({
        title: 'Some updates failed',
        description: `${failCount} group${failCount === 1 ? '' : 's'} could not be updated.`,
        variant: 'destructive',
      })
    }
  }

  const handleToggleStatus = async (group: Group) => {
    setOpenMenuId(null)
    const newStatus = group.status === 'active' ? 'inactive' : 'active'
    const ok = await changeStatus(group.id, newStatus)
    if (ok) {
      toast({ title: 'Status updated', description: `${group.name} is now ${humanizeStatus(newStatus).toLowerCase()}.` })
      router.refresh()
    } else {
      toast({ title: 'Update failed', description: `Could not change status for ${group.name}.`, variant: 'destructive' })
    }
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  const handleExportCSV = (rows?: Group[]) => {
    const data = rows && rows.length > 0 ? rows : groups
    if (data.length === 0) {
      toast({ title: 'Nothing to export', description: 'No groups match the current filters.', variant: 'destructive' })
      return
    }
    const headers = [
      'Group #', 'Name', 'Type', 'Status', 'Active Members', 'Max Members',
      'Capacity %', 'Branch', 'Area', 'Meeting Day', 'Leader', 'Formed', 'Created',
    ]
    const csvRows = data.map(g => [
      g.group_number, g.name, g.group_type || '', g.status,
      g.active_member_count, g.max_members, capacityPct(g),
      g.branch || '', g.area || '', g.meeting_day || '',
      g.leader_name || '',
      g.formed_at ? new Date(g.formed_at).toISOString().slice(0, 10) : '',
      new Date(g.created_at).toISOString().slice(0, 10),
    ])
    const csv = [headers.join(','), ...csvRows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `groups_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'CSV exported', description: `${data.length} group${data.length === 1 ? '' : 's'} downloaded.` })
  }

  // ---------------------------------------------------------------------------
  // Saved filters
  // ---------------------------------------------------------------------------
  const hasActiveFilter = status !== 'all' || branch !== 'all' || type !== 'all' || search !== ''

  const handleSaveFilter = () => {
    const name = prompt('Name this filter (e.g. "Forming Solidarity Accra"):')
    if (!name) return
    const params: Record<string, string> = {}
    if (search) params.search = search
    if (status !== 'all') params.status = status
    if (branch !== 'all') params.branch = branch
    if (type !== 'all') params.type = type
    const next = [...savedFilters.filter(f => f.name !== name), { name, params }]
    setSavedFilters(next)
    try { localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(next)) } catch {}
    toast({ title: 'Filter saved', description: `"${name}" is now available for quick access.` })
  }

  const handleApplyFilter = (params: Record<string, string>) => {
    const reset: Record<string, string> = { search: '', status: 'all', branch: 'all', type: 'all' }
    updateURL({ ...reset, ...params })
    setSearchInput(params.search || '')
    setShowMobileFilters(false)
  }

  const handleDeleteFilter = (name: string) => {
    const next = savedFilters.filter(f => f.name !== name)
    setSavedFilters(next)
    try { localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(next)) } catch {}
  }

  const handleResetFilters = () => {
    updateURL({ search: '', status: 'all', branch: 'all', type: 'all' })
    setSearchInput('')
    setShowMobileFilters(false)
  }

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------
  const toggleColumn = (key: ColumnKey) => {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.locked) return
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sort !== column) return <ChevronsUpDown className="h-3 w-3 text-gray-300 ml-1 inline" />
    return order === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-600 ml-1 inline" />
      : <ChevronDown className="h-3 w-3 text-blue-600 ml-1 inline" />
  }

  const pageNumbers = useMemo(() => {
    const nums: number[] = []
    const windowSize = Math.min(5, totalPages)
    for (let i = 0; i < windowSize; i++) {
      if (totalPages <= 5) nums.push(i + 1)
      else if (page <= 3) nums.push(i + 1)
      else if (page >= totalPages - 2) nums.push(totalPages - 4 + i)
      else nums.push(page - 2 + i)
    }
    return nums
  }, [page, totalPages])

  const startIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endIdx = Math.min(page * pageSize, totalCount)
  const rowPadding = 'py-3'
  const sortSelectValue = `${sort}:${order}`

  // ---------------------------------------------------------------------------
  // Filter selects (shared between desktop bar and mobile drawer)
  // ---------------------------------------------------------------------------
  const renderFilterSelects = (stacked: boolean) => (
    <div className={stacked ? 'space-y-3' : 'flex items-center gap-2 flex-wrap'}>
      <select
        value={status}
        onChange={(e) => updateURL({ status: e.target.value })}
        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Filter by status"
      >
        <option value="all">All Statuses</option>
        <option value="active">Active</option>
        <option value="forming">Forming</option>
        <option value="inactive">Inactive</option>
        <option value="suspended">Suspended</option>
        <option value="dissolved">Dissolved</option>
      </select>

      <select
        value={type}
        onChange={(e) => updateURL({ type: e.target.value })}
        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Filter by group type"
      >
        <option value="all">All Types</option>
        <option value="solidarity">Solidarity</option>
        <option value="individual">Individual</option>
        <option value="cooperative">Cooperative</option>
      </select>

      <select
        value={SORT_OPTIONS.some(o => o.value === sortSelectValue) ? sortSelectValue : 'created_at:desc'}
        onChange={(e) => handleSortSelect(e.target.value)}
        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Sort groups"
      >
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Kebab menu (shared between table rows and cards)
  // ---------------------------------------------------------------------------
  const renderKebab = (group: Group) => (
    <div className="relative no-print" onClick={e => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === group.id ? null : group.id) }}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={`Actions for ${group.name}`}
        aria-haspopup="menu"
        aria-expanded={openMenuId === group.id}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {openMenuId === group.id && (
        <div
          className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
          role="menu"
        >
          <Link
            href={`/groups/${group.id}`}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50"
            role="menuitem"
            onClick={() => setOpenMenuId(null)}
          >
            <Eye className="h-3.5 w-3.5 text-gray-400" /> View
          </Link>
          {canManage && (
            <Link
              href={`/groups/${group.id}`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50"
              role="menuitem"
              onClick={() => setOpenMenuId(null)}
            >
              <Pencil className="h-3.5 w-3.5 text-gray-400" /> Edit
            </Link>
          )}
          {canManage && (
            <Link
              href={`/groups/${group.id}?addMember=1`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50"
              role="menuitem"
              onClick={() => setOpenMenuId(null)}
            >
              <UserPlus className="h-3.5 w-3.5 text-gray-400" /> Add Member
            </Link>
          )}
          {canManage && group.status !== 'dissolved' && (
            <button
              onClick={() => handleToggleStatus(group)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-amber-50"
              role="menuitem"
            >
              {group.status === 'active' ? (
                <>
                  <Ban className="h-3.5 w-3.5 text-amber-500" /> Deactivate
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Activate
                </>
              )}
            </button>
          )}
          <button
            onClick={() => { setOpenMenuId(null); window.print() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            <Printer className="h-3.5 w-3.5 text-gray-400" /> Print
          </button>
        </div>
      )}
    </div>
  )

  // ---------------------------------------------------------------------------
  // Empty / no-results state
  // ---------------------------------------------------------------------------
  const renderEmptyState = (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="relative mb-4">
        <div className="p-5 bg-gradient-to-br from-blue-50 to-purple-50 rounded-full">
          <Users2 className="h-10 w-10 text-blue-300" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-1.5 bg-white rounded-full border border-gray-200 shadow-sm">
          <Search className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-700">No lending groups found</p>
      <p className="text-xs text-gray-400 mt-1 max-w-sm">
        {search
          ? `Nothing matches "${search}". Try a different name or group number.`
          : hasActiveFilter
            ? 'No groups match the current filters. Try widening your search.'
            : 'Get started by creating your first solidarity lending group.'}
      </p>
      <div className="flex items-center gap-2 mt-4 no-print">
        {hasActiveFilter && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleResetFilters}
          >
            <RefreshCw className="h-3 w-3" /> Clear filters
          </Button>
        )}
        {canManage && !search && (
          <Link href="/groups/new">
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 gap-1">
              <PlusCircle className="h-3.5 w-3.5" /> Create Group
            </Button>
          </Link>
        )}
      </div>
    </div>
  )

  // ---------------------------------------------------------------------------
  // Group card (card view + mobile table fallback)
  // ---------------------------------------------------------------------------
  const renderGroupCard = (group: Group) => {
    const level = capacityLevel(group)
    const left = slotsLeft(group)
    const pct = capacityPct(group)
    return (
      <Card
        key={group.id}
        className={`
          h-full hover:shadow-md transition-all cursor-pointer border-l-[3px]
          ${level === 'red' ? 'border-l-red-400' : level === 'amber' ? 'border-l-amber-400' : 'border-l-emerald-400'}
          ${selectedIds.has(group.id) ? 'ring-2 ring-blue-300' : ''}
        `}
        onClick={() => router.push(`/groups/${group.id}`)}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg ${getAvatarColor(group.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {getInitials(group.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate max-w-[150px]">{group.name}</p>
              <p className="text-[11px] font-mono font-bold text-blue-600">{group.group_number}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <StatusBadge status={group.status} />
                <GroupTypeBadge type={group.group_type} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 no-print" onClick={e => e.stopPropagation()}>
              {canManage && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(group.id)}
                  onChange={() => toggleSelect(group.id)}
                  className="rounded border-gray-300"
                  aria-label={`Select ${group.name}`}
                />
              )}
              {renderKebab(group)}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-gray-700">
                {group.active_member_count} / {group.max_members} members
              </span>
              {left === 0 ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-red-50 text-red-700 border-red-200 uppercase">
                  <AlertTriangle className="h-2.5 w-2.5" /> Full
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-gray-500">{left} slot{left === 1 ? '' : 's'} left</span>
              )}
            </div>
            <div
              className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${group.name} capacity ${pct}%`}
            >
              <div
                className={`h-full rounded-full transition-all ${BAR_HEATMAP[level]}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
            <div className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{group.area || '—'}</span>
            </div>
            <div className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="capitalize truncate">{group.meeting_day || '—'}</span>
            </div>
            <div className="flex items-center gap-1 truncate">
              <Crown className="h-3 w-3 text-amber-400 shrink-0" />
              <span className="truncate">{group.leader_name || 'No leader'}</span>
            </div>
            <div className="flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 text-gray-400 shrink-0" />
              <span title={formatDate(group.created_at)}>created {relativeTime(group.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100 no-print" onClick={e => e.stopPropagation()}>
            <Link href={`/groups/${group.id}`}>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" aria-label={`View ${group.name}`}>
                <Eye className="h-3 w-3 mr-1" /> View
              </Button>
            </Link>
            {canManage && (
              <Link href={`/groups/${group.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs px-2" aria-label={`Edit ${group.name}`}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ---------------------------------------------------------------------------
  // Loading skeleton rows (shown while navigating between pages/filters)
  // ---------------------------------------------------------------------------
  const renderLoadingRows = (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="p-3 border-b border-gray-100 flex items-center gap-4">
          <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-3 flex-1" />
          <div className="skeleton h-1.5 w-24 rounded-full" />
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  )

  const colCount = 1 + ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).length + (canManage ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800" role="status">
          <WifiOff className="h-4 w-4" />
          <span>You are offline. Changes will sync when connection is restored.</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Stat cards                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{stats.total_groups}</p>
              <p className="text-[11px] text-gray-500">Total Groups</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{stats.active_groups}</p>
              <p className="text-[11px] text-gray-500">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-sky-50 rounded-lg">
              <Sparkles className="h-4 w-4 text-sky-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{stats.forming_groups}</p>
              <p className="text-[11px] text-gray-500">Forming</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Users className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{stats.total_members}</p>
              <p className="text-[11px] text-gray-500">Total Members</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100 col-span-2 sm:col-span-1">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-cyan-50 rounded-lg">
              <Gauge className="h-4 w-4 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-gray-900">{stats.avg_capacity_pct}%</p>
              <p className="text-[11px] text-gray-500">Avg Capacity</p>
              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.min(stats.avg_capacity_pct, 100)}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Search, filters & actions bar                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between no-print">
        <div className="flex flex-1 gap-2 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={searchRef}
              placeholder="Search groups by name or GRP-#..."
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => recentSearches.length > 0 && setShowSearchHistory(true)}
              onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
              className="pl-9 pr-8 bg-white"
              aria-label="Search lending groups"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); updateURL({ search: '' }) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Recent searches dropdown */}
            {showSearchHistory && !searchInput && recentSearches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-auto">
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent Searches</p>
                {recentSearches.map((s, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setSearchInput(s)
                      updateURL({ search: s })
                      setShowSearchHistory(false)
                    }}
                  >
                    <History className="h-3 w-3 text-gray-400" />
                    {s}
                  </button>
                ))}
                <button
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-red-500"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setRecentSearches([])
                    try { localStorage.removeItem(STORAGE_KEYS.recentSearches) } catch {}
                  }}
                >
                  <Trash2 className="h-3 w-3 inline mr-1" /> Clear history
                </button>
              </div>
            )}
          </div>

          {/* Mobile filter drawer trigger */}
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 sm:hidden"
            onClick={() => setShowMobileFilters(true)}
            aria-label="Open filters"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilter && <span className="w-2 h-2 rounded-full bg-blue-500" />}
          </Button>
        </div>

        {/* Desktop filter selects */}
        <div className="hidden sm:block">
          {renderFilterSelects(false)}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              aria-label="Table view"
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 ${viewMode === 'cards' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              aria-label="Card view"
              title="Card view"
            >
              <Grid className="h-4 w-4" />
            </button>
          </div>

          {/* Column visibility toggle */}
          {viewMode === 'table' && (
            <div className="relative hidden sm:block">
              <button
                onClick={(e) => { e.stopPropagation(); setShowColumnPicker(!showColumnPicker) }}
                className={`p-2 border rounded-md transition-colors ${showColumnPicker ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                title="Toggle columns"
                aria-label="Toggle column visibility"
                aria-expanded={showColumnPicker}
              >
                <Columns3 className="h-4 w-4" />
              </button>
              {showColumnPicker && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2 w-48"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="px-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Columns</p>
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        disabled={col.locked}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className={col.locked ? 'text-gray-400' : 'text-gray-700'}>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save current filter */}
          {hasActiveFilter && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              onClick={handleSaveFilter}
              title="Save current filters"
              aria-label="Save current filters"
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Save</span>
            </Button>
          )}

          {/* CSV export */}
          {canExport && (
            <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => handleExportCSV()} title="Export current results to CSV">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">CSV</span>
            </Button>
          )}

          {/* Create group (managers only) */}
          {canManage && (
            <Link href="/groups/new">
              <Button className="h-10 bg-blue-600 hover:bg-blue-700 font-medium gap-1.5">
                <PlusCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Create Lending Group</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Saved filters chips */}
      {savedFilters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap no-print">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Saved:</span>
          {savedFilters.map(f => (
            <span key={f.name} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 hover:border-blue-300 group">
              <BookmarkCheck className="h-3 w-3 text-blue-500" />
              <button onClick={() => handleApplyFilter(f.params)} className="hover:text-blue-600">
                {f.name}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFilter(f.name) }}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Delete saved filter ${f.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && canManage && (
        <div className="flex items-center gap-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg animate-in slide-in-from-top-1 duration-150 no-print">
          <span className="text-sm font-medium text-blue-800">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={bulkBusy} onClick={() => handleBulkStatusUpdate('active')}>
              {bulkBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Mark Active
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={bulkBusy} onClick={() => handleBulkStatusUpdate('inactive')}>
              Mark Inactive
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={bulkBusy} onClick={() => handleBulkStatusUpdate('suspended')}>
              Suspend
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={bulkBusy} onClick={() => handleExportCSV(groups.filter(g => selectedIds.has(g.id)))}>
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Results count announcement */}
      <div className="text-xs text-gray-500 no-print" aria-live="polite">
        <span>
          Showing <strong>{startIdx}–{endIdx}</strong> of <strong>{totalCount}</strong> groups
          {search && <span className="ml-1 text-blue-600">matching &ldquo;{search}&rdquo;</span>}
          {isNavPending && (
            <span className="ml-2 inline-flex items-center gap-1 text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" /> updating…
            </span>
          )}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* List (dimmed while navigating; skeleton rows if data is loading)    */}
      {/* ------------------------------------------------------------------ */}
      <div className={isNavPending ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {isNavPending && groups.length === 0 ? (
          renderLoadingRows
        ) : viewMode === 'table' ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50/80">
                    <TableRow>
                      {canManage && (
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === groups.length && groups.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300"
                            aria-label="Select all groups"
                          />
                        </TableHead>
                      )}
                      {visibleColumns.has('group') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('name')}
                          scope="col"
                        >
                          Group <SortIcon column="name" />
                        </TableHead>
                      )}
                      {visibleColumns.has('type') && <TableHead scope="col">Type</TableHead>}
                      {visibleColumns.has('capacity') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('max_members')}
                          scope="col"
                        >
                          Capacity <SortIcon column="max_members" />
                        </TableHead>
                      )}
                      {visibleColumns.has('status') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('status')}
                          scope="col"
                        >
                          Status <SortIcon column="status" />
                        </TableHead>
                      )}
                      {visibleColumns.has('branch') && <TableHead scope="col">Area</TableHead>}
                      {visibleColumns.has('meeting') && <TableHead className="hidden lg:table-cell" scope="col">Meeting Day</TableHead>}
                      {visibleColumns.has('leader') && <TableHead className="hidden xl:table-cell" scope="col">Leader</TableHead>}
                      {visibleColumns.has('formed') && (
                        <TableHead
                          className="hidden xl:table-cell cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('formed_at')}
                          scope="col"
                        >
                          Formed <SortIcon column="formed_at" />
                        </TableHead>
                      )}
                      {visibleColumns.has('created') && (
                        <TableHead
                          className="hidden lg:table-cell cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('created_at')}
                          scope="col"
                        >
                          Created <SortIcon column="created_at" />
                        </TableHead>
                      )}
                      {visibleColumns.has('actions') && <TableHead className="text-right w-28 no-print" scope="col">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={colCount} className="p-0">
                          {renderEmptyState}
                        </TableCell>
                      </TableRow>
                    ) : (
                      groups.map((group) => {
                        const level = capacityLevel(group)
                        const isLeader = group.leader_name
                        return (
                          <TableRow
                            key={group.id}
                            className={`
                              ${rowPadding} cursor-pointer transition-colors border-l-[3px]
                              ${level === 'red' ? 'border-l-red-400' : level === 'amber' ? 'border-l-amber-400' : 'border-l-emerald-400'}
                              ${ROW_HEATMAP[level]}
                              ${selectedIds.has(group.id) ? '!bg-blue-50/70' : ''}
                            `}
                            onClick={() => router.push(`/groups/${group.id}`)}
                          >
                            {canManage && (
                              <TableCell onClick={e => e.stopPropagation()} className="no-print">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(group.id)}
                                  onChange={() => toggleSelect(group.id)}
                                  className="rounded border-gray-300"
                                  aria-label={`Select ${group.name}`}
                                />
                              </TableCell>
                            )}
                            {visibleColumns.has('group') && (
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-lg ${getAvatarColor(group.name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                                    {getInitials(group.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm truncate max-w-[220px]">{group.name}</p>
                                    <p className="font-mono text-[11px] font-bold text-blue-600">{group.group_number}</p>
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.has('type') && (
                              <TableCell>
                                <GroupTypeBadge type={group.group_type} />
                              </TableCell>
                            )}
                            {visibleColumns.has('capacity') && (
                              <TableCell>
                                <CapacityBar group={group} />
                              </TableCell>
                            )}
                            {visibleColumns.has('status') && (
                              <TableCell>
                                <StatusBadge status={group.status} />
                              </TableCell>
                            )}
                            {visibleColumns.has('branch') && (
                              <TableCell className="text-xs text-gray-600">
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                                  <span className="truncate max-w-[120px]">{group.area || '—'}</span>
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.has('meeting') && (
                              <TableCell className="hidden lg:table-cell text-xs text-gray-600">
                                {group.meeting_day ? (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-gray-400" />
                                    <span className="capitalize">{group.meeting_day}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.has('leader') && (
                              <TableCell className="hidden xl:table-cell">
                                {isLeader ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-6 h-6 rounded-full ${getAvatarColor(group.leader_name!)} flex items-center justify-center text-white text-[8px] font-bold`}>
                                      {getInitials(group.leader_name!)}
                                    </div>
                                    <span className="text-xs text-gray-700 truncate max-w-[120px]">{group.leader_name}</span>
                                    <Crown className="h-3 w-3 text-amber-400 shrink-0" />
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.has('formed') && (
                              <TableCell className="hidden xl:table-cell text-xs text-gray-500 whitespace-nowrap">
                                {group.formed_at ? (
                                  <span title={formatDate(group.formed_at)}>{relativeTime(group.formed_at)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.has('created') && (
                              <TableCell className="hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">
                                <span title={formatDate(group.created_at)}>created {relativeTime(group.created_at)}</span>
                              </TableCell>
                            )}
                            {visibleColumns.has('actions') && (
                              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <Link href={`/groups/${group.id}`}>
                                    <Button variant="outline" size="sm" className="h-7 text-xs px-2 no-print" aria-label={`View ${group.name}`}>
                                      <Eye className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                  </Link>
                                  {canManage && (
                                    <Link href={`/groups/${group.id}`} className="hidden lg:block">
                                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 no-print" aria-label={`Edit ${group.name}`} title="Edit">
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </Link>
                                  )}
                                  {renderKebab(group)}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile fallback when table view is selected: show cards on small screens */}
            <div className="md:hidden space-y-3">
              {groups.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200">{renderEmptyState}</div>
              ) : (
                groups.map(group => renderGroupCard(group))
              )}
            </div>
          </>
        ) : (
          /* ---------------------------------------------------------------- */
          /* CARD VIEW                                                         */
          /* ---------------------------------------------------------------- */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.length === 0 ? (
              <div className="col-span-full bg-white rounded-xl border border-gray-200">
                {renderEmptyState}
              </div>
            ) : (
              groups.map(group => renderGroupCard(group))
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                          */}
      {/* ------------------------------------------------------------------ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 no-print">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages} ({totalCount} total)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0 hidden sm:flex"
              disabled={page <= 1} onClick={() => handlePageChange(1)} aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={page <= 1} onClick={() => handlePageChange(page - 1)} aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers.map(pageNum => (
              <Button
                key={pageNum}
                variant={pageNum === page ? 'default' : 'outline'}
                size="sm"
                className={`h-8 w-8 p-0 text-xs ${pageNum === page ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => handlePageChange(pageNum)}
                aria-label={`Page ${pageNum}`}
                aria-current={pageNum === page ? 'page' : undefined}
              >
                {pageNum}
              </Button>
            ))}
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0"
              disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 w-8 p-0 hidden sm:flex"
              disabled={page >= totalPages} onClick={() => handlePageChange(totalPages)} aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mobile filter drawer                                                */}
      {/* ------------------------------------------------------------------ */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Filter groups">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileFilters(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white p-4 space-y-4 shadow-xl overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <ArrowUpDown className="h-4 w-4 text-blue-600" />
                Filters & Sort
              </h2>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderFilterSelects(true)}

            {savedFilters.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Saved Filters</p>
                {savedFilters.map(f => (
                  <div key={f.name} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                    <BookmarkCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <button onClick={() => handleApplyFilter(f.params)} className="flex-1 text-left text-xs text-gray-700 hover:text-blue-600 truncate">
                      {f.name}
                    </button>
                    <button
                      onClick={() => handleDeleteFilter(f.name)}
                      className="text-gray-300 hover:text-red-500"
                      aria-label={`Delete saved filter ${f.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={handleResetFilters}>
                <RefreshCw className="h-3 w-3 mr-1" /> Reset All
              </Button>
              <Button size="sm" className="flex-1 h-9 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => setShowMobileFilters(false)}>
                Show results
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      {canManage && (
        <Link href="/groups/new" className="fab sm:hidden no-print" aria-label="Create new lending group">
          <PlusCircle className="h-6 w-6 text-white" />
        </Link>
      )}
    </div>
  )
}
