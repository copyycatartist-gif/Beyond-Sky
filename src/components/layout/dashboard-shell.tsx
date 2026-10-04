'use client'

import { useState, useEffect } from 'react'
import { DashboardNav } from './dashboard-nav'
import { DashboardHeader } from './dashboard-header'
import type { Database, UserRole } from '@/lib/supabase/database.types'

type UserProfile = Database['public']['Tables']['users']['Row']

export function DashboardShell({
  user,
  userRole,
  children,
}: {
  user: UserProfile | null
  userRole: UserRole
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Retrieve saved preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('beyondsky_sidebar_collapsed')
    if (saved === 'true') {
      setIsCollapsed(true)
    }
  }, [])

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('beyondsky_sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <DashboardNav
        userRole={userRole}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardHeader
          user={user}
          onOpenMobile={() => setMobileOpen(true)}
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
