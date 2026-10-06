'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  User,
  KeyRound,
  Loader2,
  Save,
} from 'lucide-react'
import type { Database } from '@/lib/supabase/database.types'

type UserProfile = Database['public']['Tables']['users']['Row']

export function ProfileForm({ initialUser }: { initialUser: UserProfile }) {
  const router = useRouter()
  const { toast } = useToast()

  const [fullName, setFullName] = useState(initialUser.full_name || '')
  const [email, setEmail] = useState(initialUser.email || '')

  // Password fields
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword) {
      if (newPassword.length < 6) {
        toast({
          title: 'Weak Password',
          description: 'Password must be at least 6 characters long',
          variant: 'destructive',
        })
        return
      }

      if (newPassword !== confirmPassword) {
        toast({
          title: 'Passwords Mismatch',
          description: 'New password and confirmation password do not match',
          variant: 'destructive',
        })
        return
      }
    }

    setLoading(true)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          newPassword: newPassword || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      toast({
        title: 'Profile Updated',
        description: 'Your login credentials and account settings have been saved.',
        variant: 'success',
      })

      setNewPassword('')
      setConfirmPassword('')
      router.refresh()
    } catch (err: any) {
      toast({
        title: 'Update Error',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const roleLabels: Record<string, { label: string; badgeClass: string }> = {
    accountant_admin: {
      label: 'Super Admin (Accountant / System Admin)',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    },
    manager: {
      label: 'Manager',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    supervisor: {
      label: 'Field Supervisor',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    loan_officer: {
      label: 'Loan Officer',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    },
  }

  const roleInfo = roleLabels[initialUser.role] || {
    label: initialUser.role,
    badgeClass: 'bg-gray-100 text-gray-800',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {/* 1. Account & Security Overview */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-gray-900">
                <User className="h-4 w-4 text-blue-600" />
                Personal & Account Profile
              </CardTitle>
              <CardDescription className="text-xs">
                Manage your staff identity and login email
              </CardDescription>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${roleInfo.badgeClass}`}
            >
              {roleInfo.label}
            </span>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="e.g. Ama Serwaa Mensah"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Login Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@beyondsky.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Account Registered Date</Label>
              <Input
                disabled
                value={formatDate(initialUser.created_at, 'dd MMMM yyyy, hh:mm a')}
                className="bg-gray-50 text-gray-500 font-mono text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Change Password / Credentials */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b border-gray-100 bg-gray-50/50">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900">
            <KeyRound className="h-4 w-4 text-amber-600" />
            Change Login Password
          </CardTitle>
          <CardDescription className="text-xs">
            Leave password fields blank if you do not wish to change your existing password
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-type new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold min-w-[200px]"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving Profile...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Account Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
