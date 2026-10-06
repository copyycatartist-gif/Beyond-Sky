'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit3, Loader2, X } from 'lucide-react'
import type { MaritalStatus } from '@/lib/supabase/database.types'

interface ClientData {
  id: string
  full_name: string
  phone_number: string
  national_id: string
  spouse_or_father_name: string | null
  age: number | null
  date_of_birth: string | null
  marital_status: MaritalStatus
  residential_address: string | null
  permanent_address: string | null
  business_address: string | null
  business_type: string
  market_location: string
  daily_business_income: number
  monthly_income: number | null
  religion: string | null
  place_of_worship: string | null
  religious_leader_name: string | null
  religious_leader_phone: string | null
  branch: string | null
  area: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null
  notes?: string | null
}

export function ClientEditDialog({ client }: { client: ClientData }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: client.full_name,
    phone_number: client.phone_number,
    national_id: client.national_id,
    spouse_or_father_name: client.spouse_or_father_name || '',
    age: client.age?.toString() || '',
    date_of_birth: client.date_of_birth || '',
    marital_status: client.marital_status || 'married',
    residential_address: client.residential_address || '',
    permanent_address: client.permanent_address || '',
    business_address: client.business_address || '',
    business_type: client.business_type,
    market_location: client.market_location,
    daily_business_income: client.daily_business_income.toString(),
    monthly_income: (client.monthly_income || 0).toString(),
    religion: client.religion || '',
    place_of_worship: client.place_of_worship || '',
    religious_leader_name: client.religious_leader_name || '',
    religious_leader_phone: client.religious_leader_phone || '',
    branch: client.branch || '',
    area: client.area || '',
    emergency_contact_name: client.emergency_contact_name || '',
    emergency_contact_phone: client.emergency_contact_phone || '',
    emergency_contact_relationship: client.emergency_contact_relationship || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: value }
      if (name === 'daily_business_income' && value) {
        updated.monthly_income = (parseFloat(value) * 26).toFixed(2)
      }
      if (name === 'date_of_birth' && value) {
        const dob = new Date(value)
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        updated.age = age.toString()
      }
      return updated
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/clients/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          ...form,
          age: form.age ? parseInt(form.age) : null,
          daily_business_income: parseFloat(form.daily_business_income) || 0,
          monthly_income: parseFloat(form.monthly_income) || 0,
        }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}>
        <Edit3 className="h-3.5 w-3.5" />
        Edit
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Edit client">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-gray-900">Edit Client: {client.full_name}</h2>
          <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Personal */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Personal Information</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-full_name">Full Name *</Label>
                <Input id="edit-full_name" name="full_name" value={form.full_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-phone">Phone *</Label>
                <Input id="edit-phone" name="phone_number" value={form.phone_number} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-nid">National ID *</Label>
                <Input id="edit-nid" name="national_id" value={form.national_id} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-spouse">Spouse / Father</Label>
                <Input id="edit-spouse" name="spouse_or_father_name" value={form.spouse_or_father_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-dob">Date of Birth</Label>
                <Input id="edit-dob" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-age">Age</Label>
                <Input id="edit-age" name="age" type="number" value={form.age} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-marital">Marital Status</Label>
                <select id="edit-marital" name="marital_status" value={form.marital_status} onChange={handleChange}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                  <option value="married">Married</option>
                  <option value="unmarried">Unmarried</option>
                  <option value="abandoned">Abandoned</option>
                  <option value="divorced">Divorced</option>
                  <option value="widow">Widow</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Business */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Business & Address</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-btype">Business Type *</Label>
                <Input id="edit-btype" name="business_type" value={form.business_type} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-market">Market Location *</Label>
                <Input id="edit-market" name="market_location" value={form.market_location} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-daily">Daily Income (GHS) *</Label>
                <Input id="edit-daily" name="daily_business_income" type="number" step="0.01" value={form.daily_business_income} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-monthly">Monthly Income (GHS)</Label>
                <Input id="edit-monthly" name="monthly_income" type="number" step="0.01" value={form.monthly_income} onChange={handleChange} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-residential">Residential Address</Label>
                <Input id="edit-residential" name="residential_address" value={form.residential_address} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-permanent">Permanent Address</Label>
                <Input id="edit-permanent" name="permanent_address" value={form.permanent_address} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-baddress">Business Address</Label>
                <Input id="edit-baddress" name="business_address" value={form.business_address} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-area">Area</Label>
                <Input id="edit-area" name="area" value={form.area} onChange={handleChange} />
              </div>
            </div>
          </fieldset>

          {/* Religion */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Religious Reference</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-religion">Religion</Label>
                <Input id="edit-religion" name="religion" value={form.religion} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-worship">Place of Worship</Label>
                <Input id="edit-worship" name="place_of_worship" value={form.place_of_worship} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-leader">Religious Leader</Label>
                <Input id="edit-leader" name="religious_leader_name" value={form.religious_leader_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-leaderphone">Leader Phone</Label>
                <Input id="edit-leaderphone" name="religious_leader_phone" value={form.religious_leader_phone} onChange={handleChange} />
              </div>
            </div>
          </fieldset>

          {/* Emergency Contact */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Emergency Contact</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-ecname">Name</Label>
                <Input id="edit-ecname" name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-ecphone">Phone</Label>
                <Input id="edit-ecphone" name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-ecrel">Relationship</Label>
                <Input id="edit-ecrel" name="emergency_contact_relationship" value={form.emergency_contact_relationship} onChange={handleChange} />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 min-w-[140px]" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
