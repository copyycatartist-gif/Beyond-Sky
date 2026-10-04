'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { cn, formatCurrency, formatDate, toInputDate, installmentStatusBadgeClass } from '@/lib/utils'
import {
  FileSpreadsheet,
  Printer,
  CreditCard,
  CheckCircle2,
  Calendar,
  DollarSign,
  AlertCircle,
  Loader2,
  Lock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  RotateCcw,
  PenLine,
  Wifi,
  WifiOff,
  BarChart3,
  Search,
  X,
  CornerDownRight,
  Eraser,
  TrendingUp,
  Users,
  Clock,
} from 'lucide-react'

export interface GroupMemberLoanSchedule {
  sn: number
  clientId: string
  clientName: string
  accountNumber: string
  phoneNumber: string
  businessType?: string
  marketLocation?: string
  loanId?: string
  loanNumber?: string
  principal: number
  totalRepayable: number
  weeklyInstallment: number
  outstandingBalance: number
  cumulativePaid: number
  loanStatus?: string
  installments: Array<{
    week: number
    dueDate?: string
    expectedAmount: number
    paidAmount: number
    balance: number
    status: 'paid' | 'partially_paid' | 'overdue' | 'upcoming' | 'unassigned'
  }>
}

interface GroupCollectionMatrixProps {
  groupId: string
  groupName: string
  groupNumber: string
  meetingDay?: string
  meetingPlace?: string
  branch?: string
  area?: string
  memberSchedules: GroupMemberLoanSchedule[]
  /** Weeks that have been signed off and locked against further collection */
  lockedWeeks?: number[]
  /** Name of the officer collecting, used on receipts and signature blocks */
  officerName?: string
  /** Penalty rate per week overdue, as a percentage. Defaults to 2% */
  penaltyRatePercent?: number
}

interface PendingCollection {
  id: string
  queuedAt: string
  weekNumber: number
  payload: {
    repayments: Array<{ loanId: string; amount: number; method: 'cash' | 'momo'; momoReference?: string }>
    transactionDate: string
    defaultMethod: 'cash' | 'momo'
    groupId: string
    groupName: string
    weekNumber: number
  }
}

interface ReceiptData {
  week: number
  date: string
  method: 'cash' | 'momo'
  momoRef?: string
  entries: Array<{ clientName: string; accountNumber: string; amount: number; penalty: number }>
  total: number
  signature?: string
}

type InstallmentStatus = GroupMemberLoanSchedule['installments'][number]['status']

const TOTAL_WEEKS = 13
const PENDING_KEY_PREFIX = 'beyondsky_pending_collections_'

function storageKey(groupId: string) {
  return `${PENDING_KEY_PREFIX}${groupId}`
}

function readPending(groupId: string): PendingCollection[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(groupId))
    return raw ? (JSON.parse(raw) as PendingCollection[]) : []
  } catch {
    return []
  }
}

function writePending(groupId: string, items: PendingCollection[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(groupId), JSON.stringify(items))
  } catch {
    // storage full or unavailable — nothing else we can do
  }
}

