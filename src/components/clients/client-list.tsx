'use client'

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate, clientStatusBadgeClass } from '@/lib/utils'
import {
  Search, UserPlus, Eye, Phone, MapPin, Briefcase, ChevronUp, ChevronDown,
  ChevronsUpDown, ChevronLeft, ChevronRight, Download, Upload, X,
  MessageSquare, ExternalLink, Layers, Grid, List, ShieldAlert, Clock,
  AlertTriangle, CheckCircle2, Copy, MoreHorizontal, Star, Crown,
  ArrowUpRight, ArrowDownRight, Filter, RefreshCw, Users, Zap,
  EyeOff, Eye as EyeIcon, Volume2, Calendar, TrendingUp, BarChart3,
  Columns3, Bookmark, BookmarkCheck, Printer, WifiOff, Wifi, Save,
  FileText, History, ChevronsLeft, ChevronsRight, Settings2, Trash2,
  Users2, CircleDot, ArrowRight
} from 'lucide-react'

interface GroupMembership {
  group_id: string
  groups: { id: string; name: string; group_number: string } | null
}

interface LoanRef {
  id: string
  status: string
}

interface Client {
  id: string
  account_number: string
  full_name: string
  phone_number: string
  national_id: string
  business_type: string
  market_location: string
  daily_business_income: number
  monthly_income: number | null
  status: 'active' | 'inactive' | 'defaulted'
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | null
  is_watchlisted: boolean
  is_dormant: boolean
  date_registered: string
  created_at: string
  last_activity_at: string | null
  profile_completeness: number
  branch: string | null
  area: string | null
  photo_url: string | null
  group_members?: GroupMembership[]
  loans?: LoanRef[]
}

interface ClientListProps {
  clients: Client[]
  totalCount: number
  page: number
  pageSize: number
  query: string
  status: string
  branch: string
  tier: string
  sort: string
  order: string
  dateFrom: string
  dateTo: string
  branches: string[]
  statusCounts: { all: number; active: number; inactive: number; defaulted: number }
  userRole: string
  registrationTrend: { date: string; count: number }[]
  branchBreakdown: { branch: string; count: number }[]
}

type ViewMode = 'table' | 'cards'
type Density = 'compact' | 'comfortable'

