'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  Building2,
  UsersRound,
  Calendar,
  ShieldCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Copy,
  Save,
  X,
} from 'lucide-react'

const DRAFT_KEY = 'beyond_sky_group_draft'

const MEETING_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const GROUP_TYPES = [
  {
    value: 'solidarity',
    label: 'Solidarity Group',
  },
  {
    value: 'individual',
    label: 'Individual Liability Group',
  },
  {
    value: 'cooperative',
    label: 'Cooperative',
  },
]

const STEP_META = [
  { title: 'Branch & Type', icon: Building2 },
  { title: 'Group Details', icon: UsersRound },
  { title: 'Meeting Schedule', icon: Calendar },
  { title: 'Rules & Capacity', icon: ShieldCheck },
  { title: 'Review & Create', icon: Check },
]

const BRANCH_SUGGESTIONS = [
  'Makola Branch',
  'Kaneshie Branch',
  'Madina Branch',
  'Achimota Branch',
  'Kaneshie Market Branch',
  'Tema Branch',
  'Kasoa Branch',
  'Circle Branch',
]

interface GroupFormState {
  branch: string
  area: string
  groupType: string
  name: string
  description: string
  meetingDay: string
  meetingPlace: string
  maxMembers: number
  minMemberTenureDays: number
  requireGuarantorChain: boolean
}

interface TemplateGroup {
  id: string
  name: string
  group_number: string | null
  branch: string | null
  area: string | null
  group_type: string | null
  description: string | null
  meeting_day: string | null
  meeting_place: string | null
  max_members: number
  min_member_tenure_days: number | null
  require_guarantor_chain: boolean | null
}

const DEFAULT_FORM: GroupFormState = {
  branch: 'Makola Branch',
  area: '',
  groupType: 'solidarity',
  name: '',
  description: '',
  meetingDay: 'Monday',
  meetingPlace: '',
  maxMembers: 15,
  minMemberTenureDays: 0,
  requireGuarantorChain: false,
}

