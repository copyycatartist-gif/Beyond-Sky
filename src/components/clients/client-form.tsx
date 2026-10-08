'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import {
  Loader2, User, MapPin, Church, ShieldCheck, ChevronLeft,
  ChevronRight, Check, AlertTriangle, Save, Eye, Phone, Search, Camera, X
} from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'
import type { MaritalStatus } from '@/lib/supabase/database.types'

const ghanaPhoneRegex = /^(0[235]\d{8}|\+233[235]\d{8})$/
const ghanaIdRegex = /^GHA-\d{9}-\d$/i

/** Strip spaces/dashes so formatted input like "024 412 3456" still validates. */
function normalizeGhanaPhone(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`
  }
  return trimmed.replace(/\D/g, '')
}

const ghanaPhoneField = (message: string) =>
  z.string().refine((val) => ghanaPhoneRegex.test(normalizeGhanaPhone(val)), message)

const clientSchema = z.object({
  full_name: z.string().min(3, 'Full name must be at least 3 characters'),
  phone_number: ghanaPhoneField('Enter a valid Ghana phone (e.g. 0241234567)'),
  national_id: z.string().regex(ghanaIdRegex, 'Format: GHA-#########-#'),
  spouse_or_father_name: z.string().min(2, 'Required'),
  age: z.coerce.number().min(18, 'Must be 18+').max(90, 'Must be under 90').optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  marital_status: z.enum(['married', 'unmarried', 'abandoned', 'divorced', 'widow']),
  present_address: z.string().min(5, 'Address required'),
  permanent_address: z.string().min(3, 'Required'),
  business_address: z.string().optional().or(z.literal('')),
  business_type: z.string().min(2, 'Required'),
  market_location: z.string().min(2, 'Required'),
  monthly_income: z.coerce.number().positive('Monthly income is required'),
  religion: z.string().min(2, 'Required'),
  place_of_worship: z.string().min(2, 'Required'),
  religious_leader_name: z.string().min(2, 'Required'),
  religious_leader_phone: ghanaPhoneField('Valid Ghana phone required'),
  guarantor_name: z.string().min(3, 'Required'),
  guarantor_gender: z.enum(['male', 'female']),
  guarantor_phone: ghanaPhoneField('Valid Ghana phone required'),
  guarantor_occupation: z.string().min(2, 'Required'),
  guarantor_employer: z.string().optional().or(z.literal('')),
  guarantor_residential_address: z.string().min(5, 'Required'),
  branch: z.string().trim().min(2, 'Branch is required'),
  area: z.string().optional().or(z.literal('')),
  data_protection_consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
})

type FormData = z.input<typeof clientSchema> & { data_protection_consent: boolean }

const STEPS = [
  { id: 0, title: 'Personal Information', icon: User },
  { id: 1, title: 'Business & Address', icon: MapPin },
  { id: 2, title: 'Faith Reference', icon: Church },
  { id: 3, title: 'Guarantor', icon: ShieldCheck },
  { id: 4, title: 'Review & Submit', icon: Check },
]

function formatGhanaPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('233')) {
    const local = digits.slice(3)
    if (local.length <= 2) return `+233 ${local}`
    if (local.length <= 5) return `+233 ${local.slice(0, 2)} ${local.slice(2)}`
    if (local.length <= 8) return `+233 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
    return `+233 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 9)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`
}

function formatGhanaId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
  if (!cleaned.startsWith('GHA')) {
    const digits = cleaned.replace(/\D/g, '')
    if (digits.length <= 9) return `GHA-${digits}`
    return `GHA-${digits.slice(0, 9)}-${digits.slice(9, 10)}`
  }
  const parts = cleaned.split('-')
  if (parts.length === 1) {
    const digits = parts[0].slice(3).replace(/\D/g, '')
    if (digits.length <= 9) return `GHA-${digits}`
    return `GHA-${digits.slice(0, 9)}-${digits.slice(9, 10)}`
  }
  if (parts.length === 2) {
    const digits = parts[1].replace(/\D/g, '')
    if (digits.length <= 9) return `GHA-${digits}`
    return `GHA-${digits.slice(0, 9)}-${digits.slice(9, 10)}`
  }
  return `GHA-${(parts[1] || '').slice(0, 9)}-${(parts[2] || '').slice(0, 1)}`
}