const TIER_CONFIG = {
  bronze: { icon: ShieldAlert, color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Bronze' },
  silver: { icon: Star, color: 'text-slate-600 bg-slate-50 border-slate-200', label: 'Silver' },
  gold: { icon: Crown, color: 'text-yellow-700 bg-yellow-50 border-yellow-200', label: 'Gold' },
  platinum: { icon: Zap, color: 'text-purple-700 bg-purple-50 border-purple-200', label: 'Platinum' },
}

const ALL_COLUMNS = [
  { key: 'account_number', label: 'Account #' },
  { key: 'client', label: 'Client' },
  { key: 'phone_id', label: 'Phone / ID' },
  { key: 'business', label: 'Business & Location' },
  { key: 'income', label: 'Daily Income' },
  { key: 'status', label: 'Status' },
  { key: 'tier', label: 'Tier' },
  { key: 'risk', label: 'Risk Score' },
  { key: 'registered', label: 'Registered' },
  { key: 'last_activity', label: 'Last Activity' },
  { key: 'groups', label: 'Groups' },
  { key: 'actions', label: 'Actions' },
] as const

type ColumnKey = typeof ALL_COLUMNS[number]['key']

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
  if (!dateStr) return 'Never'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} wk ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mo ago`
  return `${Math.floor(diffDays / 365)} yr ago`
}

function maskPII(value: string, type: 'phone' | 'id'): string {
  if (type === 'phone') return value.slice(0, 3) + '***' + value.slice(-3)
  if (type === 'id') return value.slice(0, 4) + '****' + value.slice(-2)
  return value
}

function computeRiskScore(client: Client): { score: number; label: string; color: string } {
  let score = 0
  if (client.status === 'defaulted') score += 40
  else if (client.status === 'inactive') score += 20
  if (client.is_watchlisted) score += 25
  if (client.is_dormant) score += 15
  if (client.profile_completeness < 50) score += 10
  if (client.daily_business_income < 50) score += 10
  const activeLoans = (client.loans || []).filter(l => l.status === 'active').length
  if (activeLoans > 2) score += 15
  else if (activeLoans > 1) score += 5
  if (client.tier === 'platinum' || client.tier === 'gold') score -= 15
  else if (client.tier === 'silver') score -= 5
  score = Math.max(0, Math.min(100, score))
  if (score <= 20) return { score, label: 'Low', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (score <= 50) return { score, label: 'Medium', color: 'bg-amber-100 text-amber-800 border-amber-200' }
  return { score, label: 'High', color: 'bg-red-100 text-red-800 border-red-200' }
}

function getIncomeColor(income: number): string {
  if (income >= 500) return 'text-emerald-700'
  if (income >= 200) return 'text-blue-700'
  if (income >= 100) return 'text-amber-700'
  return 'text-red-700'
}

function Sparkline({ data, width = 120, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="inline-block" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-500"
      />
    </svg>
  )
}

const STORAGE_KEYS = {
  columns: 'bs_client_cols',
  savedFilters: 'bs_saved_filters',
  recentSearches: 'bs_recent_searches',
  density: 'bs_density',
  viewMode: 'bs_view_mode',
  zebra: 'bs_zebra',
}

export function ClientList({
  clients, totalCount, page, pageSize, query, status, branch, tier,
  sort, order, dateFrom, dateTo, branches, statusCounts, userRole,
  registrationTrend, branchBreakdown
}: ClientListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchInput, setSearchInput] = useState(query)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [density, setDensity] = useState<Density>('comfortable')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [maskedPII, setMaskedPII] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [focusedRow, setFocusedRow] = useState(-1)
  const [zebraStripes, setZebraStripes] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(ALL_COLUMNS.map(c => c.key))
  )
  const [isOnline, setIsOnline] = useState(true)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showSearchHistory, setShowSearchHistory] = useState(false)
  const [savedFilters, setSavedFilters] = useState<{ name: string; params: Record<string, string> }[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [localDateFrom, setLocalDateFrom] = useState(dateFrom)
  const [localDateTo, setLocalDateTo] = useState(dateTo)
  const [swipedCard, setSwipedCard] = useState<string | null>(null)

  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.ceil(totalCount / pageSize)

  const canRegister = ['manager', 'supervisor', 'accountant_admin', 'loan_officer'].includes(userRole)
  const canBulkEdit = ['manager', 'supervisor', 'accountant_admin'].includes(userRole)
  const canExport = ['manager', 'supervisor', 'accountant_admin', 'loan_officer'].includes(userRole)

  useEffect(() => {
    try {
      const cols = localStorage.getItem(STORAGE_KEYS.columns)
      if (cols) setVisibleColumns(new Set(JSON.parse(cols)))
      const d = localStorage.getItem(STORAGE_KEYS.density)
      if (d) setDensity(d as Density)
      const vm = localStorage.getItem(STORAGE_KEYS.viewMode)
      if (vm) setViewMode(vm as ViewMode)
      const z = localStorage.getItem(STORAGE_KEYS.zebra)
      if (z) setZebraStripes(z === 'true')
      const sf = localStorage.getItem(STORAGE_KEYS.savedFilters)
      if (sf) setSavedFilters(JSON.parse(sf))
      const rs = localStorage.getItem(STORAGE_KEYS.recentSearches)
      if (rs) setRecentSearches(JSON.parse(rs))
    } catch {}
  }, [])

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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(Array.from(visibleColumns))) } catch {}
  }, [visibleColumns])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.density, density) } catch {}
  }, [density])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.viewMode, viewMode) } catch {}
  }, [viewMode])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.zebra, String(zebraStripes)) } catch {}
  }, [zebraStripes])

  const updateURL = useCallback((params: Record<string, string>) => {
    const current = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value === 'all' || value === '' || (value === '1' && key === 'page')) {
        current.delete(key)
      } else {
        current.set(key, value)
      }
    })
    if (params.q !== undefined || params.status !== undefined || params.branch !== undefined || params.tier !== undefined || params.from !== undefined || params.to !== undefined) {
      current.delete('page')
    }
    router.push(`/clients?${current.toString()}`, { scroll: false })
  }, [router, searchParams])

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
      updateURL({ q: value })
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

  const handlePageChange = (newPage: number) => {
    updateURL({ page: String(newPage) })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)))
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleColumn = (key: ColumnKey) => {
    if (key === 'actions' || key === 'client') return
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExportCSV = () => {
    const headers = ['Account #', 'Name', 'Phone', 'National ID', 'Business', 'Market', 'Daily Income', 'Status', 'Tier', 'Branch', 'Registered', 'Risk Score']
    const rows = clients.map(c => {
      const risk = computeRiskScore(c)
      return [
        c.account_number, c.full_name, c.phone_number, c.national_id,
        c.business_type, c.market_location, c.daily_business_income,
        c.status, c.tier || 'bronze', c.branch || '', c.date_registered, `${risk.score} (${risk.label})`
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = () => {
    window.print()
  }

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const res = await fetch('/api/clients/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: newStatus }),
    })
    if (res.ok) {
      setSelectedIds(new Set())
      router.refresh()
    }
  }

  const handleSaveFilter = () => {
    const name = prompt('Name this filter (e.g. "Active Gold Accra"):')
    if (!name) return
    const params: Record<string, string> = {}
    if (status !== 'all') params.status = status
    if (branch !== 'all') params.branch = branch
    if (tier !== 'all') params.tier = tier
    if (dateFrom) params.from = dateFrom
    if (dateTo) params.to = dateTo
    if (query) params.q = query
    const next = [...savedFilters.filter(f => f.name !== name), { name, params }]
    setSavedFilters(next)
    try { localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(next)) } catch {}
  }

  const handleApplyFilter = (params: Record<string, string>) => {
    const reset: Record<string, string> = { status: 'all', branch: 'all', tier: 'all', from: '', to: '', q: '' }
    updateURL({ ...reset, ...params })
    if (params.q) setSearchInput(params.q)
    if (params.from) setLocalDateFrom(params.from)
    if (params.to) setLocalDateTo(params.to)
  }

  const handleDeleteFilter = (name: string) => {
    const next = savedFilters.filter(f => f.name !== name)
    setSavedFilters(next)
    try { localStorage.setItem(STORAGE_KEYS.savedFilters, JSON.stringify(next)) } catch {}
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedRow(prev => Math.min(prev + 1, clients.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedRow(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && focusedRow >= 0) {
      router.push(`/clients/${clients[focusedRow].id}`)
    } else if (e.key === 'Escape') {
      setExpandedRow(null)
      setSelectedIds(new Set())
      setShowColumnPicker(false)
      setShowSearchHistory(false)
    } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sort !== column) return <ChevronsUpDown className="h-3 w-3 text-gray-300 ml-1 inline" />
    return order === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-600 ml-1 inline" />
      : <ChevronDown className="h-3 w-3 text-blue-600 ml-1 inline" />
  }

  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-3'

  const trendData = useMemo(() => registrationTrend.map(t => t.count), [registrationTrend])
  const trendTotal = useMemo(() => trendData.reduce((a, b) => a + b, 0), [trendData])

  const topEarners = useMemo(() => {
    return [...clients].sort((a, b) => b.daily_business_income - a.daily_business_income).slice(0, 5)
  }, [clients])

  const hasActiveFilter = status !== 'all' || branch !== 'all' || tier !== 'all' || dateFrom || dateTo

  const colSpan = 2 + ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).length

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown} tabIndex={-1} ref={tableRef}>
      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <WifiOff className="h-4 w-4" />
          <span>You are offline. Changes will sync when connection is restored.</span>
        </div>
      )}

      {/* Analytics Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{statusCounts.all}</p>
              <p className="text-[11px] text-gray-500">Total Clients</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{statusCounts.active}</p>
              <p className="text-[11px] text-gray-500">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Clock className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{statusCounts.inactive}</p>
              <p className="text-[11px] text-gray-500">Inactive</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-100">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 bg-rose-50 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{statusCounts.defaulted}</p>
              <p className="text-[11px] text-gray-500">Defaulted</p>
            </div>
          </CardContent>
        </Card>
        {/* 30-day registration trend sparkline */}
        <Card className="border-gray-100 hidden sm:block">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-gray-500">30-Day Reg.</p>
              <span className="text-xs font-bold text-blue-700">+{trendTotal}</span>
            </div>
            <Sparkline data={trendData} width={100} height={24} />
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Search, Filters & Actions Bar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex flex-1 gap-2 max-w-xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    ref={searchRef}
                    placeholder="Search name, A/C #, phone, market... ( / )"
                    value={searchInput}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => recentSearches.length > 0 && setShowSearchHistory(true)}
                    onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                    className="pl-9 pr-8 bg-white"
                    aria-label="Search clients"
                  />
                  {searchInput && (
                    <button
                      onClick={() => { setSearchInput(''); updateURL({ q: '' }) }}
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
                            updateURL({ q: s })
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filters</span>
                  {hasActiveFilter && (
                    <span className="ml-0.5 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View mode toggle */}
                <div className="hidden sm:flex items-center border border-gray-200 rounded-md overflow-hidden">
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
                      onClick={() => setShowColumnPicker(!showColumnPicker)}
                      className={`p-2 border rounded-md transition-colors ${showColumnPicker ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                      title="Toggle columns"
                      aria-label="Toggle column visibility"
                    >
                      <Columns3 className="h-4 w-4" />
                    </button>
                    {showColumnPicker && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2 w-48">
                        <p className="px-3 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Columns</p>
                        {ALL_COLUMNS.map(col => (
                          <label key={col.key} className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(col.key)}
                              onChange={() => toggleColumn(col.key as ColumnKey)}
                              disabled={col.key === 'actions' || col.key === 'client'}
                              className="rounded border-gray-300 text-blue-600"
                            />
                            <span className={col.key === 'actions' || col.key === 'client' ? 'text-gray-400' : 'text-gray-700'}>
                              {col.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Density toggle */}
                <button
                  onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
                  className="hidden sm:flex p-2 border border-gray-200 rounded-md text-gray-400 hover:text-gray-600"
                  title={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} density`}
                  aria-label="Toggle density"
                >
                  <Layers className="h-4 w-4" />
                </button>

                {/* Zebra stripes toggle */}
                {viewMode === 'table' && (
                  <button
                    onClick={() => setZebraStripes(!zebraStripes)}
                    className={`hidden sm:flex p-2 border rounded-md transition-colors ${zebraStripes ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                    title="Toggle zebra striping"
                    aria-label="Toggle zebra stripes"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                )}

                {/* PII mask toggle */}
                <button
                  onClick={() => setMaskedPII(!maskedPII)}
                  className="p-2 border border-gray-200 rounded-md text-gray-400 hover:text-gray-600"
                  title={maskedPII ? 'Show sensitive data' : 'Hide sensitive data'}
                  aria-label="Toggle PII visibility"
                >
                  {maskedPII ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>

                {/* Export CSV */}
                {canExport && (
                  <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleExportCSV} title="Export current page to CSV">
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">CSV</span>
                  </Button>
                )}

                {/* Export PDF (print) */}
                {canExport && (
                  <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleExportPDF} title="Print / Save as PDF">
                    <Printer className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">PDF</span>
                  </Button>
                )}

                {/* Sidebar toggle */}
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className={`hidden lg:flex p-2 border rounded-md transition-colors ${showSidebar ? 'border-blue-300 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                  title="Toggle analytics sidebar"
                  aria-label="Toggle sidebar"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>

                {/* Register */}
                {canRegister && (
                  <Link href="/clients/new">
                    <Button className="h-10 bg-blue-600 hover:bg-blue-700 font-medium gap-1.5">
                      <UserPlus className="h-4 w-4" />
                      <span className="hidden sm:inline">Register Client</span>
                      <span className="sm:hidden">New</span>
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Expandable filters */}
            {showFilters && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3 animate-in slide-in-from-top-2 duration-200">
                <div className="flex flex-wrap gap-3">
                  <select
                    value={status}
                    onChange={(e) => updateURL({ status: e.target.value })}
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                    aria-label="Filter by status"
                  >
                    <option value="all">All Statuses ({statusCounts.all})</option>
                    <option value="active">Active ({statusCounts.active})</option>
                    <option value="inactive">Inactive ({statusCounts.inactive})</option>
                    <option value="defaulted">Defaulted ({statusCounts.defaulted})</option>
                  </select>

                  <select
                    value={branch}
                    onChange={(e) => updateURL({ branch: e.target.value })}
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                    aria-label="Filter by branch"
                  >
                    <option value="all">All Branches</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>

                  <select
                    value={tier}
                    onChange={(e) => updateURL({ tier: e.target.value })}
                    className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                    aria-label="Filter by tier"
                  >
                    <option value="all">All Tiers</option>
                    <option value="bronze">Bronze</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                  </select>

                  {/* Date range filter */}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="date"
                      value={localDateFrom}
                      onChange={(e) => {
                        setLocalDateFrom(e.target.value)
                        updateURL({ from: e.target.value })
                      }}
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
                      aria-label="Registered from date"
                    />
                    <span className="text-gray-400 text-xs">to</span>
                    <input
                      type="date"
                      value={localDateTo}
                      onChange={(e) => {
                        setLocalDateTo(e.target.value)
                        updateURL({ to: e.target.value })
                      }}
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
                      aria-label="Registered to date"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-gray-500"
                    onClick={() => {
                      updateURL({ status: 'all', branch: 'all', tier: 'all', q: '', from: '', to: '' })
                      setSearchInput('')
                      setLocalDateFrom('')
                      setLocalDateTo('')
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Reset All
                  </Button>

                  {/* Save current filter */}
                  {hasActiveFilter && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600" onClick={handleSaveFilter}>
                      <Bookmark className="h-3 w-3 mr-1" />
                      Save Filter
                    </Button>
                  )}

                  {/* Saved filters chips */}
                  {savedFilters.length > 0 && (
                    <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                      {savedFilters.map(f => (
                        <span key={f.name} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-md text-[11px] text-gray-700 hover:border-blue-300 cursor-pointer group">
                          <BookmarkCheck className="h-3 w-3 text-blue-500" />
                          <button onClick={() => handleApplyFilter(f.params)}>{f.name}</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFilter(f.name) }}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && canBulkEdit && (
              <div className="flex items-center gap-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg animate-in slide-in-from-top-1 duration-150">
                <span className="text-sm font-medium text-blue-800">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkStatusUpdate('active')}>
                    Mark Active
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkStatusUpdate('inactive')}>
                    Mark Inactive
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Results count announcement */}
          <div className="text-xs text-gray-500 flex items-center justify-between no-print" aria-live="polite">
            <span>
              Showing {clients.length} of {totalCount} clients
              {query && <span className="ml-1 text-blue-600">matching &ldquo;{query}&rdquo;</span>}
            </span>
            <span className="hidden sm:inline text-[11px] text-gray-400">
              / search &bull; ↑↓ navigate &bull; Enter open &bull; Esc clear
            </span>
          </div>

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm print-full-width">
              <div className="overflow-x-auto">
                <Table className={zebraStripes ? 'zebra-stripes' : ''}>
                  <TableHeader className="bg-gray-50/80 sticky top-0 z-10">
                    <TableRow>
                      {canBulkEdit && (
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === clients.length && clients.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300"
                            aria-label="Select all clients"
                          />
                        </TableHead>
                      )}
                      <TableHead className="w-10"></TableHead>
                      {visibleColumns.has('account_number') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('account_number')}
                        >
                          Account # <SortIcon column="account_number" />
                        </TableHead>
                      )}
                      {visibleColumns.has('client') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('full_name')}
                        >
                          Client <SortIcon column="full_name" />
                        </TableHead>
                      )}
                      {visibleColumns.has('phone_id') && <TableHead>Phone / ID</TableHead>}
                      {visibleColumns.has('business') && <TableHead>Business & Location</TableHead>}
                      {visibleColumns.has('income') && (
                        <TableHead
                          className="text-right cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('daily_business_income')}
                        >
                          Daily Income <SortIcon column="daily_business_income" />
                        </TableHead>
                      )}
                      {visibleColumns.has('status') && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('status')}
                        >
                          Status <SortIcon column="status" />
                        </TableHead>
                      )}
                      {visibleColumns.has('tier') && <TableHead className="hidden lg:table-cell">Tier</TableHead>}
                      {visibleColumns.has('risk') && <TableHead className="hidden lg:table-cell">Risk</TableHead>}
                      {visibleColumns.has('registered') && (
                        <TableHead
                          className="hidden md:table-cell cursor-pointer select-none hover:bg-gray-100"
                          onClick={() => handleSort('date_registered')}
                        >
                          Registered <SortIcon column="date_registered" />
                        </TableHead>
                      )}
                      {visibleColumns.has('last_activity') && <TableHead className="hidden xl:table-cell">Last Activity</TableHead>}
                      {visibleColumns.has('groups') && <TableHead className="hidden xl:table-cell">Groups</TableHead>}
                      {visibleColumns.has('actions') && <TableHead className="text-right w-24">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colSpan} className="h-48 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-gray-50 rounded-full">
                              <Users className="h-8 w-8 text-gray-300" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">No clients found</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {query ? `No results for "${query}". Try a different search.` : 'Get started by registering your first client.'}
                              </p>
                            </div>
                            {!query && canRegister && (
                              <Link href="/clients/new">
                                <Button size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700">
                                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                  Register Client
                                </Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      clients.map((client, idx) => {
                        const tierConfig = TIER_CONFIG[client.tier || 'bronze']
                        const TierIcon = tierConfig.icon
                        const isFocused = idx === focusedRow
                        const isExpanded = expandedRow === client.id
                        const isDefaulted = client.status === 'defaulted'
                        const isWatchlisted = client.is_watchlisted
                        const risk = computeRiskScore(client)
                        const hasActiveLoan = (client.loans || []).some(l => l.status === 'active')
                        const groupNames = (client.group_members || [])
                          .map(gm => gm.groups?.name)
                          .filter(Boolean) as string[]

                        return (
                          <React.Fragment key={client.id}>
                            <TableRow
                              className={`
                                ${rowPadding} transition-colors cursor-pointer
                                ${isFocused ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50/80'}
                                ${isDefaulted ? 'border-l-[3px] border-l-red-400 bg-red-50/30' : ''}
                                ${isWatchlisted && !isDefaulted ? 'border-l-[3px] border-l-amber-400' : ''}
                                ${selectedIds.has(client.id) ? 'bg-blue-50/60' : ''}
                              `}
                              onClick={() => setExpandedRow(isExpanded ? null : client.id)}
                            >
                              {canBulkEdit && (
                                <TableCell onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(client.id)}
                                    onChange={() => toggleSelect(client.id)}
                                    className="rounded border-gray-300"
                                    aria-label={`Select ${client.full_name}`}
                                  />
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="relative">
                                  <div className={`w-8 h-8 rounded-full ${getAvatarColor(client.full_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                                    {getInitials(client.full_name)}
                                  </div>
                                  {hasActiveLoan && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" title="Has active loan" />
                                  )}
                                </div>
                              </TableCell>
                              {visibleColumns.has('account_number') && (
                                <TableCell className="font-mono text-xs font-bold text-blue-700">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(client.account_number, client.id) }}
                                    className="flex items-center gap-1 hover:text-blue-900 group"
                                    title="Copy account number"
                                  >
                                    {client.account_number}
                                    {copiedId === client.id ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                  </button>
                                </TableCell>
                              )}
                              {visibleColumns.has('client') && (
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <p className="font-semibold text-gray-900 text-sm">{client.full_name}</p>
                                      <p className="text-[11px] text-gray-400">{client.branch || '—'} • {client.area || '—'}</p>
                                    </div>
                                    {isWatchlisted && (
                                      <span title="Watchlisted"><ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" /></span>
                                    )}
                                    {client.is_dormant && (
                                      <span title="Dormant (90+ days inactive)"><Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" /></span>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              {visibleColumns.has('phone_id') && (
                                <TableCell className="text-xs text-gray-600">
                                  <div className="flex items-center gap-1 font-mono">
                                    <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                                    {maskedPII ? maskPII(client.phone_number, 'phone') : client.phone_number}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">
                                    ID: {maskedPII ? maskPII(client.national_id, 'id') : client.national_id}
                                  </div>
                                </TableCell>
                              )}
                              {visibleColumns.has('business') && (
                                <TableCell className="text-xs text-gray-700">
                                  <div className="flex items-center gap-1">
                                    <Briefcase className="h-3 w-3 text-gray-400 shrink-0" />
                                    <span className="truncate max-w-[120px]">{client.business_type}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                                    <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                                    <span className="truncate max-w-[120px]">{client.market_location}</span>
                                  </div>
                                </TableCell>
                              )}
                              {visibleColumns.has('income') && (
                                <TableCell className="text-right font-medium text-xs">
                                  <span className={getIncomeColor(client.daily_business_income)}>
                                    {formatCurrency(client.daily_business_income)}
                                  </span>
                                  <span className="block text-[10px] text-gray-400">
                                    ~{formatCurrency(client.daily_business_income * 7)}/wk
                                  </span>
                                </TableCell>
                              )}
                              {visibleColumns.has('status') && (
                                <TableCell>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${clientStatusBadgeClass(client.status)}`}>
                                    {client.status}
                                  </span>
                                </TableCell>
                              )}
                              {visibleColumns.has('tier') && (
                                <TableCell className="hidden lg:table-cell">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tierConfig.color}`}>
                                    <TierIcon className="h-3 w-3" />
                                    {tierConfig.label}
                                  </span>
                                </TableCell>
                              )}
                              {visibleColumns.has('risk') && (
                                <TableCell className="hidden lg:table-cell">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${risk.color}`}>
                                    {risk.label} ({risk.score})
                                  </span>
                                </TableCell>
                              )}
                              {visibleColumns.has('registered') && (
                                <TableCell className="hidden md:table-cell text-xs text-gray-500 whitespace-nowrap">
                                  {formatDate(client.date_registered)}
                                </TableCell>
                              )}
                              {visibleColumns.has('last_activity') && (
                                <TableCell className="hidden xl:table-cell text-xs text-gray-400 whitespace-nowrap">
                                  {relativeTime(client.last_activity_at)}
                                </TableCell>
                              )}
                              {visibleColumns.has('groups') && (
                                <TableCell className="hidden xl:table-cell">
                                  {groupNames.length > 0 ? (
                                    <div className="flex items-center gap-1">
                                      <Users2 className="h-3 w-3 text-purple-400 shrink-0" />
                                      <span className="text-[11px] text-purple-700 truncate max-w-[80px]">{groupNames[0]}</span>
                                      {groupNames.length > 1 && (
                                        <span className="text-[10px] text-gray-400">+{groupNames.length - 1}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-gray-300">—</span>
                                  )}
                                </TableCell>
                              )}
                              {visibleColumns.has('actions') && (
                                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1">
                                    <a
                                      href={`tel:${client.phone_number}`}
                                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                      title="Call client"
                                      aria-label={`Call ${client.full_name}`}
                                    >
                                      <Phone className="h-3.5 w-3.5" />
                                    </a>
                                    <a
                                      href={`https://wa.me/${client.phone_number.replace(/^0/, '233')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                      title="WhatsApp"
                                      aria-label={`WhatsApp ${client.full_name}`}
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                    </a>
                                    <Link href={`/clients/${client.id}`}>
                                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" aria-label={`View ${client.full_name}`}>
                                        <Eye className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                    </Link>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>

                            {/* Expanded row detail */}
                            {isExpanded && (
                              <TableRow key={`${client.id}-expanded`} className="bg-gray-50/50">
                                <TableCell colSpan={colSpan} className="p-0">
                                  <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs border-t border-gray-100">
                                    <div className="space-y-2">
                                      <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Profile</p>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Completeness</span>
                                        <div className="flex items-center gap-2">
                                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full ${client.profile_completeness >= 80 ? 'bg-emerald-500' : client.profile_completeness >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                              style={{ width: `${client.profile_completeness}%` }}
                                            />
                                          </div>
                                          <span className="font-medium text-gray-700">{client.profile_completeness}%</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Monthly Income</span>
                                        <span className="font-medium text-gray-700">{formatCurrency(client.monthly_income || client.daily_business_income * 26)}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Risk Score</span>
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${risk.color}`}>
                                          {risk.label} ({risk.score}/100)
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Registered</span>
                                        <span className="font-medium text-gray-700">{formatDate(client.date_registered)}</span>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Quick Actions</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {canRegister && !client.is_watchlisted && (
                                          <Link href={`/loans/new?clientId=${client.id}`}>
                                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                                              <TrendingUp className="h-3 w-3" /> New Loan
                                            </Button>
                                          </Link>
                                        )}
                                        <Link href={`/repayments?clientId=${client.id}`}>
                                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                                            <BarChart3 className="h-3 w-3" /> Repay
                                          </Button>
                                        </Link>
                                        <Link href={`/sms?clientId=${client.id}`}>
                                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                                            <MessageSquare className="h-3 w-3" /> SMS
                                          </Button>
                                        </Link>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Loans & Groups</p>
                                      <div className="text-gray-600">
                                        <p>Active loans: <strong>{(client.loans || []).filter(l => l.status === 'active').length}</strong></p>
                                        <p>Total loans: <strong>{(client.loans || []).length}</strong></p>
                                        {groupNames.length > 0 && (
                                          <p className="text-purple-700 mt-1">Groups: {groupNames.join(', ')}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Location</p>
                                      <a
                                        href={`https://www.google.com/maps/search/${encodeURIComponent(client.market_location + ' Ghana')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        <MapPin className="h-3 w-3" />
                                        Open in Google Maps
                                        <ExternalLink className="h-2.5 w-2.5" />
                                      </a>
                                      <p className="text-gray-500 mt-1">{client.market_location}</p>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* CARD VIEW (mobile-optimized) */}
          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {clients.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 bg-gray-50 rounded-full mb-3">
                    <Users className="h-8 w-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">No clients found</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters.</p>
                </div>
              ) : (
                clients.map((client) => {
                  const tierConfig = TIER_CONFIG[client.tier || 'bronze']
                  const TierIcon = tierConfig.icon
                  const risk = computeRiskScore(client)
                  const hasActiveLoan = (client.loans || []).some(l => l.status === 'active')
                  const groupNames = (client.group_members || [])
                    .map(gm => gm.groups?.name)
                    .filter(Boolean) as string[]
                  const isSwiped = swipedCard === client.id
                  return (
                    <div
                      key={client.id}
                      className="relative overflow-hidden rounded-xl"
                      onTouchStart={(e) => {
                        const startX = e.touches[0].clientX
                        const handleMove = (ev: TouchEvent) => {
                          const diff = ev.touches[0].clientX - startX
                          if (diff < -50) {
                            setSwipedCard(client.id)
                            document.removeEventListener('touchmove', handleMove)
                          }
                        }
                        document.addEventListener('touchmove', handleMove, { once: true })
                      }}
                      onClick={() => { if (isSwiped) setSwipedCard(null) }}
                    >
                      {/* Swipe actions (revealed on left-swipe) */}
                      <div className={`absolute right-0 top-0 bottom-0 flex items-center gap-1 bg-gray-100 px-2 transition-all ${isSwiped ? 'w-auto opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                        <a href={`tel:${client.phone_number}`} className="p-2 text-blue-600" title="Call"><Phone className="h-4 w-4" /></a>
                        <a href={`https://wa.me/${client.phone_number.replace(/^0/, '233')}`} target="_blank" rel="noopener noreferrer" className="p-2 text-emerald-600" title="WhatsApp"><MessageSquare className="h-4 w-4" /></a>
                        <Link href={`/clients/${client.id}`} className="p-2 text-gray-600" title="View"><Eye className="h-4 w-4" /></Link>
                      </div>

                      <Link href={`/clients/${client.id}`} className="block">
                        <Card className={`h-full hover:shadow-md transition-all cursor-pointer ${client.status === 'defaulted' ? 'border-red-200 bg-red-50/20' : ''} ${client.is_watchlisted ? 'border-amber-200' : ''} ${isSwiped ? '-translate-x-24' : 'translate-x-0'} transition-transform`}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="relative">
                                <div className={`w-10 h-10 rounded-full ${getAvatarColor(client.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                  {getInitials(client.full_name)}
                                </div>
                                {hasActiveLoan && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-semibold text-gray-900 text-sm truncate">{client.full_name}</p>
                                  {client.is_watchlisted && <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                </div>
                                <p className="text-[11px] font-mono text-blue-600 font-bold">{client.account_number}</p>
                                {groupNames.length > 0 && (
                                  <p className="text-[10px] text-purple-600 flex items-center gap-0.5 mt-0.5">
                                    <Users2 className="h-2.5 w-2.5" /> {groupNames[0]}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tierConfig.color}`}>
                                  <TierIcon className="h-2.5 w-2.5" />
                                </span>
                                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${risk.color}`}>
                                  {risk.label}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="flex items-center gap-1 text-gray-600">
                                <Phone className="h-3 w-3 text-gray-400" />
                                {maskedPII ? maskPII(client.phone_number, 'phone') : client.phone_number}
                              </div>
                              <div className="flex items-center gap-1 text-gray-600">
                                <Briefcase className="h-3 w-3 text-gray-400" />
                                <span className="truncate">{client.business_type}</span>
                              </div>
                              <div className="flex items-center gap-1 text-gray-600">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                <span className="truncate">{client.market_location}</span>
                              </div>
                              <div className="flex items-center gap-1 text-gray-600">
                                <Clock className="h-3 w-3 text-gray-400" />
                                {relativeTime(client.last_activity_at)}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${clientStatusBadgeClass(client.status)}`}>
                                {client.status}
                              </span>
                              <span className={`text-xs font-semibold ${getIncomeColor(client.daily_business_income)}`}>
                                {formatCurrency(client.daily_business_income)}/day
                              </span>
                            </div>

                            {/* Profile completeness bar */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${client.profile_completeness >= 80 ? 'bg-emerald-400' : client.profile_completeness >= 50 ? 'bg-amber-400' : 'bg-red-300'}`}
                                  style={{ width: `${client.profile_completeness}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400">{client.profile_completeness}%</span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 no-print">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} ({totalCount} total)
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 hidden sm:flex"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(1)}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
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
                  )
                })}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 hidden sm:flex"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(totalPages)}
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Analytics Sidebar (desktop only) */}
        {showSidebar && (
          <aside className="hidden lg:block w-72 shrink-0 space-y-4 no-print">
            {/* Branch Breakdown */}
            <Card className="border-gray-100">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                  Branch Breakdown
                </h3>
                {branchBreakdown.slice(0, 8).map(b => {
                  const pct = statusCounts.all > 0 ? Math.round((b.count / statusCounts.all) * 100) : 0
                  return (
                    <div key={b.branch}>
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className="text-gray-600 truncate">{b.branch}</span>
                        <span className="font-medium text-gray-800">{b.count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Top Earners (current page) */}
            <Card className="border-gray-100">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  Top Earners (this page)
                </h3>
                <div className="space-y-2">
                  {topEarners.map((c, i) => (
                    <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-2 group">
                      <span className="text-[10px] font-bold text-gray-400 w-4">#{i + 1}</span>
                      <div className={`w-6 h-6 rounded-full ${getAvatarColor(c.full_name)} flex items-center justify-center text-white text-[8px] font-bold`}>
                        {getInitials(c.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-800 truncate group-hover:text-blue-600">{c.full_name}</p>
                        <p className="text-[10px] text-gray-400">{c.business_type}</p>
                      </div>
                      <span className={`text-[11px] font-bold ${getIncomeColor(c.daily_business_income)}`}>
                        {formatCurrency(c.daily_business_income)}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick links */}
            <Card className="border-gray-100">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quick Links</h3>
                <Link href="/reports/clients" className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 py-1">
                  <FileText className="h-3.5 w-3.5" /> Client Reports
                  <ArrowRight className="h-3 w-3 ml-auto text-gray-300" />
                </Link>
                <Link href="/loans?status=active" className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 py-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Active Loans
                  <ArrowRight className="h-3 w-3 ml-auto text-gray-300" />
                </Link>
                <Link href="/groups" className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 py-1">
                  <Users2 className="h-3.5 w-3.5" /> Group Lending
                  <ArrowRight className="h-3 w-3 ml-auto text-gray-300" />
                </Link>
              </CardContent>
            </Card>
          </aside>
        )}
      </div>

      {/* Mobile FAB */}
      {canRegister && (
        <Link href="/clients/new" className="fab sm:hidden" aria-label="Register new client">
          <UserPlus className="h-6 w-6 text-white" />
        </Link>
      )}
    </div>
  )
}