export function GroupForm() {
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<GroupFormState>(DEFAULT_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  // Duplicate name detection
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)

  // Meeting-day suggestions from branch peers
  const [branchPeerDays, setBranchPeerDays] = useState<
    { day: string; count: number; names: string[] }[]
  >([])
  const [loadingPeers, setLoadingPeers] = useState(false)

  // Template copy
  const [templates, setTemplates] = useState<TemplateGroup[]>([])
  const [templateId, setTemplateId] = useState('')
  const [copyLoading, setCopyLoading] = useState(false)

  const update = <K extends keyof GroupFormState>(key: K, value: GroupFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key as string]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }

  // ---------- Load draft + templates on mount ----------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setForm({ ...DEFAULT_FORM, ...parsed })
        if (parsed.step >= 1 && parsed.step <= 5) setStep(parsed.step)
        if (typeof parsed.consent === 'boolean') setConsent(parsed.consent)
        toast({
          title: 'Draft restored',
          description: 'Your unsaved group draft was loaded from this browser.',
        })
      }
    } catch {
      // Corrupt draft — start clean
    }
    setHydrated(true)

    const loadTemplates = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('groups')
          .select(
            'id, name, group_number, branch, area, group_type, description, meeting_day, meeting_place, max_members, min_member_tenure_days, require_guarantor_chain'
          )
          .eq('status', 'active')
          .order('name', { ascending: true })
          .limit(100)
        if (data) setTemplates(data as TemplateGroup[])
      } catch {
        // Templates are optional
      }
    }
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Persist draft ----------
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...form, step, consent })
      )
      setDraftSaved(true)
    } catch {
      // Storage unavailable (private mode etc.)
    }
  }, [form, step, consent, hydrated])

  // ---------- Load branch peer meeting days when branch changes ----------
  useEffect(() => {
    if (!hydrated || !form.branch.trim()) {
      setBranchPeerDays([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingPeers(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('groups')
          .select('name, meeting_day')
          .ilike('branch', form.branch.trim())
          .eq('status', 'active')

        if (cancelled) return
        const byDay: Record<string, { count: number; names: string[] }> = {}
        for (const g of data ?? []) {
          const day = g.meeting_day
          if (!day) continue
          byDay[day] = byDay[day] ?? { count: 0, names: [] }
          byDay[day].count += 1
          if (byDay[day].names.length < 3) byDay[day].names.push(g.name)
        }
        setBranchPeerDays(
          MEETING_DAYS.filter((d) => byDay[d]).map((d) => ({ day: d, ...byDay[d] }))
        )
      } catch {
        if (!cancelled) setBranchPeerDays([])
      } finally {
        if (!cancelled) setLoadingPeers(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [form.branch, hydrated])

  const freeDays = useMemo(
    () => MEETING_DAYS.filter((d) => !branchPeerDays.some((p) => p.day === d)),
    [branchPeerDays]
  )

  // ---------- Duplicate name check on blur ----------
  const checkDuplicateName = async () => {
    const trimmed = form.name.trim()
    if (trimmed.length < 3) {
      setDuplicateWarning(null)
      return
    }
    setCheckingDuplicate(true)
    try {
      const res = await fetch(`/api/groups?q=${encodeURIComponent(trimmed)}`)
      const json = await res.json().catch(() => null)
      const list: any[] = Array.isArray(json)
        ? json
        : (json?.groups ?? json?.data ?? [])
      const exact = list.find(
        (g) => String(g?.name ?? '').toLowerCase().trim() === trimmed.toLowerCase()
      )
      if (exact) {
        setDuplicateWarning(
          `A group named "${exact.name}" already exists${exact.group_number ? ` (${exact.group_number})` : ''}. Consider a different name or suffix.`
        )
      } else if (list.length > 0) {
        setDuplicateWarning(
          `${list.length} group${list.length === 1 ? '' : 's'} with a similar name found: ${list
            .slice(0, 3)
            .map((g) => g.name)
            .join(', ')}.`
        )
      } else {
        setDuplicateWarning(null)
      }
    } catch {
      setDuplicateWarning(null)
    } finally {
      setCheckingDuplicate(false)
    }
  }

  // ---------- Template copy ----------
  const handleTemplateCopy = async (id: string) => {
    setTemplateId(id)
    if (!id) return
    setCopyLoading(true)
    try {
      let template: any = null
      try {
        const res = await fetch(`/api/groups/${id}`)
        if (res.ok) {
          const json = await res.json()
          template = json?.group ?? json
        }
      } catch {
        // Fall back to the locally loaded template list
      }
      if (!template || !template.id) {
        template = templates.find((t) => t.id === id)
      }
      if (!template) throw new Error('Could not load the selected group')

      setForm({
        branch: template.branch ?? DEFAULT_FORM.branch,
        area: template.area ?? '',
        groupType: template.group_type ?? 'solidarity',
        name: template.name ? `${template.name} (Copy)` : '',
        description: template.description ?? '',
        meetingDay: MEETING_DAYS.includes(template.meeting_day)
          ? template.meeting_day
          : 'Monday',
        meetingPlace: template.meeting_place ?? '',
        maxMembers:
          template.max_members >= 1 && template.max_members <= 15
            ? Number(template.max_members)
            : 15,
        minMemberTenureDays: Number(template.min_member_tenure_days ?? 0),
        requireGuarantorChain: Boolean(template.require_guarantor_chain),
      })
      setErrors({})
      setDuplicateWarning(null)
      toast({
        title: 'Template applied',
        description: `Fields pre-filled from ${template.name}. Review each step before creating.`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({ title: 'Copy failed', description: err.message, variant: 'destructive' })
    } finally {
      setCopyLoading(false)
    }
  }

  // ---------- Validation ----------
  const validateStep = (target: number): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (target >= 1) {
      if (!form.branch.trim()) errs.branch = 'Operating branch is required'
      if (!form.area.trim()) errs.area = 'Area / territory is required'
      if (!['solidarity', 'individual', 'cooperative'].includes(form.groupType)) {
        errs.groupType = 'Select a group type'
      }
    }
    if (target >= 2) {
      if (!form.name.trim()) errs.name = 'Group name is required'
      else if (form.name.trim().length < 3) errs.name = 'Group name is too short (min 3 characters)'
    }
    if (target >= 3) {
      if (!MEETING_DAYS.includes(form.meetingDay)) errs.meetingDay = 'Choose a meeting day (Mon\u2013Sat)'
      if (!form.meetingPlace.trim()) errs.meetingPlace = 'Meeting place is required'
    }
    if (target >= 4) {
      if (form.maxMembers < 1 || form.maxMembers > 15) {
        errs.maxMembers = 'Capacity must be between 1 and 15 (hard business rule)'
      }
      if (form.minMemberTenureDays < 0 || !Number.isFinite(form.minMemberTenureDays)) {
        errs.minMemberTenureDays = 'Minimum tenure cannot be negative'
      }
    }
    return errs
  }

  const goToStep = (target: number) => {
    if (target > step) {
      const errs = validateStep(target - 1)
      if (Object.keys(errs).length > 0) {
        setErrors(errs)
        toast({
          title: 'Fix the highlighted fields',
          description: Object.values(errs)[0],
          variant: 'destructive',
        })
        return
      }
    }
    setErrors({})
    setStep(target)
  }

  const handleNext = () => goToStep(step + 1)
  const handleBack = () => {
    setErrors({})
    setStep((s) => Math.max(1, s - 1))
  }

  const clearDraft = () => {
    window.localStorage.removeItem(DRAFT_KEY)
    setForm(DEFAULT_FORM)
    setConsent(false)
    setErrors({})
    setDuplicateWarning(null)
    setTemplateId('')
    setStep(1)
    setDraftSaved(false)
    toast({ title: 'Draft cleared', description: 'The form has been reset to defaults.' })
  }

  // ---------- Submit ----------
  const handleSubmit = async () => {
    const errs = validateStep(5)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      toast({
        title: 'Incomplete form',
        description: Object.values(errs)[0],
        variant: 'destructive',
      })
      return
    }
    if (!consent) {
      toast({
        title: 'Consent required',
        description: 'Confirm the group rules and capacity policy before creating.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast({ title: 'Auth error', description: 'Please sign in', variant: 'destructive' })
        return
      }

      if (form.maxMembers > 15 || form.maxMembers < 1) {
        toast({
          title: 'Invalid Capacity',
          description: 'Group capacity cannot exceed 15 members (business rule constraint)',
          variant: 'destructive',
        })
        return
      }

      // Group ID GRP-### is auto-generated by the Postgres trigger
      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: form.name.trim(),
          branch: form.branch.trim(),
          area: form.area.trim(),
          group_type: form.groupType as any,
          description: form.description.trim() || null,
          meeting_day: form.meetingDay,
          meeting_place: form.meetingPlace.trim(),
          max_members: form.maxMembers,
          min_member_tenure_days: form.minMemberTenureDays,
          require_guarantor_chain: form.requireGuarantorChain,
          created_by: user.id,
          status: 'active',
        })
        .select()
        .single()

      if (error) {
        toast({
          title: 'Failed to create group',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      window.localStorage.removeItem(DRAFT_KEY)
      toast({
        title: 'Group Created',
        description: `Group ${data.group_number} (${data.name}) created successfully.`,
        variant: 'success',
      })

      router.push(`/groups/${data.id}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // ---------- Review rows ----------
  const reviewRows: { label: string; value: string; step: number }[] = [
    { label: 'Operating Branch', value: form.branch || '\u2014', step: 1 },
    { label: 'Area / Territory', value: form.area || '\u2014', step: 1 },
    {
      label: 'Group Type',
      value: GROUP_TYPES.find((t) => t.value === form.groupType)?.label ?? form.groupType,
      step: 1,
    },
    { label: 'Group Name', value: form.name || '\u2014', step: 2 },
    { label: 'Description', value: form.description || '\u2014', step: 2 },
    { label: 'Meeting Day', value: form.meetingDay, step: 3 },
    { label: 'Meeting Place', value: form.meetingPlace || '\u2014', step: 3 },
    { label: 'Max Members', value: String(form.maxMembers), step: 4 },
    { label: 'Min Member Tenure (days)', value: String(form.minMemberTenureDays), step: 4 },
    {
      label: 'Require Guarantor Chain',
      value: form.requireGuarantorChain ? 'Yes' : 'No',
      step: 4,
    },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      {/* ---------- Template copy + draft controls ---------- */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
          <Label htmlFor="template" className="flex items-center gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5 text-blue-600" />
            Copy from existing group
          </Label>
          <div className="flex items-center gap-2">
            <select
              id="template"
              value={templateId}
              disabled={copyLoading}
              onChange={(e) => handleTemplateCopy(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">-- Start from scratch --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.group_number ? `${t.group_number} — ` : ''}
                  {t.name} ({t.branch ?? '—'})
                </option>
              ))}
            </select>
            {copyLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {draftSaved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Save className="h-3 w-3" /> Draft saved locally
            </span>
          )}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clearDraft}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear Draft
          </Button>
        </div>
      </div>

      {/* ---------- Progress bar ---------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          {STEP_META.map((s, idx) => {
            const stepNum = idx + 1
            const Icon = s.icon
            const isDone = step > stepNum
            const isCurrent = step === stepNum
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => goToStep(stepNum)}
                className="flex flex-1 flex-col items-center gap-1"
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                    isDone && 'border-blue-600 bg-blue-600 text-white',
                    isCurrent && 'border-blue-600 bg-white text-blue-600',
                    !isDone && !isCurrent && 'border-gray-200 bg-white text-gray-400'
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={cn(
                    'hidden text-[10px] font-medium sm:block',
                    isCurrent ? 'text-blue-700' : 'text-gray-400'
                  )}
                >
                  {stepNum}. {s.title}
                </span>
              </button>
            )
          })}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(step / STEP_META.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ---------- Step panels ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-gray-900">
            Step {step} of 5 — {STEP_META[step - 1].title}
          </CardTitle>
          <CardDescription>
            {step === 1 && 'Where does the group operate and what liability model does it follow?'}
            {step === 2 && 'Name the group and describe its purpose.'}
            {step === 3 && 'When and where the group meets each week.'}
            {step === 4 && 'Capacity hard cap, tenure requirements and guarantor chain policy.'}
            {step === 5 && 'Review everything, confirm consent and create the group.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ===== Step 1: Branch & Type ===== */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Operating Branch *</Label>
                  <Input
                    id="branch"
                    list="branch-suggestions"
                    value={form.branch}
                    onChange={(e) => update('branch', e.target.value)}
                    placeholder="e.g. Makola Branch"
                    autoFocus
                  />
                  <datalist id="branch-suggestions">
                    {BRANCH_SUGGESTIONS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                  {errors.branch && <p className="text-xs text-red-600">{errors.branch}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="area">Area / Territory *</Label>
                  <Input
                    id="area"
                    value={form.area}
                    onChange={(e) => update('area', e.target.value)}
                    placeholder="e.g. Central Market Area"
                  />
                  {errors.area && <p className="text-xs text-red-600">{errors.area}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Group Type *</Label>
                <div className="space-y-2">
                  {GROUP_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                        form.groupType === t.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name="group_type"
                        value={t.value}
                        checked={form.groupType === t.value}
                        onChange={() => update('groupType', t.value)}
                        className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="block text-sm font-semibold text-gray-900">{t.label}</span>
                    </label>
                  ))}
                </div>
                {errors.groupType && <p className="text-xs text-red-600">{errors.groupType}</p>}
              </div>
            </>
          )}

          {/* ===== Step 2: Group Details ===== */}
          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Group Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Makola Market Tomato Traders Group A"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  onBlur={checkDuplicateName}
                  autoFocus
                />
                {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
                {checkingDuplicate && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking for duplicates...
                  </p>
                )}
                {duplicateWarning && !checkingDuplicate && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="What does this group do? e.g. Weekly susu contributions and 13-week cycle loans for tomato wholesalers in Shed 4."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* ===== Step 3: Meeting Schedule ===== */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="meetingDay">Weekly Meeting Day *</Label>
                  <select
                    id="meetingDay"
                    value={form.meetingDay}
                    onChange={(e) => update('meetingDay', e.target.value)}
                    className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MEETING_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  {errors.meetingDay && <p className="text-xs text-red-600">{errors.meetingDay}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meetingPlace">Meeting Place / Center *</Label>
                  <Input
                    id="meetingPlace"
                    value={form.meetingPlace}
                    onChange={(e) => update('meetingPlace', e.target.value)}
                    placeholder="e.g. Makola Market Shed 4"
                  />
                  {errors.meetingPlace && (
                    <p className="text-xs text-red-600">{errors.meetingPlace}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  Meeting days used by other groups at {form.branch || 'this branch'}
                </p>
                {loadingPeers ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading branch schedule...
                  </p>
                ) : branchPeerDays.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    No other active groups found at this branch — any day works.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {branchPeerDays.map((p) => {
                      const isSelected = form.meetingDay === p.day
                      return (
                        <li
                          key={p.day}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                            isSelected
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-gray-200 bg-white text-gray-600'
                          )}
                        >
                          <span className="font-medium">
                            {p.day} — {p.count} group{p.count === 1 ? '' : 's'} (
                            {p.names.join(', ')})
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Conflict
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {freeDays.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">Suggested free days:</span>
                    {freeDays.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => update('meetingDay', d)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                          form.meetingDay === d
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== Step 4: Rules & Capacity ===== */}
          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="maxMembers">
                  Max Members (Hard Cap: 15) * — currently{' '}
                  <span className="font-bold text-blue-700">{form.maxMembers}</span>
                </Label>
                <input
                  id="maxMembers"
                  type="range"
                  min={1}
                  max={15}
                  step={1}
                  value={form.maxMembers}
                  onChange={(e) => update('maxMembers', parseInt(e.target.value) || 15)}
                  className="w-full accent-blue-600"
                />
                <div className="flex items-center gap-[3px]">
                  {Array.from({ length: 15 }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-4 flex-1 rounded-sm transition-colors',
                        i < form.maxMembers ? 'bg-blue-500' : 'bg-gray-200'
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500">Hard cap: 15 members.</p>
                {errors.maxMembers && <p className="text-xs text-red-600">{errors.maxMembers}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="minTenure">Minimum Member Tenure (days)</Label>
                <Input
                  id="minTenure"
                  type="number"
                  min={0}
                  max={365}
                  value={form.minMemberTenureDays}
                  onChange={(e) =>
                    update('minMemberTenureDays', parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-gray-500">Use 0 for no minimum.</p>
                {errors.minMemberTenureDays && (
                  <p className="text-xs text-red-600">{errors.minMemberTenureDays}</p>
                )}
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 p-3">
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    Require Guarantor Chain
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Each member guarantees the next.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.requireGuarantorChain}
                  onClick={() => update('requireGuarantorChain', !form.requireGuarantorChain)}
                  className={cn(
                    'relative ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                    form.requireGuarantorChain ? 'bg-blue-600' : 'bg-gray-300'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      form.requireGuarantorChain ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </label>
            </>
          )}

          {/* ===== Step 5: Review & Create ===== */}
          {step === 5 && (
            <>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {reviewRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        {row.label}
                      </p>
                      <p className="truncate text-sm font-semibold text-gray-900">{row.value}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(row.step)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Edit →
                    </button>
                  </div>
                ))}
              </div>

              {duplicateWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{duplicateWarning}</span>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-600">
                  I confirm the details above are accurate, the group has been briefed on the{' '}
                  <strong>{form.maxMembers}-member hard cap</strong>, the {form.meetingDay} meeting
                  schedule, and — where applicable — the guarantor chain and minimum tenure rules.
                </span>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- Navigation ---------- */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/groups">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>

        <div className="flex items-center gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
          {step < 5 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="min-w-[120px] bg-blue-600 hover:bg-blue-700"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !consent}
              className="min-w-[140px] bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Create Group
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