export function ClientForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicateWarning, setDuplicateWarning] = useState<any[] | null>(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef<string>('beyond_sky_client_draft')

  const [formData, setFormData] = useState<FormData>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(draftRef.current)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          return { ...parsed, branch: parsed.branch || '' }
        } catch {}
      }
    }
    return {
      branch: '',
      area: '',
      full_name: '',
      phone_number: '',
      national_id: '',
      spouse_or_father_name: '',
      age: '',
      date_of_birth: '',
      marital_status: 'married' as MaritalStatus,
      present_address: '',
      permanent_address: '',
      business_address: '',
      business_type: '',
      market_location: '',
      monthly_income: '',
      religion: 'Christianity',
      place_of_worship: '',
      religious_leader_name: '',
      religious_leader_phone: '',
      guarantor_name: '',
      guarantor_gender: 'male' as const,
      guarantor_phone: '',
      guarantor_occupation: '',
      guarantor_employer: '',
      guarantor_residential_address: '',
      data_protection_consent: false as any,
    }
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(draftRef.current, JSON.stringify(formData))
    }, 1000)
    return () => clearTimeout(timer)
  }, [formData])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const updated = { ...prev, [name]: value } as any

      if (name === 'date_of_birth' && value) {
        const dob = new Date(value)
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        if (age >= 18 && age <= 90) updated.age = age.toString()
      }

      return updated
    })
    if (errors[name]) {
      setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target
    const formatted = formatGhanaPhone(e.target.value)
    setFormData(prev => ({ ...prev, [name]: formatted }) as any)
    if (errors[name]) {
      setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
    }
  }

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target
    const formatted = formatGhanaId(e.target.value)
    setFormData(prev => ({ ...prev, [name]: formatted }) as any)
    if (errors[name]) {
      setErrors(prev => { const next = { ...prev }; delete next[name]; return next })
    }
  }

  const checkDuplicates = useCallback(async () => {
    const phone = (formData.phone_number || '').replace(/\s/g, '')
    const nationalId = formData.national_id || ''
    if (!phone && !nationalId) return

    setCheckingDuplicate(true)
    try {
      const res = await fetch('/api/clients/duplicate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, nationalId }),
      })
      if (res.ok) {
        const data = await res.json()
        setDuplicateWarning(data.hasDuplicates ? data.duplicates : null)
      }
    } finally {
      setCheckingDuplicate(false)
    }
  }, [formData.phone_number, formData.national_id])

  useEffect(() => {
    if (currentStep === 0 && formData.phone_number && formData.national_id) {
      const timer = setTimeout(checkDuplicates, 800)
      return () => clearTimeout(timer)
    }
  }, [currentStep, formData.phone_number, formData.national_id, checkDuplicates])

  const STEP_FIELDS: Record<number, string[]> = {
    0: ['full_name', 'phone_number', 'national_id', 'spouse_or_father_name', 'marital_status', 'branch'],
    1: ['present_address', 'permanent_address', 'business_type', 'market_location', 'monthly_income'],
    2: ['religion', 'place_of_worship', 'religious_leader_name', 'religious_leader_phone'],
    3: [
      'guarantor_name',
      'guarantor_gender',
      'guarantor_phone',
      'guarantor_occupation',
      'guarantor_residential_address',
    ],
    4: ['data_protection_consent'],
  }

  const stepForField = (field: string): number => {
    for (const [step, fields] of Object.entries(STEP_FIELDS)) {
      if (fields.includes(field)) return Number(step)
    }
    return 0
  }

  const earliestErrorStep = (fieldErrors: Record<string, string>): number => {
    const steps = Object.keys(fieldErrors).map(stepForField)
    return steps.length > 0 ? Math.min(...steps) : 0
  }

  const validateStep = (step: number): boolean => {
    const fields = STEP_FIELDS[step] || []
    const partialSchema = clientSchema.pick(Object.fromEntries(fields.map(f => [f, true])) as any)
    const result = partialSchema.safeParse(formData)

    if (!result.success) {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach(issue => {
        const field = issue.path[0] as string
        if (!newErrors[field]) newErrors[field] = issue.message
      })
      setErrors(prev => ({ ...prev, ...newErrors }))
      return false
    }
    // Clear errors for fields on this step when it passes
    setErrors(prev => {
      const next = { ...prev }
      fields.forEach(f => { delete next[f] })
      return next
    })
    return true
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Enter on earlier steps must advance, not run full submit (consent lives on Review)
    if (currentStep < STEPS.length - 1) {
      nextStep()
      return
    }

    const result = clientSchema.safeParse(formData)
    if (!result.success) {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach(issue => {
        const field = issue.path[0] as string
        if (!newErrors[field]) newErrors[field] = issue.message
      })
      setErrors(newErrors)
      setCurrentStep(earliestErrorStep(newErrors))
      toast({ title: 'Validation errors', description: 'Please fix the highlighted fields.', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast({ title: 'Authentication error', description: 'Please sign in first', variant: 'destructive' })
        return
      }

      const dupRes = await fetch('/api/clients/duplicate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: (formData.phone_number as string).replace(/\s/g, ''),
          nationalId: formData.national_id,
        }),
      })
      if (dupRes.ok) {
        const dup = await dupRes.json()
        const archived = (dup.duplicates || []).find((item: any) => item.client?.archived_at)
        if (archived) {
          toast({
            title: 'Restore the archived client',
            description: `This phone or Ghana Card belongs to archived client ${archived.client.full_name} (${archived.client.account_number}). Restore that account instead of creating a new one.`,
            variant: 'destructive',
          })
          return
        }
      }

      const { data, error } = await supabase
        .from('clients')
        .insert({
          full_name: formData.full_name.trim(),
          phone_number: (formData.phone_number as string).replace(/\s/g, ''),
          national_id: formData.national_id.trim(),
          branch: formData.branch?.trim() || null,
          area: formData.area?.trim() || null,
          spouse_or_father_name: formData.spouse_or_father_name?.trim() || null,
          age: formData.age ? parseInt(formData.age as any) : null,
          date_of_birth: formData.date_of_birth || null,
          marital_status: formData.marital_status,
          residential_address: formData.present_address?.trim() || null,
          permanent_address: formData.permanent_address?.trim() || null,
          business_address: formData.business_address?.trim() || null,
          business_type: formData.business_type.trim(),
          market_location: formData.market_location.trim(),
          daily_business_income: null,
          monthly_income: Number(formData.monthly_income),
          religion: formData.religion?.trim() || null,
          place_of_worship: formData.place_of_worship?.trim() || null,
          religious_leader_name: formData.religious_leader_name?.trim() || null,
          religious_leader_phone: (formData.religious_leader_phone as string)?.replace(/\s/g, '') || null,
          guarantor_name: formData.guarantor_name.trim(),
          guarantor_gender: formData.guarantor_gender,
          guarantor_phone: (formData.guarantor_phone as string).replace(/\s/g, ''),
          guarantor_national_id: null,
          guarantor_relationship: null,
          guarantor_business: formData.guarantor_occupation?.trim() || 'Self-Employed',
          guarantor_occupation: formData.guarantor_occupation?.trim() || null,
          guarantor_employer: formData.guarantor_employer?.trim() || null,
          guarantor_dob: null,
          guarantor_residential_address: formData.guarantor_residential_address?.trim() || null,
          guarantor_religion: null,
          guarantor_place_of_worship: null,
          data_protection_consent: true,
          consent_date: new Date().toISOString(),
          created_by: user.id,
          status: 'active',
        })
        .select()
        .single()

      if (error) {
        toast({ title: 'Registration failed', description: error.message, variant: 'destructive' })
        return
      }

      // Upload photo if selected
      if (photoFile && data.id) {
        try {
          const photoForm = new FormData()
          photoForm.append('photo', photoFile)
          photoForm.append('clientId', data.id)
          await fetch('/api/clients/photo', { method: 'POST', body: photoForm })
        } catch {
          // Photo upload failure is non-fatal
        }
      }

      // Welcome SMS — best-effort; never block registration
      if (data.id) {
        try {
          await fetch('/api/clients/welcome-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: data.id }),
          })
        } catch {
          // SMS failure is non-fatal
        }
      }

      localStorage.removeItem(draftRef.current)
      if (photoPreview) URL.revokeObjectURL(photoPreview)

      toast({
        title: 'Client Onboarded Successfully',
        description: `Account Generated: ${data.account_number} (${data.full_name})`,
        variant: 'success',
      })

      router.push(`/clients/${data.id}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'An unexpected error occurred', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const clearDraft = () => {
    localStorage.removeItem(draftRef.current)
    router.refresh()
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Photo must be under 5MB', variant: 'destructive' })
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const errorCount = Object.keys(errors).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      {/* Progress Steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between overflow-x-auto gap-1">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon
            const isComplete = idx < currentStep
            const isCurrent = idx === currentStep
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => { if (idx < currentStep) setCurrentStep(idx) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isCurrent ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :
                  isComplete ? 'text-emerald-700 hover:bg-emerald-50 cursor-pointer' :
                  'text-gray-400'
                }`}
                disabled={idx > currentStep}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isCurrent ? 'bg-blue-600 text-white' :
                  isComplete ? 'bg-emerald-500 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {isComplete ? <Check className="h-3 w-3" /> : idx + 1}
                </span>
                <span className="hidden sm:inline">{step.title}</span>
                <StepIcon className={`h-3.5 w-3.5 sm:hidden ${isCurrent ? 'text-blue-600' : ''}`} />
              </button>
            )
          })}
        </div>
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Error Summary */}
      {errorCount > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">{errorCount} field{errorCount > 1 ? 's' : ''} need attention</p>
            <ul className="text-xs text-red-600 mt-1 space-y-0.5">
              {Object.entries(errors).slice(0, 5).map(([field, msg]) => (
                <li key={field}>• {field.replace(/_/g, ' ')}: {msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Duplicate Warning */}
      {duplicateWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {duplicateWarning.some((d: any) => d.client?.archived_at)
                ? 'This person is already archived'
                : 'Possible duplicate detected'}
            </p>
            <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
              {duplicateWarning.map((d: any, i: number) => (
                <li key={i}>
                  • {d.client.full_name} ({d.client.account_number}) matches on {d.field.replace('_', ' ')}
                  {d.client.archived_at ? ' — archived. Restore that account instead of creating a new one.' : ''}
                  {!d.client.archived_at && (
                    <Link href={`/clients/${d.client.id}`} className="ml-1 text-blue-600 hover:underline">View →</Link>
                  )}
                </li>
              ))}
            </ul>
            {!duplicateWarning.some((d: any) => d.client?.archived_at) && (
              <p className="text-[11px] text-amber-600 mt-1">You can still proceed if this is a different person.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 0: Personal */}
      {currentStep === 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              1. Applicant Personal Information
            </CardTitle>
            <CardDescription>Full KYC details as captured on the physical loan application form.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full_name">Full Name (as on Ghana Card) *</Label>
              <Input id="full_name" name="full_name" placeholder="e.g. Mary Akosua Mensah" value={formData.full_name} onChange={handleChange} required />
              {errors.full_name && <p className="text-xs text-red-500">{errors.full_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spouse_or_father_name">Husband / Wife / Father's Name *</Label>
              <Input id="spouse_or_father_name" name="spouse_or_father_name" placeholder="e.g. Kwame Mensah" value={formData.spouse_or_father_name || ''} onChange={handleChange} required />
              {errors.spouse_or_father_name && <p className="text-xs text-red-500">{errors.spouse_or_father_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone_number">Primary Telephone *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input id="phone_number" name="phone_number" placeholder="024 123 4567" value={formData.phone_number} onChange={handlePhoneChange} className="pl-9" required />
              </div>
              {errors.phone_number && <p className="text-xs text-red-500">{errors.phone_number}</p>}
              {checkingDuplicate && <p className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking...</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="national_id">Ghana Card / National ID *</Label>
              <Input id="national_id" name="national_id" placeholder="GHA-712345678-9" value={formData.national_id} onChange={handleIdChange} required />
              {errors.national_id && <p className="text-xs text-red-500">{errors.national_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch *</Label>
              <Input id="branch" name="branch" value={formData.branch || ''} onChange={handleChange} placeholder="e.g. Zongo" required />
              {errors.branch && <p className="text-xs text-red-500">{errors.branch}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Area / Zone</Label>
              <Input id="area" name="area" value={formData.area} onChange={handleChange} placeholder="e.g. Market area" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marital_status">Marital Status *</Label>
              <select id="marital_status" name="marital_status" value={formData.marital_status} onChange={handleChange}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="married">Married</option>
                <option value="unmarried">Unmarried (Single)</option>
                <option value="abandoned">Abandoned</option>
                <option value="divorced">Divorced</option>
                <option value="widow">Widow</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input id="date_of_birth" name="date_of_birth" type="date" value={formData.date_of_birth || ''} onChange={handleChange} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="age">Age (auto from DOB)</Label>
              <Input id="age" name="age" type="number" min="18" max="90" placeholder="38" value={formData.age as any || ''} onChange={handleChange} />
              {errors.age && <p className="text-xs text-red-500">{errors.age}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Business & Address */}
      {currentStep === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              2. Addresses, Business & Cashflow
            </CardTitle>
            <CardDescription>Residential addresses, trading stall location, and monthly income.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="present_address">Present Residential Address *</Label>
              <Input id="present_address" name="present_address" placeholder="Hse No. B14/2, Near Makola Post Office" value={formData.present_address || ''} onChange={handleChange} required />
              {errors.present_address && <p className="text-xs text-red-500">{errors.present_address}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="permanent_address">Permanent Address (Home Town / Region) *</Label>
              <Input id="permanent_address" name="permanent_address" placeholder="Mampong, Ashanti Region" value={formData.permanent_address || ''} onChange={handleChange} required />
              {errors.permanent_address && <p className="text-xs text-red-500">{errors.permanent_address}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business_type">Type of Business *</Label>
              <Input id="business_type" name="business_type" placeholder="Foodstuff trader, Seamstress" value={formData.business_type} onChange={handleChange} required />
              {errors.business_type && <p className="text-xs text-red-500">{errors.business_type}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="market_location">Market Location / Stall *</Label>
              <Input id="market_location" name="market_location" placeholder="Makola Market Shed 4, Stall 12" value={formData.market_location} onChange={handleChange} required />
              {errors.market_location && <p className="text-xs text-red-500">{errors.market_location}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthly_income">Monthly Income (GHS) *</Label>
              <Input id="monthly_income" name="monthly_income" type="number" min="1" step="0.01" placeholder="2400" value={formData.monthly_income as any} onChange={handleChange} required />
              {errors.monthly_income && <p className="text-xs text-red-500">{errors.monthly_income}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="business_address">Detailed Business Address</Label>
              <Input id="business_address" name="business_address" placeholder="Corner of Pagan Road and Derby Avenue" value={formData.business_address || ''} onChange={handleChange} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Religion */}
      {currentStep === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <Church className="h-4 w-4 text-blue-600" />
              3. Religion & Spiritual Leadership Reference
            </CardTitle>
            <CardDescription>Place of worship and religious leader reference as required by Beyond Sky terms.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="religion">Religion *</Label>
              <Input id="religion" name="religion" placeholder="Christianity, Islam" value={formData.religion || ''} onChange={handleChange} required />
              {errors.religion && <p className="text-xs text-red-500">{errors.religion}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="place_of_worship">Place of Worship *</Label>
              <Input id="place_of_worship" name="place_of_worship" placeholder="Church of Pentecost, Makola Assembly" value={formData.place_of_worship || ''} onChange={handleChange} required />
              {errors.place_of_worship && <p className="text-xs text-red-500">{errors.place_of_worship}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="religious_leader_name">Pastor / Imam Name *</Label>
              <Input id="religious_leader_name" name="religious_leader_name" placeholder="Pastor Daniel Ofori" value={formData.religious_leader_name || ''} onChange={handleChange} required />
              {errors.religious_leader_name && <p className="text-xs text-red-500">{errors.religious_leader_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="religious_leader_phone">Pastor / Imam Phone *</Label>
              <Input id="religious_leader_phone" name="religious_leader_phone" placeholder="024 456 7890" value={formData.religious_leader_phone || ''} onChange={handlePhoneChange} required />
              {errors.religious_leader_phone && <p className="text-xs text-red-500">{errors.religious_leader_phone}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Guarantor */}
      {currentStep === 3 && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3 bg-indigo-50/40 rounded-t-xl border-b border-indigo-100">
            <CardTitle className="text-base text-indigo-950 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              4. Guarantor's Personal Information
            </CardTitle>
            <CardDescription className="text-indigo-700 text-xs">Complete guarantor profile backing the credit agreement.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="guarantor_name">Guarantor Full Name *</Label>
              <Input id="guarantor_name" name="guarantor_name" placeholder="Yaw Boateng" value={formData.guarantor_name} onChange={handleChange} required />
              {errors.guarantor_name && <p className="text-xs text-red-500">{errors.guarantor_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guarantor_gender">Gender *</Label>
              <select id="guarantor_gender" name="guarantor_gender" value={formData.guarantor_gender} onChange={handleChange}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guarantor_phone">Guarantor Phone *</Label>
              <Input id="guarantor_phone" name="guarantor_phone" placeholder="020 987 6543" value={formData.guarantor_phone} onChange={handlePhoneChange} required />
              {errors.guarantor_phone && <p className="text-xs text-red-500">{errors.guarantor_phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guarantor_occupation">Occupation *</Label>
              <Input id="guarantor_occupation" name="guarantor_occupation" placeholder="Civil Servant, Trader" value={formData.guarantor_occupation || ''} onChange={handleChange} required />
              {errors.guarantor_occupation && <p className="text-xs text-red-500">{errors.guarantor_occupation}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guarantor_employer">Employer</Label>
              <Input id="guarantor_employer" name="guarantor_employer" placeholder="Ghana Education Service / Self" value={formData.guarantor_employer || ''} onChange={handleChange} />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="guarantor_residential_address">Guarantor Residence Address *</Label>
              <Input id="guarantor_residential_address" name="guarantor_residential_address" placeholder="Hse No. 44, Near Shell, Achimota" value={formData.guarantor_residential_address || ''} onChange={handleChange} required />
              {errors.guarantor_residential_address && <p className="text-xs text-red-500">{errors.guarantor_residential_address}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review & Submit */}
      {currentStep === 4 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              5. Review & Confirm Registration
            </CardTitle>
            <CardDescription>Please verify all details before submitting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5">
                <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Personal</p>
                <p><span className="text-gray-400">Name:</span> <span className="font-medium">{formData.full_name}</span></p>
                <p><span className="text-gray-400">Phone:</span> <span className="font-mono">{formData.phone_number}</span></p>
                <p><span className="text-gray-400">ID:</span> <span className="font-mono">{formData.national_id}</span></p>
                <p><span className="text-gray-400">Marital:</span> {formData.marital_status}</p>
                <p><span className="text-gray-400">Branch:</span> {formData.branch || '—'}</p>
                <p><span className="text-gray-400">Area:</span> {formData.area || '—'}</p>
                <button type="button" onClick={() => setCurrentStep(0)} className="text-blue-600 hover:underline text-[11px]">Edit →</button>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5">
                <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Business</p>
                <p><span className="text-gray-400">Type:</span> <span className="font-medium">{formData.business_type}</span></p>
                <p><span className="text-gray-400">Market:</span> {formData.market_location}</p>
                <p><span className="text-gray-400">Monthly income:</span> {formData.monthly_income ? `GHS ${formData.monthly_income}` : '—'}</p>
                <button type="button" onClick={() => setCurrentStep(1)} className="text-blue-600 hover:underline text-[11px]">Edit →</button>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5">
                <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider">Religious Reference</p>
                <p><span className="text-gray-400">Religion:</span> {formData.religion}</p>
                <p><span className="text-gray-400">Worship:</span> {formData.place_of_worship}</p>
                <p><span className="text-gray-400">Leader:</span> {formData.religious_leader_name}</p>
                <button type="button" onClick={() => setCurrentStep(2)} className="text-blue-600 hover:underline text-[11px]">Edit →</button>
              </div>
              <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-1.5">
                <p className="font-semibold text-indigo-800 text-[11px] uppercase tracking-wider">Guarantor</p>
                <p><span className="text-gray-400">Name:</span> <span className="font-medium">{formData.guarantor_name}</span></p>
                <p><span className="text-gray-400">Phone:</span> <span className="font-mono">{formData.guarantor_phone}</span></p>
                <button type="button" onClick={() => setCurrentStep(3)} className="text-blue-600 hover:underline text-[11px]">Edit →</button>
              </div>
            </div>

            {/* Photo Capture */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wider mb-2">Client Photo (optional)</p>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white shrink-0">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Client preview" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-gray-300" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Search className="h-3 w-3" />
                    Browse Files
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-3 w-3" />
                    Take Photo
                  </Button>
                  {photoPreview && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1 text-red-500" onClick={clearPhoto}>
                      <X className="h-3 w-3" />
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoSelect} />
              </div>
              {photoFile && (
                <p className="text-[11px] text-gray-500 mt-2">{photoFile.name} ({(photoFile.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>

            {/* Consent */}
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="data_protection_consent"
                  checked={formData.data_protection_consent === true}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setFormData(prev => ({ ...prev, data_protection_consent: checked }) as any)
                    if (checked) {
                      setErrors(prev => {
                        const next = { ...prev }
                        delete next.data_protection_consent
                        return next
                      })
                    }
                  }}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span className="text-xs text-gray-700">
                  I confirm that the client has given informed consent for Beyond Sky Micro-Credit Enterprise to collect,
                  process, and store their personal data in accordance with Ghana's Data Protection Act 2012 (Act 843).
                  The client has been informed of their right to access and rectify their data. *
                </span>
              </label>
              {errors.data_protection_consent && <p className="text-xs text-red-500 mt-1 ml-6">{errors.data_protection_consent}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button type="button" variant="outline" onClick={prevStep} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-gray-600" onClick={clearDraft}>
            <Save className="h-3 w-3 mr-1" />
            Clear Draft
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {currentStep < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 gap-1.5 min-w-[120px] h-11">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 min-w-[220px] h-11 text-sm font-semibold shadow-md gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registering Client...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Complete Registration
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Cancel link */}
      <div className="text-center">
        <Link href="/clients" className="text-xs text-gray-400 hover:text-gray-600">
          Cancel and return to Clients Directory
        </Link>
      </div>
    </form>
  )
}