function weeksOverdue(dueDate?: string): number {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  if (isNaN(due.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 0
  return Math.max(1, Math.floor(diffDays / 7))
}

/** Exact days past due (0 when not overdue) — used for the "Nd late" aging badge */
function daysLate(dueDate?: string): number {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  if (isNaN(due.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

function overdueShadeClass(weeks: number, paidSomething: boolean): string {
  if (paidSomething) return 'bg-rose-100 text-rose-900 font-semibold'
  if (weeks >= 5) return 'bg-rose-600 text-white font-bold'
  if (weeks >= 3) return 'bg-rose-300 text-rose-950 font-bold'
  return 'bg-rose-100 text-rose-800 font-semibold'
}

function statusCellBase(status: InstallmentStatus | undefined): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-900 font-bold'
    case 'partially_paid':
      return 'bg-amber-100 text-amber-900 font-semibold'
    case 'upcoming':
      return 'bg-gray-50 text-gray-400'
    case 'unassigned':
      return 'bg-gray-50 text-gray-300'
    default:
      return 'text-gray-400'
  }
}

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function GroupCollectionMatrix({
  groupId,
  groupName,
  groupNumber,
  meetingDay = 'Weekly',
  meetingPlace = 'Market Center',
  branch = 'Branch Operations',
  area = 'Market Territory',
  memberSchedules,
  lockedWeeks = [],
  officerName = 'Field Officer',
  penaltyRatePercent = 2,
}: GroupCollectionMatrixProps) {
  const router = useRouter()
  const { toast } = useToast()

  // ---------------------------------------------------------------
  // Local (optimistic) copy of the schedules
  // ---------------------------------------------------------------
  const [schedules, setSchedules] = useState<GroupMemberLoanSchedule[]>(memberSchedules)
  useEffect(() => {
    setSchedules(memberSchedules)
  }, [memberSchedules])

  // ---------------------------------------------------------------
  // Batch collection modal state
  // ---------------------------------------------------------------
  const [collectWeekModalOpen, setCollectWeekModalOpen] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [collectionDate, setCollectionDate] = useState(toInputDate(new Date()))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'momo'>('cash')
  const [momoRef, setMomoRef] = useState('')
  const [submittingBatch, setSubmittingBatch] = useState(false)
  const [memberAmounts, setMemberAmounts] = useState<Record<string, number>>({})
  const [modalSearch, setModalSearch] = useState('')
  const [modalFilterLoanIds, setModalFilterLoanIds] = useState<string[] | null>(null)
  const [includePenalty, setIncludePenalty] = useState(true)
  const [penaltyRate, setPenaltyRate] = useState(penaltyRatePercent)

  // ---------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [showVariance, setShowVariance] = useState(false)
  const [focusedWeek, setFocusedWeek] = useState<number>(1)
  const [focusedMemberIdx, setFocusedMemberIdx] = useState<number>(-1)
  const [printTitleWeek, setPrintTitleWeek] = useState<number>(0) // 0 = full 13-week sheet
  const [flashedCells, setFlashedCells] = useState<Record<string, boolean>>({})
  const [methodLog, setMethodLog] = useState<Record<string, Record<number, { method: string; date: string }>>>({})

  const tableWrapRef = useRef<HTMLDivElement>(null)
  const weekHeaderRefs = useRef<Record<number, HTMLTableCellElement | null>>({})

  // ---------------------------------------------------------------
  // Signature capture state
  // ---------------------------------------------------------------
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [signatureData, setSignatureData] = useState<string>('')
  const [lastSignature, setLastSignature] = useState<string>('')
  const [hasInk, setHasInk] = useState(false)
  const sigCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  // ---------------------------------------------------------------
  // Receipt state
  // ---------------------------------------------------------------
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  // ---------------------------------------------------------------
  // Offline mode state
  // ---------------------------------------------------------------
  const [isOnline, setIsOnline] = useState(true)
  const [pending, setPending] = useState<PendingCollection[]>([])
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // ---------------------------------------------------------------
  // Derived: penalties, totals, current week
  // ---------------------------------------------------------------
  const memberPenalty = useCallback(
    (m: GroupMemberLoanSchedule): number => {
      if (penaltyRate <= 0) return 0
      let penalty = 0
      for (const inst of m.installments) {
        const wOver = inst.status === 'overdue' ? Math.max(1, weeksOverdue(inst.dueDate)) : 0
        if (wOver <= 0) continue
        const unpaid = Math.max(0, inst.expectedAmount - inst.paidAmount)
        penalty += unpaid * (penaltyRate / 100) * wOver
      }
      return Math.round(penalty * 100) / 100
    },
    [penaltyRate]
  )

  const totalPrincipal = schedules.reduce((acc, m) => acc + (m.principal || 0), 0)
  const totalLoanRepayable = schedules.reduce((acc, m) => acc + (m.totalRepayable || 0), 0)
  const totalCumulativePaid = schedules.reduce((acc, m) => acc + (m.cumulativePaid || 0), 0)
  const totalOutstanding = schedules.reduce((acc, m) => acc + (m.outstandingBalance || 0), 0)
  const totalPenalties = schedules.reduce((acc, m) => acc + memberPenalty(m), 0)
  const completionPct = totalLoanRepayable > 0 ? Math.min(100, (totalCumulativePaid / totalLoanRepayable) * 100) : 0
  const fullyPaidCount = schedules.filter(
    (m) => (m.totalRepayable || 0) > 0 && (m.outstandingBalance || 0) <= 0
  ).length
  const overdueMemberCount = schedules.filter((m) => m.installments.some((i) => i.status === 'overdue')).length

  const weeklyTotals = useMemo(() => {
    return Array.from({ length: TOTAL_WEEKS }, (_, idx) => {
      const weekNum = idx + 1
      return schedules.reduce((acc, m) => {
        const inst = m.installments.find((i) => i.week === weekNum)
        return acc + (inst ? inst.paidAmount : 0)
      }, 0)
    })
  }, [schedules])

  const weeklyExpected = useMemo(() => {
    return Array.from({ length: TOTAL_WEEKS }, (_, idx) => {
      const weekNum = idx + 1
      return schedules.reduce((acc, m) => {
        const inst = m.installments.find((i) => i.week === weekNum)
        return acc + (inst ? inst.expectedAmount : 0)
      }, 0)
    })
  }, [schedules])

  const computeCurrentWeek = useCallback((): number => {
    // First week whose due date is today or in the future
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      const inst = schedules.flatMap((m) => m.installments).find((i) => i.week === w && i.dueDate)
      if (inst?.dueDate) {
        const due = new Date(inst.dueDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (!isNaN(due.getTime()) && due >= today) return w
      }
    }
    // Otherwise first week with an unpaid installment
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      const hasUnpaid = schedules.some((m) => {
        const inst = m.installments.find((i) => i.week === w)
        return inst && inst.paidAmount < inst.expectedAmount && inst.status !== 'unassigned'
      })
      if (hasUnpaid) return w
    }
    return 1
  }, [schedules])

  // Members with zero payment in overdue weeks (for retry collection)
  const zeroPaymentOverdue = useMemo(() => {
    const byWeek: Record<number, string[]> = {}
    schedules.forEach((m) => {
      if (!m.loanId) return
      m.installments.forEach((inst) => {
        if (inst.status === 'overdue' && inst.paidAmount <= 0 && !lockedWeeks.includes(inst.week)) {
          byWeek[inst.week] = [...(byWeek[inst.week] || []), m.loanId!]
        }
      })
    })
    return byWeek
  }, [schedules, lockedWeeks])

  const earliestRetryWeek = Object.keys(zeroPaymentOverdue)
    .map(Number)
    .sort((a, b) => a - b)[0]

  const zeroPaymentMemberCount = earliestRetryWeek ? (zeroPaymentOverdue[earliestRetryWeek] || []).length : 0

  // Focused week summary (floating sidebar)
  const focusExpected = weeklyExpected[focusedWeek - 1] || 0
  const focusCollected = weeklyTotals[focusedWeek - 1] || 0
  const focusShortfall = Math.max(0, focusExpected - focusCollected)

  // ---------------------------------------------------------------
  // Offline detection + auto-sync
  // ---------------------------------------------------------------
  const flushPending = useCallback(
    async (items: PendingCollection[]) => {
      if (items.length === 0 || syncingRef.current) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      syncingRef.current = true
      setSyncing(true)
      const stillPending: PendingCollection[] = []
      let synced = 0
      for (const item of items) {
        try {
          const res = await fetch('/api/repayments/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          })
          if (res.ok) {
            synced++
          } else {
            stillPending.push(item)
          }
        } catch {
          stillPending.push(item)
        }
      }
      setPending(stillPending)
      writePending(groupId, stillPending)
      syncingRef.current = false
      setSyncing(false)
      if (synced > 0) {
        toast({
          title: 'Offline collections synced',
          description: `${synced} queued collection${synced === 1 ? '' : 's'} posted to the server.`,
          variant: 'success',
        })
        router.refresh()
      }
    },
    [groupId, router, toast]
  )

  useEffect(() => {
    const updateOnline = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    updateOnline()
    setPending(readPending(groupId))
    const handleOnline = () => {
      setIsOnline(true)
      const items = readPending(groupId)
      setPending(items)
      flushPending(items)
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Try flushing anything left in the queue on mount when online
  useEffect(() => {
    if (isOnline && pending.length > 0 && !syncingRef.current) {
      flushPending(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline])

  // ---------------------------------------------------------------
  // Week navigation + keyboard shortcuts
  // ---------------------------------------------------------------
  const scrollToWeek = useCallback((week: number) => {
    const el = weekHeaderRefs.current[week]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [])

  const moveFocus = useCallback(
    (delta: number) => {
      setFocusedWeek((prev) => {
        const next = Math.min(TOTAL_WEEKS, Math.max(1, prev + delta))
        scrollToWeek(next)
        return next
      })
    },
    [scrollToWeek]
  )

  const jumpToCurrentWeek = useCallback(() => {
    const w = computeCurrentWeek()
    setFocusedWeek(w)
    scrollToWeek(w)
  }, [computeCurrentWeek, scrollToWeek])

  useEffect(() => {
    setFocusedWeek(computeCurrentWeek())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openWeekCollectionRef = useRef<(week: number) => void>(() => {})
  const openMemberCollectionRef = useRef<(loanId: string, week: number) => void>(() => {})
  const schedulesLenRef = useRef(schedules.length)
  schedulesLenRef.current = schedules.length

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (collectWeekModalOpen || signatureOpen || receiptOpen || showVariance) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveFocus(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveFocus(1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (schedulesLenRef.current === 0) return
        e.preventDefault()
        setFocusedMemberIdx((prev) => {
          if (e.key === 'ArrowUp') return prev <= 0 ? -1 : prev - 1
          return prev + 1 >= schedulesLenRef.current ? 0 : prev + 1
        })
      } else if (e.key === 'Escape') {
        setFocusedMemberIdx(-1)
      } else if (e.key === 'Enter') {
        if (!lockedWeeks.includes(focusedWeek)) {
          e.preventDefault()
          const member = focusedMemberIdx >= 0 ? schedules[focusedMemberIdx] : undefined
          if (member?.loanId) {
            openMemberCollectionRef.current(member.loanId, focusedWeek)
          } else {
            openWeekCollectionRef.current(focusedWeek)
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [collectWeekModalOpen, signatureOpen, receiptOpen, showVariance, focusedWeek, focusedMemberIdx, schedules, lockedWeeks, moveFocus])

  // ---------------------------------------------------------------
  // Optimistic local update after a successful (or queued) collection
  // ---------------------------------------------------------------
  const applyLocalUpdate = useCallback(
    (
      entries: Array<{ loanId: string; amount: number }>,
      week: number,
      method: 'cash' | 'momo',
      date: string
    ) => {
      const flashKeys: Record<string, boolean> = {}
      setSchedules((prev) =>
        prev.map((m) => {
          if (!m.loanId) return m
          const entry = entries.find((e) => e.loanId === m.loanId)
          if (!entry || entry.amount <= 0) return m
          flashKeys[`${m.clientId}-${week}`] = true
          let applied = 0
          const installments = m.installments.map((inst) => {
            if (inst.week !== week) return inst
            const newPaid = Math.min(inst.expectedAmount, inst.paidAmount + entry.amount)
            applied = newPaid - inst.paidAmount
            const newBalance = Math.max(0, inst.expectedAmount - newPaid)
            let newStatus: InstallmentStatus = inst.status
            if (newPaid >= inst.expectedAmount) newStatus = 'paid'
            else if (newPaid > 0) newStatus = 'partially_paid'
            return { ...inst, paidAmount: newPaid, balance: newBalance, status: newStatus }
          })
          return {
            ...m,
            installments,
            cumulativePaid: (m.cumulativePaid || 0) + applied,
            outstandingBalance: Math.max(0, (m.outstandingBalance || 0) - applied),
          }
        })
      )
      setMethodLog((prev) => {
        const next = { ...prev }
        entries.forEach((e) => {
          if (e.amount <= 0) return
          const member = schedules.find((m) => m.loanId === e.loanId)
          if (!member) return
          next[member.clientId] = { ...(next[member.clientId] || {}), [week]: { method, date } }
        })
        return next
      })
      setFlashedCells((prev) => ({ ...prev, ...flashKeys }))
      window.setTimeout(() => {
        setFlashedCells((prev) => {
          const next = { ...prev }
          Object.keys(flashKeys).forEach((k) => delete next[k])
          return next
        })
      }, 1400)
    },
    [schedules]
  )

  // ---------------------------------------------------------------
  // Opening the batch collection modal
  // ---------------------------------------------------------------
  const openWeekCollection = useCallback(
    (weekNum: number, filterLoanIds?: string[] | null) => {
      if (lockedWeeks.includes(weekNum)) {
        toast({
          title: 'Week locked',
          description: `Week ${weekNum} has been signed off and cannot be collected against.`,
          variant: 'destructive',
        })
        return
      }
      setSelectedWeek(weekNum)
      setModalSearch('')
      setModalFilterLoanIds(filterLoanIds ?? null)
      const initialAmounts: Record<string, number> = {}
      schedules.forEach((m) => {
        if (!m.loanId) return
        if (filterLoanIds && !filterLoanIds.includes(m.loanId)) return
        const inst = m.installments.find((i) => i.week === weekNum)
        const remaining = inst ? Math.max(0, inst.expectedAmount - inst.paidAmount) : m.weeklyInstallment
        const penalty = includePenalty ? memberPenalty(m) : 0
        const capped = Math.min(remaining + penalty, Math.max(0, m.outstandingBalance))
        initialAmounts[m.loanId] = Math.round(capped * 100) / 100
      })
      setMemberAmounts(initialAmounts)
      setCollectWeekModalOpen(true)
    },
    [lockedWeeks, schedules, includePenalty, memberPenalty, toast]
  )

  openWeekCollectionRef.current = openWeekCollection

  const handleAmountChange = (loanId: string, val: string) => {
    const num = parseFloat(val)
    setMemberAmounts((prev) => ({
      ...prev,
      [loanId]: isNaN(num) || num < 0 ? 0 : Math.round(num * 100) / 100,
    }))
  }

  const modalMembers = schedules.filter((m) => {
    if (!m.loanId) return false
    if (modalFilterLoanIds && !modalFilterLoanIds.includes(m.loanId)) return false
    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase()
      return (
        m.clientName.toLowerCase().includes(q) ||
        m.accountNumber.toLowerCase().includes(q) ||
        (m.loanNumber || '').toLowerCase().includes(q) ||
        m.phoneNumber.toLowerCase().includes(q)
      )
    }
    return true
  })

  const totalBatchCollecting = Object.values(memberAmounts).reduce((acc, curr) => acc + (curr || 0), 0)

  const amountValidation = (m: GroupMemberLoanSchedule): string | null => {
    const amt = memberAmounts[m.loanId!] ?? 0
    if (amt < 0) return 'Amount cannot be negative'
    const cap = Math.max(0, m.outstandingBalance) + (includePenalty ? memberPenalty(m) : 0)
    if (amt > cap + 0.001) return `Cannot exceed outstanding${includePenalty ? ' + penalty' : ''} (${formatCurrency(cap)})`
    return null
  }

  const hasValidationError = modalMembers.some((m) => amountValidation(m) !== null)

  // ---------------------------------------------------------------
  // Batch submit (online + offline queueing)
  // ---------------------------------------------------------------
  const finishCollection = (
    entries: Array<{ loanId: string; amount: number }>,
    totalAmount: number
  ) => {
    applyLocalUpdate(entries, selectedWeek, paymentMethod, collectionDate)

    const receiptEntries = entries
      .filter((e) => e.amount > 0)
      .map((e) => {
        const member = schedules.find((m) => m.loanId === e.loanId)
        const penalty = includePenalty && member ? memberPenalty(member) : 0
        return {
          clientName: member?.clientName || 'Member',
          accountNumber: member?.accountNumber || '',
          amount: e.amount,
          penalty,
        }
      })

    setReceipt({
      week: selectedWeek,
      date: collectionDate,
      method: paymentMethod,
      momoRef: paymentMethod === 'momo' ? momoRef : undefined,
      entries: receiptEntries,
      total: totalAmount,
      signature: lastSignature || undefined,
    })

    setCollectWeekModalOpen(false)
    setSignatureOpen(true)
    setHasInk(false)
    setSignatureData('')
  }

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const entries = Object.entries(memberAmounts)
      .filter(([, amt]) => amt > 0)
      .map(([loanId, amt]) => ({ loanId, amount: Math.round(amt * 100) / 100 }))

    if (entries.length === 0) {
      toast({
        title: 'No amounts entered',
        description: 'Please enter collection amounts for at least one member',
        variant: 'destructive',
      })
      return
    }

    if (hasValidationError) {
      toast({
        title: 'Invalid amounts',
        description: 'One or more amounts exceed the outstanding balance or are negative.',
        variant: 'destructive',
      })
      return
    }

    const payload = {
      repayments: entries.map((entry) => ({
        loanId: entry.loanId,
        amount: entry.amount,
        method: paymentMethod,
        momoReference: paymentMethod === 'momo' ? momoRef : undefined,
      })),
      transactionDate: collectionDate,
      defaultMethod: paymentMethod,
      groupId,
      groupName,
      weekNumber: selectedWeek,
    }

    const totalAmount = entries.reduce((acc, entry) => acc + entry.amount, 0)

    // Offline: queue locally, update UI optimistically, sync later
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const item: PendingCollection = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        queuedAt: new Date().toISOString(),
        weekNumber: selectedWeek,
        payload,
      }
      const nextPending = [...readPending(groupId), item]
      writePending(groupId, nextPending)
      setPending(nextPending)
      toast({
        title: 'Saved offline',
        description: `Week ${selectedWeek} collection of ${formatCurrency(totalAmount)} queued. It will sync automatically when you reconnect.`,
      })
      finishCollection(entries, totalAmount)
      return
    }

    setSubmittingBatch(true)
    try {
      const res = await fetch('/api/repayments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record batch collection')

      toast({
        title: 'Collection Recorded!',
        description: `Successfully posted ${formatCurrency(data.summary?.totalAmount ?? totalAmount)} across ${data.summary?.successCount ?? entries.length} members for Week ${selectedWeek}.`,
        variant: 'success',
      })

      finishCollection(entries, totalAmount)
      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Batch Error',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSubmittingBatch(false)
    }
  }

  // ---------------------------------------------------------------
  // Signature pad
  // ---------------------------------------------------------------
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const sigStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const { x, y } = getCanvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = '#1e3a8a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const sigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = sigCanvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCanvasPoint(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  const sigEnd = () => {
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = sigCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    setHasInk(false)
    setSignatureData('')
  }

  const saveSignature = () => {
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    setSignatureData(dataUrl)
    setLastSignature(dataUrl)
    setSignatureOpen(false)
    setReceiptOpen(true)
    toast({
      title: 'Signature captured',
      description: 'The signed collection sheet will include your signature.',
      variant: 'success',
    })
  }

  const skipSignature = () => {
    setSignatureOpen(false)
    setReceiptOpen(true)
  }

  // ---------------------------------------------------------------
  // Receipt printing (dedicated print window)
  // ---------------------------------------------------------------
  const printReceipt = () => {
    if (!receipt) return
    const win = window.open('', '_blank', 'width=440,height=700')
    if (!win) {
      toast({
        title: 'Popup blocked',
        description: 'Allow popups for this site to print the receipt.',
        variant: 'destructive',
      })
      return
    }
    const rows = receipt.entries
      .map(
        (en) =>
          `<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd;">${en.clientName}<br/><span style="color:#666;font-size:10px;">${en.accountNumber}</span></td><td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;font-family:monospace;">${en.amount.toFixed(2)}${en.penalty > 0 ? `<br/><span style="color:#b91c1c;font-size:10px;">incl. penalty ${en.penalty.toFixed(2)}</span>` : ''}</td></tr>`
      )
      .join('')
    const sigImg = receipt.signature
      ? `<img src="${receipt.signature}" style="max-height:80px;max-width:220px;border-bottom:1px solid #000;" alt="Officer signature" />`
      : '<div style="border-bottom:1px solid #000;height:50px;width:220px;"></div>'
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt - ${groupName} WK${receipt.week}</title></head>
<body style="font-family:Arial,sans-serif;padding:20px;max-width:400px;margin:0 auto;">
  <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">
    <h2 style="margin:0;font-size:15px;text-transform:uppercase;">Beyond Sky Micro-Credit Enterprise</h2>
    <p style="margin:2px 0;font-size:11px;color:#444;">${branch} &bull; ${area}</p>
    <h3 style="margin:6px 0 0;font-size:13px;">GROUP COLLECTION RECEIPT</h3>
  </div>
  <table style="width:100%;font-size:11px;margin-bottom:10px;">
    <tr><td><strong>Group:</strong></td><td>${groupName} (${groupNumber})</td></tr>
    <tr><td><strong>Week:</strong></td><td>Week ${receipt.week} of ${TOTAL_WEEKS}</td></tr>
    <tr><td><strong>Date:</strong></td><td>${formatDate(receipt.date, 'dd MMM yyyy')}</td></tr>
    <tr><td><strong>Method:</strong></td><td>${receipt.method === 'momo' ? `MoMo${receipt.momoRef ? ` (Ref: ${receipt.momoRef})` : ''}` : 'Cash'}</td></tr>
    <tr><td><strong>Officer:</strong></td><td>${officerName}</td></tr>
  </table>
  <table style="width:100%;font-size:11px;border-collapse:collapse;">
    <thead><tr style="background:#f3f4f6;"><th style="padding:4px 6px;text-align:left;">Member</th><th style="padding:4px 6px;text-align:right;">Amount (GHS)</th></tr></thead>
    <tbody>${rows}
      <tr><td style="padding:6px;font-weight:bold;">TOTAL</td><td style="padding:6px;text-align:right;font-weight:bold;font-family:monospace;">${receipt.total.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div style="margin-top:28px;">
    <p style="font-size:10px;margin:0 0 4px;">Officer Signature:</p>
    ${sigImg}
  </div>
  <p style="font-size:9px;color:#888;margin-top:20px;text-align:center;">Computer-generated receipt &bull; Thank you for repaying on time.</p>
  <script>window.onload = function(){ window.print(); }</script>
</body></html>`)
    win.document.close()
    win.focus()
  }

  // ---------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------
  const exportCsv = () => {
    const lines: string[] = []
    lines.push(
      [
        'Beyond Sky Micro-Credit Enterprise',
        '',
        '',
        `Group: ${groupName} (${groupNumber})`,
        `Branch: ${branch}`,
        `Area: ${area}`,
        `Meeting Day: ${meetingDay}`,
        `Meeting Place: ${meetingPlace}`,
        `Exported: ${formatDate(new Date().toISOString(), 'dd MMM yyyy HH:mm')}`,
      ]
        .map(escapeCsv)
        .join(',')
    )
    const header = [
      'S/N',
      'Client Name',
      'Account Number',
      'Phone',
      'Business Type',
      'Market Location',
      'Loan Number',
      'Principal',
      'Total Repayable',
      'Weekly Installment',
      ...Array.from({ length: TOTAL_WEEKS }, (_, i) => `WK${i + 1} Paid`),
      ...Array.from({ length: TOTAL_WEEKS }, (_, i) => `WK${i + 1} Expected`),
      'Penalty',
      'Cumulative Paid',
      'Outstanding Balance',
      'Loan Status',
    ]
    lines.push(header.map(escapeCsv).join(','))
    schedules.forEach((m) => {
      const paidCells = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
        const inst = m.installments.find((x) => x.week === i + 1)
        return inst ? inst.paidAmount.toFixed(2) : '0.00'
      })
      const expectedCells = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
        const inst = m.installments.find((x) => x.week === i + 1)
        return inst ? inst.expectedAmount.toFixed(2) : '0.00'
      })
      const row = [
        m.sn,
        m.clientName,
        m.accountNumber,
        m.phoneNumber,
        m.businessType || '',
        m.marketLocation || '',
        m.loanNumber || '',
        (m.principal || 0).toFixed(2),
        (m.totalRepayable || 0).toFixed(2),
        (m.weeklyInstallment || 0).toFixed(2),
        ...paidCells,
        ...expectedCells,
        memberPenalty(m).toFixed(2),
        (m.cumulativePaid || 0).toFixed(2),
        (m.outstandingBalance || 0).toFixed(2),
        m.loanStatus || '',
      ]
      lines.push(row.map(escapeCsv).join(','))
    })
    const totalsRow = [
      '',
      'GROUP TOTALS',
      '',
      '',
      '',
      '',
      '',
      totalPrincipal.toFixed(2),
      totalLoanRepayable.toFixed(2),
      '',
      ...weeklyTotals.map((t) => t.toFixed(2)),
      ...weeklyExpected.map((t) => t.toFixed(2)),
      totalPenalties.toFixed(2),
      totalCumulativePaid.toFixed(2),
      totalOutstanding.toFixed(2),
      '',
    ]
    lines.push(totalsRow.map(escapeCsv).join(','))

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${groupNumber || 'group'}-collection-matrix.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: 'CSV exported', description: 'Matrix downloaded as an Excel-compatible CSV file.' })
  }

  // ---------------------------------------------------------------
  // Retry collection for zero-payment overdue members
  // ---------------------------------------------------------------
  const openRetryCollection = () => {
    if (!earliestRetryWeek) return
    openWeekCollection(earliestRetryWeek, zeroPaymentOverdue[earliestRetryWeek] || null)
  }

  const handlePrint = () => {
    window.print()
  }

  // ---------------------------------------------------------------
  // Cell rendering helper
  // ---------------------------------------------------------------
  const renderWeekCell = (m: GroupMemberLoanSchedule, weekNum: number) => {
    const inst = m.installments.find((i) => i.week === weekNum)
    const paid = inst?.paidAmount || 0
    const expected = inst?.expectedAmount || m.weeklyInstallment || 0
    const remaining = Math.max(0, expected - paid)
    const status = inst?.status
    const locked = lockedWeeks.includes(weekNum)
    const wOver = status === 'overdue' ? Math.max(1, weeksOverdue(inst?.dueDate)) : 0
    const flashKey = `${m.clientId}-${weekNum}`
    const isZeroOverdue = status === 'overdue' && paid <= 0

    let cellClass = statusCellBase(status)
    if (status === 'overdue') {
      cellClass = overdueShadeClass(wOver, paid > 0)
    }

    const tooltipParts: string[] = [`Week ${weekNum}`]
    if (inst?.dueDate) tooltipParts.push(`Due: ${formatDate(inst.dueDate, 'dd MMM yyyy')}`)
    tooltipParts.push(`Expected: ${formatCurrency(expected)}`)
    if (paid > 0) tooltipParts.push(`Paid: ${formatCurrency(paid)}`)
    if (remaining > 0 && status !== 'upcoming' && status !== 'unassigned') {
      tooltipParts.push(`Remaining balance: ${formatCurrency(remaining)} (carried forward)`)
    }
    if (wOver > 0) tooltipParts.push(`${wOver} week(s) overdue`)
    if (locked) tooltipParts.push('Signed off — locked')

    return (
      <td
        key={weekNum}
        title={tooltipParts.join(' | ')}
        onClick={() => {
          if (!locked) openWeekCollection(weekNum)
        }}
        className={cn(
          'p-1.5 text-center border-r border-gray-200 align-middle transition-all duration-500 ease-out print:transition-none',
          cellClass,
          !locked && 'cursor-pointer hover:ring-1 hover:ring-blue-400 hover:ring-inset',
          locked && 'cursor-not-allowed opacity-80',
          isZeroOverdue && !locked && 'ring-2 ring-inset ring-rose-500',
          flashedCells[flashKey] && 'ring-2 ring-inset ring-blue-500 scale-[1.02]',
          focusedWeek === weekNum && 'outline outline-1 outline-blue-300 outline-offset-[-1px]'
        )}
      >
        <div className="flex flex-col items-center justify-center leading-tight">
          {locked && <Lock className="h-3 w-3 mb-0.5 print:mb-0" />}
          {paid > 0 ? (
            <>
              <span className="font-mono text-[11px]">{paid.toFixed(2)}</span>
              {remaining > 0 && (
                <span className="flex items-center gap-0.5 text-[8px] text-amber-700 print:text-black" title={`Remaining ${formatCurrency(remaining)} carried forward`}>
                  <CornerDownRight className="h-2.5 w-2.5" />
                  {remaining.toFixed(0)}
                </span>
              )}
            </>
          ) : wOver > 0 ? (
            <span className="text-[9px] font-bold leading-tight">{wOver}w overdue</span>
          ) : (
            <span className="text-gray-300 print:text-gray-400">-</span>
          )}
        </div>
      </td>
    )
  }

  // ---------------------------------------------------------------
  // Expanded member history rows
  // ---------------------------------------------------------------
  const renderHistoryRow = (m: GroupMemberLoanSchedule) => (
    <tr key={`${m.clientId}-history`} className="bg-blue-50/40 print:hidden">
      <td colSpan={TOTAL_WEEKS + 6} className="p-3">
        <div className="rounded-lg border border-blue-200 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-blue-100/60 border-b border-blue-200 flex items-center justify-between">
            <p className="text-xs font-bold text-blue-900">
              Full Payment History — {m.clientName} ({m.loanNumber || m.accountNumber})
            </p>
            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
              {m.phoneNumber}
            </Badge>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-600 uppercase text-[9px] tracking-wider">
                  <th className="p-1.5 text-left">Week</th>
                  <th className="p-1.5 text-left">Due Date</th>
                  <th className="p-1.5 text-right">Expected</th>
                  <th className="p-1.5 text-right">Paid</th>
                  <th className="p-1.5 text-right">Balance</th>
                  <th className="p-1.5 text-left">Method</th>
                  <th className="p-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
                  const inst = m.installments.find((x) => x.week === w)
                  const log = methodLog[m.clientId]?.[w]
                  return (
                    <tr key={w} className="hover:bg-gray-50">
                      <td className="p-1.5 font-sans font-bold text-gray-700">WK {w}</td>
                      <td className="p-1.5 font-sans text-gray-600">
                        {inst?.dueDate ? formatDate(inst.dueDate, 'dd MMM yyyy') : log?.date ? formatDate(log.date, 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="p-1.5 text-right text-gray-700">{inst ? inst.expectedAmount.toFixed(2) : '—'}</td>
                      <td className="p-1.5 text-right font-bold text-emerald-700">{inst ? inst.paidAmount.toFixed(2) : '0.00'}</td>
                      <td className="p-1.5 text-right text-amber-700">{inst ? Math.max(0, inst.balance).toFixed(2) : '—'}</td>
                      <td className="p-1.5 font-sans text-gray-600 capitalize">{log?.method || (inst && inst.paidAmount > 0 ? 'recorded' : '—')}</td>
                      <td className="p-1.5">
                        {inst ? (
                          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-sans', installmentStatusBadgeClass(inst.status))}>
                            {inst.status.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-gray-300 font-sans">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  )

  // ---------------------------------------------------------------
  // Variance report data
  // ---------------------------------------------------------------
  const varianceRows = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const weekNum = i + 1
    const expected = weeklyExpected[i] || 0
    const actual = weeklyTotals[i] || 0
    const shortfall = Math.max(0, expected - actual)
    const pct = expected > 0 ? (actual / expected) * 100 : 0
    return { week: weekNum, expected, actual, shortfall, pct, locked: lockedWeeks.includes(weekNum) }
  })

  const colSpanTotal = TOTAL_WEEKS + 6 // SN/Name, Principal, Repayable, 13 weeks, Penalty, Cum Paid, Balance

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* ACTION HEADER BANNER (Screen only)                            */}
      {/* ============================================================ */}
      <div className="print:hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              13-Week Field Collection Matrix
              <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                {groupNumber}
              </span>
              {lockedWeeks.length > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 border-gray-300 text-gray-600">
                  <Lock className="h-3 w-3" /> {lockedWeeks.length} week{lockedWeeks.length === 1 ? '' : 's'} signed off
                </Badge>
              )}
            </h2>
            <p className="text-xs text-gray-500">
              Interactive 13-week group repayment ledger — use <kbd className="px-1 bg-gray-100 border rounded text-[10px]">←</kbd>{' '}
              <kbd className="px-1 bg-gray-100 border rounded text-[10px]">→</kbd> to browse weeks and{' '}
              <kbd className="px-1 bg-gray-100 border rounded text-[10px]">Enter</kbd> to collect
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVariance((v) => !v)}
            className={cn('text-xs font-medium gap-1.5 border-gray-300', showVariance && 'bg-blue-50 border-blue-300 text-blue-700')}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Variance
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            className="text-xs font-medium gap-1.5 border-gray-300 hover:bg-emerald-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          {earliestRetryWeek && zeroPaymentMemberCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={openRetryCollection}
              className="text-xs font-semibold gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry Collection (WK {earliestRetryWeek})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs font-medium gap-1.5 border-gray-300 hover:bg-gray-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print Field Sheet
          </Button>
          <Button
            size="sm"
            onClick={() => openWeekCollection(focusedWeek)}
            className="text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <CreditCard className="h-3.5 w-3.5" /> Quick Batch Collect
          </Button>
        </div>
      </div>

      {/* Offline / pending sync banner */}
      {(!isOnline || pending.length > 0) && (
        <div
          className={cn(
            'print:hidden flex items-center gap-3 p-3 rounded-xl border text-xs font-medium',
            isOnline ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-rose-50 border-rose-300 text-rose-900'
          )}
        >
          {isOnline ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <div className="flex-1">
            {!isOnline ? (
              <p>
                <strong>You are offline.</strong> Collections will be cached on this device and posted automatically when the connection returns.
              </p>
            ) : (
              <p>
                <strong>{pending.length} pending collection{pending.length === 1 ? '' : 's'}</strong> queued while offline —{' '}
                {syncing ? 'syncing now…' : 'tap Sync to post them now.'}
              </p>
            )}
          </div>
          {isOnline && pending.length > 0 && (
            <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={syncing} onClick={() => flushPending(pending)}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Sync Now
            </Button>
          )}
        </div>
      )}

      {/* Zero-payment overdue alert */}
      {earliestRetryWeek && zeroPaymentMemberCount > 0 && (
        <div className="print:hidden flex items-center gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-900">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <p className="flex-1">
            <strong>{zeroPaymentMemberCount} member{zeroPaymentMemberCount === 1 ? '' : 's'}</strong> with zero payment in overdue Week{' '}
            {earliestRetryWeek}. Highlighted with a red ring in the matrix.
          </p>
          <Button size="sm" variant="outline" className="text-xs gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-100" onClick={openRetryCollection}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry Collection
          </Button>
        </div>
      )}

      {/* ============================================================ */}
      {/* CUMULATIVE PROGRESS BAR                                       */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 print:hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            Group Repayment Completion
          </p>
          <p className="text-xs font-mono font-bold text-gray-900">
            {formatCurrency(totalCumulativePaid)} / {formatCurrency(totalLoanRepayable)}{' '}
            <span className="text-emerald-700">({completionPct.toFixed(1)}%)</span>
          </p>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700 ease-out',
              completionPct >= 75 ? 'bg-emerald-500' : completionPct >= 40 ? 'bg-amber-400' : 'bg-rose-400'
            )}
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Print-only progress summary */}
      <div className="hidden print:block text-xs font-mono mb-2">
        Repayment completion: {completionPct.toFixed(1)}% ({totalCumulativePaid.toFixed(2)} of {totalLoanRepayable.toFixed(2)})
      </div>

      {/* ============================================================ */}
      {/* COLOR LEGEND + WEEK NAVIGATION                                */}
      {/* ============================================================ */}
      <div className="print:hidden bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap text-[10px] font-medium text-gray-600">
          <span className="font-bold uppercase tracking-wider text-gray-500">Legend:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" /> Paid</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" /> Partial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-100 border border-rose-300" /> Overdue 1-2w</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-300 border border-rose-400" /> Overdue 3-4w</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-600" /> Overdue 5w+</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-300" /> Upcoming</span>
          <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-gray-500" /> Signed off</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => moveFocus(-1)} disabled={focusedWeek <= 1} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-bold text-gray-800 min-w-[70px] text-center">
            Week {focusedWeek} / {TOTAL_WEEKS}
          </span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => moveFocus(1)} disabled={focusedWeek >= TOTAL_WEEKS} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={jumpToCurrentWeek}>
            <Crosshair className="h-3.5 w-3.5" /> Current week
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* VARIANCE REPORT                                               */}
      {/* ============================================================ */}
      {showVariance && (
        <div className="print:hidden bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" /> Expected vs Actual — Variance Report
            </h3>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowVariance(false)} aria-label="Close variance report">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 uppercase text-[10px] tracking-wider">
                  <th className="p-2 text-left">Week</th>
                  <th className="p-2 text-right">Expected</th>
                  <th className="p-2 text-right">Actual Collected</th>
                  <th className="p-2 text-right">Shortfall</th>
                  <th className="p-2 text-right">Completion %</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {varianceRows.map((row) => (
                  <tr key={row.week} className={cn('hover:bg-gray-50', row.week === focusedWeek && 'bg-blue-50/50')}>
                    <td className="p-2 font-sans font-bold text-gray-800">
                      Week {row.week}
                      {row.locked && <Lock className="inline h-3 w-3 ml-1 text-gray-500" />}
                    </td>
                    <td className="p-2 text-right text-gray-700">{row.expected.toFixed(2)}</td>
                    <td className="p-2 text-right font-bold text-emerald-700">{row.actual.toFixed(2)}</td>
                    <td className={cn('p-2 text-right font-bold', row.shortfall > 0 ? 'text-rose-600' : 'text-gray-400')}>
                      {row.shortfall.toFixed(2)}
                    </td>
                    <td className="p-2 text-right text-gray-700">{row.pct.toFixed(1)}%</td>
                    <td className="p-2 font-sans">
                      {row.locked ? (
                        <Badge variant="outline" className="text-[9px] border-gray-300">Signed off</Badge>
                      ) : row.shortfall <= 0.001 ? (
                        <Badge className="text-[9px] bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-300">Complete</Badge>
                      ) : row.actual > 0 ? (
                        <Badge className="text-[9px] bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-300">Partial</Badge>
                      ) : (
                        <Badge className="text-[9px] bg-rose-100 text-rose-800 hover:bg-rose-100 border border-rose-300">Outstanding</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-black text-gray-900">
                  <td className="p-2 font-sans uppercase tracking-wider">Totals</td>
                  <td className="p-2 text-right">{varianceRows.reduce((a, r) => a + r.expected, 0).toFixed(2)}</td>
                  <td className="p-2 text-right text-emerald-800">{varianceRows.reduce((a, r) => a + r.actual, 0).toFixed(2)}</td>
                  <td className="p-2 text-right text-rose-700">{varianceRows.reduce((a, r) => a + r.shortfall, 0).toFixed(2)}</td>
                  <td className="p-2 text-right" colSpan={2}>{completionPct.toFixed(1)}% overall</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 13-WEEK MATRIX (desktop / print)                              */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:p-0">
        {/* Official header (screen + print) */}
        <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50/50 print:bg-transparent print:border-b-2 print:border-black print:pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-lg sm:text-xl font-black text-blue-900 print:text-black uppercase tracking-wide">
                BEYOND SKY MICRO-CREDIT ENTERPRISE
              </h1>
              <p className="text-xs font-semibold text-gray-700 uppercase">
                Group 13-Week Field Collection Schedule & Repayment Ledger
              </p>
              <p className="text-[10px] text-gray-500 print:text-black">
                Branch: {branch} | Area: {area} | Penalty rate: {penaltyRate}% per week overdue
              </p>
            </div>
            <div className="text-right text-xs font-mono">
              <p className="font-bold text-gray-900">
                Group: <span className="text-blue-700 print:text-black">{groupName}</span> ({groupNumber})
              </p>
              <p className="text-gray-500 print:text-black">
                Meeting Day: <span className="font-semibold text-gray-700">{meetingDay}</span> | Venue: {meetingPlace}
              </p>
              <p className="text-gray-500 print:text-black">Printed: {formatDate(new Date().toISOString(), 'dd MMM yyyy')}</p>
            </div>
          </div>
        </div>

        {/* Matrix table */}
        <div className="overflow-x-auto hidden md:block" ref={tableWrapRef}>
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-300 print:bg-gray-200 print:text-black text-[11px] uppercase tracking-wider">
                <th className="p-2 border-r border-gray-300 min-w-[190px] sticky left-0 z-20 bg-gray-100 print:bg-gray-200 print:static shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] print:shadow-none">
                  Client / Member Name
                </th>
                <th className="p-2 border-r border-gray-200 text-right min-w-[85px]">Principal</th>
                <th className="p-2 border-r border-gray-200 text-right min-w-[90px] bg-blue-50/50 print:bg-transparent">
                  Loan Repayable
                </th>
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
                  const weekNum = i + 1
                  const locked = lockedWeeks.includes(weekNum)
                  return (
                    <th
                      key={weekNum}
                      ref={(el) => {
                        weekHeaderRefs.current[weekNum] = el
                      }}
                      className={cn(
                        'p-1.5 border-r border-gray-200 text-center min-w-[68px] transition-colors',
                        !locked && 'cursor-pointer hover:bg-blue-100/70 print:hover:bg-transparent',
                        locked && 'bg-gray-200/70 cursor-not-allowed',
                        focusedWeek === weekNum && 'bg-blue-100 ring-2 ring-inset ring-blue-400 print:ring-0'
                      )}
                      title={locked ? `Week ${weekNum} signed off` : `Click to record collections for Week ${weekNum}`}
                      onClick={() => {
                        setFocusedWeek(weekNum)
                        if (!locked) openWeekCollection(weekNum)
                      }}
                    >
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-gray-900 flex items-center gap-0.5">
                          {locked && <Lock className="h-3 w-3 text-gray-600" />}
                          WK {weekNum}
                        </span>
                        {locked ? (
                          <span className="text-[8px] font-semibold text-gray-600 normal-case">Signed off</span>
                        ) : (
                          <span className="text-[9px] text-blue-600 print:hidden font-normal">collect</span>
                        )}
                      </div>
                    </th>
                  )
                })}
                <th className="p-2 border-r border-gray-200 text-right min-w-[75px] bg-rose-50/60 print:bg-transparent">Penalty</th>
                <th className="p-2 border-r border-gray-200 text-right min-w-[85px] bg-emerald-50/50 print:bg-transparent">
                  CUM. PAID
                </th>
                <th className="p-2 text-right min-w-[85px] bg-amber-50/50 print:bg-transparent font-bold text-gray-900">
                  BALANCE
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-mono text-[11px]">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={colSpanTotal} className="p-8 text-center text-gray-400 font-sans">
                    No active loan schedules found for this group. Add members and originate loans to populate this matrix.
                  </td>
                </tr>
              ) : (
                schedules.map((row) => {
                  const expanded = expandedMember === row.clientId
                  return (
                    <Fragment key={row.clientId}>
                      <tr
                        className={cn(
                          'border-b border-gray-200 transition-colors hover:bg-blue-50/30',
                          expanded && 'bg-blue-50/40'
                        )}
                      >
                        {/* Sticky first column: SN + name */}
                        <td
                          className={cn(
                            'p-2 font-sans font-medium text-gray-900 border-r border-gray-300 sticky left-0 z-10 print:static shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] print:shadow-none',
                            expanded ? 'bg-blue-50' : 'bg-white'
                          )}
                        >
                          <button
                            type="button"
                            className="flex items-start gap-1.5 text-left w-full group print:pointer-events-none"
                            onClick={() => setExpandedMember(expanded ? null : row.clientId)}
                            title={expanded ? 'Collapse payment history' : 'Expand full payment history'}
                          >
                            <span className="text-[10px] font-bold text-gray-400 mt-0.5 w-5 shrink-0">{row.sn}.</span>
                            <span className="flex flex-col min-w-0">
                              <span className="font-bold text-xs group-hover:text-blue-700 transition-colors flex items-center gap-1">
                                <span className="truncate">{row.clientName}</span>
                                <ChevronDown
                                  className={cn(
                                    'h-3 w-3 shrink-0 text-gray-400 print:hidden transition-transform duration-200',
                                    expanded && 'rotate-180 text-blue-600'
                                  )}
                                />
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono truncate">
                                {row.accountNumber} {row.loanNumber ? `• ${row.loanNumber}` : ''}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="p-2 text-right border-r border-gray-200 font-medium text-gray-700">
                          {row.principal ? Number(row.principal).toFixed(2) : '-'}
                        </td>
                        <td className="p-2 text-right border-r border-gray-200 font-bold text-blue-900 print:text-black bg-blue-50/30 print:bg-transparent">
                          {row.totalRepayable ? Number(row.totalRepayable).toFixed(2) : '-'}
                        </td>

                        {/* 13 weekly cells */}
                        {Array.from({ length: TOTAL_WEEKS }, (_, idx) => renderWeekCell(row, idx + 1))}

                        {/* Penalty */}
                        <td
                          className="p-2 text-right border-r border-gray-200 font-bold bg-rose-50/40 print:bg-transparent"
                          title={`Late penalty at ${penaltyRate}% per week overdue`}
                        >
                          {memberPenalty(row) > 0 ? (
                            <span className="text-rose-700 print:text-black">{memberPenalty(row).toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-300 print:text-gray-400">-</span>
                          )}
                        </td>

                        {/* Cumulative paid */}
                        <td className="p-2 text-right border-r border-gray-200 font-bold text-emerald-700 print:text-black bg-emerald-50/30 print:bg-transparent transition-all duration-500">
                          {Number(row.cumulativePaid || 0).toFixed(2)}
                        </td>

                        {/* Balance */}
                        <td className="p-2 text-right font-bold text-amber-800 print:text-black bg-amber-50/30 print:bg-transparent transition-all duration-500">
                          {Number(row.outstandingBalance || 0).toFixed(2)}
                        </td>
                      </tr>
                      {expanded && renderHistoryRow(row)}
                    </Fragment>
                  )
                })
              )}

              {/* Group totals row */}
              {schedules.length > 0 && (
                <tr className="bg-gray-100 font-black text-gray-900 border-t-2 border-black print:bg-gray-200 text-[11px]">
                  <td className="p-2 text-right uppercase tracking-wider font-sans border-r border-gray-300 sticky left-0 z-10 bg-gray-100 print:bg-gray-200 print:static shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] print:shadow-none">
                    Group Totals:
                  </td>
                  <td className="p-2 text-right border-r border-gray-300">{totalPrincipal.toFixed(2)}</td>
                  <td className="p-2 text-right border-r border-gray-300 text-blue-900 print:text-black">
                    {totalLoanRepayable.toFixed(2)}
                  </td>
                  {weeklyTotals.map((tot, idx) => (
                    <td key={idx} className="p-1.5 text-center border-r border-gray-300">
                      {tot > 0 ? tot.toFixed(2) : '-'}
                    </td>
                  ))}
                  <td className="p-2 text-right border-r border-gray-300 text-rose-800 print:text-black">
                    {totalPenalties > 0 ? totalPenalties.toFixed(2) : '-'}
                  </td>
                  <td className="p-2 text-right border-r border-gray-300 text-emerald-800 print:text-black">
                    {totalCumulativePaid.toFixed(2)}
                  </td>
                  <td className="p-2 text-right text-amber-900 print:text-black">{totalOutstanding.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ============================================================ */}
        {/* MOBILE CARD VIEW (small screens)                              */}
        {/* ============================================================ */}
        <div className="md:hidden print:hidden divide-y divide-gray-100">
          {schedules.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-xs">
              No active loan schedules found for this group.
            </p>
          ) : (
            schedules.map((m) => {
              const expanded = expandedMember === m.clientId
              const penalty = memberPenalty(m)
              return (
                <div key={m.clientId} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => setExpandedMember(expanded ? null : m.clientId)}
                    >
                      <p className="text-sm font-bold text-gray-900 truncate flex items-center gap-1">
                        {m.sn}. {m.clientName}
                        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', expanded && 'rotate-180')} />
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono truncate">{m.accountNumber}</p>
                    </button>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-emerald-700">{formatCurrency(m.cumulativePaid)}</p>
                      <p className="text-[10px] text-amber-700 font-mono">bal {formatCurrency(m.outstandingBalance)}</p>
                    </div>
                  </div>
                  {/* Week chips */}
                  <div className="mt-2 grid grid-cols-13 gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                    {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
                      const w = i + 1
                      const inst = m.installments.find((x) => x.week === w)
                      const locked = lockedWeeks.includes(w)
                      const wOver = inst?.status === 'overdue' ? Math.max(1, weeksOverdue(inst?.dueDate)) : 0
                      let chipClass = 'bg-gray-100 text-gray-400'
                      if (inst?.status === 'paid') chipClass = 'bg-emerald-200 text-emerald-900'
                      else if (inst?.status === 'partially_paid') chipClass = 'bg-amber-200 text-amber-900'
                      else if (inst?.status === 'overdue') chipClass = wOver >= 5 ? 'bg-rose-600 text-white' : wOver >= 3 ? 'bg-rose-300 text-rose-950' : 'bg-rose-100 text-rose-800'
                      return (
                        <button
                          key={w}
                          type="button"
                          disabled={locked}
                          onClick={() => openWeekCollection(w)}
                          className={cn(
                            'rounded px-0.5 py-1 text-[9px] font-bold transition-colors',
                            chipClass,
                            !locked && 'active:scale-95',
                            locked && 'opacity-60'
                          )}
                          title={`Week ${w}${inst?.dueDate ? ` — due ${formatDate(inst.dueDate, 'dd MMM')}` : ''}${locked ? ' (signed off)' : ''}`}
                        >
                          {locked ? <Lock className="h-2.5 w-2.5 mx-auto" /> : w}
                        </button>
                      )
                    })}
                  </div>
                  {penalty > 0 && (
                    <p className="mt-1.5 text-[10px] text-rose-600 font-semibold">
                      Late penalty: {formatCurrency(penalty)} ({penaltyRate}%/week overdue)
                    </p>
                  )}
                  {expanded && (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-blue-100/60 text-gray-600 uppercase text-[8px] tracking-wider">
                            <th className="p-1 text-left">Wk</th>
                            <th className="p-1 text-left">Due</th>
                            <th className="p-1 text-right">Exp.</th>
                            <th className="p-1 text-right">Paid</th>
                            <th className="p-1 text-left">Method</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100 font-mono">
                          {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
                            const inst = m.installments.find((x) => x.week === w)
                            const log = methodLog[m.clientId]?.[w]
                            return (
                              <tr key={w}>
                                <td className="p-1 font-bold text-gray-700">{w}</td>
                                <td className="p-1 font-sans text-gray-500">{inst?.dueDate ? formatDate(inst.dueDate, 'dd MMM yy') : '—'}</td>
                                <td className="p-1 text-right text-gray-600">{inst ? inst.expectedAmount.toFixed(2) : '—'}</td>
                                <td className="p-1 text-right font-bold text-emerald-700">{inst ? inst.paidAmount.toFixed(2) : '0.00'}</td>
                                <td className="p-1 font-sans text-gray-500 capitalize">{log?.method || (inst && inst.paidAmount > 0 ? 'recorded' : '—')}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Printable sign-off block with captured signature */}
        <div className="hidden print:block p-6 border-t-2 border-black mt-8 text-xs font-serif">
          <div className="grid grid-cols-3 gap-8 pt-4">
            <div className="space-y-6">
              <p className="font-sans font-bold">Group Leader / Representative:</p>
              <div className="border-b border-black w-full h-10" />
              <p className="text-[11px] text-gray-600">Signature & Date</p>
            </div>
            <div className="space-y-2">
              <p className="font-sans font-bold">Loan Officer / Field Collector: {officerName}</p>
              <div className="border-b border-black w-full h-10 flex items-end justify-center pb-1">
                {lastSignature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lastSignature} alt="Officer signature" className="max-h-9 max-w-[180px] object-contain" />
                )}
              </div>
              <p className="text-[11px] text-gray-600">
                Signed: {formatDate(new Date().toISOString(), 'dd MMM yyyy')}
              </p>
            </div>
            <div className="space-y-6">
              <p className="font-sans font-bold">Branch Supervisor / Manager:</p>
              <div className="border-b border-black w-full h-10" />
              <p className="text-[11px] text-gray-600">Verification & Stamp</p>
            </div>
          </div>
          <p className="mt-6 text-[10px] font-sans text-gray-600">
            Group: {groupName} ({groupNumber}) | Meeting Day: {meetingDay} | Venue: {meetingPlace} | Branch: {branch} | Area: {area}
            {lockedWeeks.length > 0 && ` | Signed-off weeks: ${lockedWeeks.join(', ')}`}
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* FLOATING COLLECTION TOTALS SIDEBAR                            */}
      {/* ============================================================ */}
      <div className="print:hidden hidden sm:block fixed bottom-4 right-4 z-40 w-56 bg-white rounded-xl border border-gray-300 shadow-lg p-3 text-xs">
        <p className="font-bold text-gray-900 flex items-center gap-1.5 mb-2">
          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          Week {focusedWeek} Collection Summary
        </p>
        <div className="space-y-1 font-mono">
          <div className="flex justify-between">
            <span className="text-gray-500 font-sans">Expected</span>
            <span className="font-bold text-gray-800">{formatCurrency(focusExpected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 font-sans">Collected</span>
            <span className="font-bold text-emerald-700">{formatCurrency(focusCollected)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-1">
            <span className="text-gray-500 font-sans">Shortfall</span>
            <span className={cn('font-bold', focusShortfall > 0 ? 'text-rose-600' : 'text-gray-400')}>
              {formatCurrency(focusShortfall)}
            </span>
          </div>
        </div>
        {lockedWeeks.includes(focusedWeek) && (
          <Badge variant="outline" className="mt-2 text-[9px] gap-1 border-gray-300 text-gray-600 w-full justify-center">
            <Lock className="h-2.5 w-2.5" /> Signed off
          </Badge>
        )}
      </div>

      {/* ============================================================ */}
      {/* BATCH COLLECTION MODAL                                        */}
      {/* ============================================================ */}
      <Dialog open={collectWeekModalOpen} onOpenChange={(open) => { if (!submittingBatch) setCollectWeekModalOpen(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Record Group Collection — Week {selectedWeek}
              {modalFilterLoanIds && (
                <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border border-rose-300 text-[10px]">
                  Retry — unpaid only
                </Badge>
              )}
              {!isOnline && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-300 text-[10px] gap-1">
                  <WifiOff className="h-3 w-3" /> Offline — will queue
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Record weekly cash or MoMo collections for {groupName} ({groupNumber}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBatchSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <Label htmlFor="weekSelect" className="text-xs">Collection Week</Label>
                <select
                  id="weekSelect"
                  value={selectedWeek}
                  onChange={(e) => {
                    const w = parseInt(e.target.value, 10)
                    setModalFilterLoanIds(null)
                    openWeekCollection(w)
                  }}
                  className="w-full mt-1 border rounded-md px-2 py-1.5 text-xs bg-white"
                >
                  {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
                    <option key={i + 1} value={i + 1} disabled={lockedWeeks.includes(i + 1)}>
                      Week {i + 1} (Installment #{i + 1}){lockedWeeks.includes(i + 1) ? ' — SIGNED OFF' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="txDate" className="text-xs">Transaction Date</Label>
                <Input
                  id="txDate"
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  required
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label htmlFor="payMethod" className="text-xs">Payment Method</Label>
                <select
                  id="payMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'momo')}
                  className="w-full mt-1 border rounded-md px-2 py-1.5 text-xs bg-white"
                >
                  <option value="cash">Cash (Field Collector)</option>
                  <option value="momo">MTN / Telecel MoMo</option>
                </select>
              </div>
            </div>

            {paymentMethod === 'momo' && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <Label htmlFor="momoRef" className="text-xs text-amber-900 font-bold">
                  MoMo Transaction ID / Reference Number *
                </Label>
                <Input
                  id="momoRef"
                  placeholder="e.g. 24899120042"
                  value={momoRef}
                  onChange={(e) => setMomoRef(e.target.value)}
                  required
                  className="h-8 text-xs mt-1"
                />
              </div>
            )}

            {/* Penalty configuration */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-rose-50/60 rounded-lg border border-rose-200">
              <label className="flex items-center gap-2 text-xs font-semibold text-rose-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePenalty}
                  onChange={(e) => setIncludePenalty(e.target.checked)}
                  className="rounded border-rose-300"
                />
                Apply late penalty to pre-filled amounts
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor="penaltyRate" className="text-xs text-rose-900 font-semibold whitespace-nowrap">
                  Penalty rate (%/week overdue):
                </Label>
                <Input
                  id="penaltyRate"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={penaltyRate}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setPenaltyRate(isNaN(v) || v < 0 ? 0 : Math.min(50, v))
                  }}
                  className="h-7 w-20 text-xs font-mono text-right"
                />
              </div>
              {totalPenalties > 0 && (
                <span className="text-xs font-mono font-bold text-rose-700 sm:ml-auto">
                  Group penalty due: {formatCurrency(totalPenalties)}
                </span>
              )}
            </div>

            {/* Member search filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search members by name, account, loan or phone…"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Member repayment rows */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              <Label className="text-xs font-bold text-gray-700">
                Member Weekly Installments ({modalMembers.length} shown)
              </Label>
              {modalMembers.length === 0 ? (
                <p className="p-4 text-center text-xs text-gray-400 border border-dashed rounded-lg">
                  No members match your search{modalFilterLoanIds ? ' / retry filter' : ''}.
                </p>
              ) : (
                <div className="space-y-2">
                  {modalMembers.map((m) => {
                    const amt = memberAmounts[m.loanId!] ?? 0
                    const inst = m.installments.find((i) => i.week === selectedWeek)
                    const remaining = inst ? Math.max(0, inst.expectedAmount - inst.paidAmount) : m.weeklyInstallment
                    const penalty = includePenalty ? memberPenalty(m) : 0
                    const validationError = amountValidation(m)

                    return (
                      <div
                        key={m.clientId}
                        className={cn(
                          'p-2.5 bg-white border rounded-lg gap-3 flex items-center justify-between',
                          validationError ? 'border-rose-300 bg-rose-50/40' : 'border-gray-200'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{m.clientName}</p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            Due WK{selectedWeek}: {formatCurrency(remaining)} | Bal: {formatCurrency(m.outstandingBalance)}
                            {penalty > 0 && <span className="text-rose-600 font-bold"> | Penalty: {formatCurrency(penalty)}</span>}
                          </p>
                          {validationError && (
                            <p className="text-[10px] text-rose-600 font-semibold flex items-center gap-1 mt-0.5">
                              <AlertCircle className="h-3 w-3" /> {validationError}
                            </p>
                          )}
                        </div>

                        <div className="w-40 flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-bold text-gray-500">GHS</span>
                          <Input
                            type="number"
                            step="0.50"
                            min="0"
                            value={amt}
                            onChange={(e) => handleAmountChange(m.loanId!, e.target.value)}
                            className={cn('h-8 text-xs font-mono font-bold text-right', validationError && 'border-rose-400 text-rose-700')}
                          />
                          <button
                            type="button"
                            title="Fill with amount due"
                            className="text-[9px] font-bold text-blue-600 hover:text-blue-800 underline shrink-0"
                            onClick={() =>
                              setMemberAmounts((prev) => ({
                                ...prev,
                                [m.loanId!]: Math.round(Math.min(remaining + penalty, Math.max(0, m.outstandingBalance) + penalty) * 100) / 100,
                              }))
                            }
                          >
                            due
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Total footer */}
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
              <span className="text-xs font-bold">Total Group Week {selectedWeek} Collection:</span>
              <span className="text-base font-black font-mono">{formatCurrency(totalBatchCollecting)}</span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCollectWeekModalOpen(false)}
                disabled={submittingBatch}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingBatch || totalBatchCollecting <= 0 || hasValidationError}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {submittingBatch ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording Collection...
                  </>
                ) : !isOnline ? (
                  <>
                    <WifiOff className="mr-2 h-4 w-4" />
                    Queue Offline ({formatCurrency(totalBatchCollecting)})
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm Collection ({formatCurrency(totalBatchCollecting)})
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIGITAL SIGNATURE DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <PenLine className="h-5 w-5 text-blue-600" />
              Officer Sign-off — Week {selectedWeek}
            </DialogTitle>
            <DialogDescription>
              Sign below to certify this collection. Your signature will be embedded in the printable field sheet and receipt.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden touch-none">
            <canvas
              ref={sigCanvasRef}
              width={560}
              height={180}
              className="w-full h-[180px] cursor-crosshair"
              onPointerDown={sigStart}
              onPointerMove={sigMove}
              onPointerUp={sigEnd}
              onPointerLeave={sigEnd}
            />
          </div>
          <p className="text-[10px] text-gray-400 -mt-2">
            Draw with mouse, stylus or finger. Signing as <strong>{officerName}</strong> on {formatDate(collectionDate, 'dd MMM yyyy')}.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={clearSignature} className="gap-1.5">
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={skipSignature}>
              Skip
            </Button>
            <Button type="button" size="sm" onClick={saveSignature} disabled={!hasInk} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Save Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* RECEIPT DIALOG                                                */}
      {/* ============================================================ */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Collection Receipt Ready
            </DialogTitle>
            <DialogDescription>
              Week {receipt?.week} collection for {groupName} recorded on {receipt ? formatDate(receipt.date, 'dd MMM yyyy') : ''}.
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 max-h-64 overflow-y-auto">
              <div className="text-center border-b border-gray-300 pb-2 mb-2">
                <p className="text-[11px] font-black uppercase text-gray-900">Beyond Sky Micro-Credit Enterprise</p>
                <p className="text-[10px] text-gray-500">
                  {groupName} ({groupNumber}) • Week {receipt.week} • {formatDate(receipt.date, 'dd MMM yyyy')}
                </p>
                <p className="text-[10px] text-gray-500">
                  {receipt.method === 'momo' ? `MoMo${receipt.momoRef ? ` Ref: ${receipt.momoRef}` : ''}` : 'Cash'} • Officer: {officerName}
                </p>
              </div>
              <div className="space-y-1">
                {receipt.entries.map((en, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-gray-700 truncate pr-2">
                      {en.clientName}
                      {en.penalty > 0 && <span className="text-rose-600 text-[9px] ml-1">(incl. penalty {en.penalty.toFixed(2)})</span>}
                    </span>
                    <span className="font-mono font-bold text-gray-900 shrink-0">{en.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t-2 border-gray-400 pt-1.5 mt-1.5">
                  <span className="font-black text-gray-900">TOTAL</span>
                  <span className="font-mono font-black text-emerald-700">{formatCurrency(receipt.total)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={() => setReceiptOpen(false)}>
              Close
            </Button>
            <Button type="button" size="sm" onClick={printReceipt} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5">
              <Printer className="h-4 w-4" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
