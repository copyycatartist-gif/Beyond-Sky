'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, User, Menu, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import type { Database } from '@/lib/supabase/database.types'

type UserProfile = Database['public']['Tables']['users']['Row']

export function DashboardHeader({
  user,
  onOpenMobile,
  isCollapsed,
  onToggleCollapse,
}: {
  user: UserProfile | null
  onOpenMobile?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-xs z-10">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobile}
          className="md:hidden h-9 w-9 text-gray-600 hover:text-gray-900"
          title="Open Navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop Quick Toggle Button */}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden md:flex h-8 w-8 text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Enterprise Brand Header */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center overflow-hidden md:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="Beyond Sky logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="font-bold text-gray-900 text-sm tracking-tight block leading-tight">
              Beyond Sky Micro-Credit Enterprise
            </span>
            <span className="text-[11px] text-gray-500 hidden sm:inline">
              Micro-Credit Loan Management
            </span>
          </div>
        </div>
      </div>

      {/* Right User Profile & Sign Out */}
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="flex items-center gap-2.5 p-1 -m-1 rounded-lg hover:bg-gray-100 transition-colors group"
          title="Manage Your Profile & Login Credentials"
        >
          <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="font-semibold text-gray-900 text-xs leading-none group-hover:text-blue-600 transition-colors">
              {user?.full_name ?? 'Staff Member'}
            </p>
            <p className="text-[11px] text-blue-600 font-medium capitalize mt-1 leading-none">
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
        </Link>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 text-xs h-8 px-2.5 ml-1"
        >
          <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}
