'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/supabase/database.types'
import {
  LayoutDashboard,
  Users,
  UsersRound,
  FileText,
  CreditCard,
  AlertTriangle,
  MessageSquare,
  BarChart3,
  Settings,
  Upload,
  ShieldCheck,
  User,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
  {
    href: '/clients',
    label: 'Clients Directory',
    icon: Users,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
  {
    href: '/groups',
    label: 'Disbursement Groups',
    icon: UsersRound,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
  {
    href: '/loans',
    label: 'Loans Portfolio',
    icon: FileText,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
  {
    href: '/repayments',
    label: 'Repayments Collection',
    icon: CreditCard,
    roles: ['supervisor', 'manager', 'accountant_admin'],
  },
  {
    href: '/overdue',
    label: 'Overdue & Defaulters',
    icon: AlertTriangle,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
  {
    href: '/reports',
    label: 'Ledger & Reports',
    icon: BarChart3,
    roles: ['supervisor', 'manager', 'accountant_admin'],
  },
  {
    href: '/sms',
    label: 'SMS Dispatch Log',
    icon: MessageSquare,
    roles: ['manager', 'accountant_admin'],
  },
  {
    href: '/import',
    label: 'Data Migration & Import',
    icon: Upload,
    roles: ['accountant_admin', 'manager'],
  },
  {
    href: '/users',
    label: 'Staff & Role Admin',
    icon: ShieldCheck,
    roles: ['accountant_admin', 'manager'],
  },
  {
    href: '/settings',
    label: 'Business Settings',
    icon: Settings,
    roles: ['accountant_admin', 'manager'],
  },
  {
    href: '/profile',
    label: 'Profile & Credentials',
    icon: User,
    roles: ['loan_officer', 'manager', 'supervisor', 'accountant_admin'],
  },
]

export function DashboardNav({
  userRole,
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  userRole: UserRole
  isCollapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const pathname = usePathname()
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  // Close mobile sidebar on route change
  useEffect(() => {
    onCloseMobile()
  }, [pathname])

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Element */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:static flex flex-col bg-slate-900 text-slate-100 border-r border-slate-800 transition-all duration-300 ease-in-out shrink-0',
          // Desktop Widths
          isCollapsed ? 'md:w-20' : 'md:w-64',
          // Mobile responsive slide-in
          mobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 h-16 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="Beyond Sky logo" className="w-full h-full object-cover" />
            </div>
            {(!isCollapsed || mobileOpen) && (
              <div className="overflow-hidden min-w-0 transition-opacity duration-200">
                <p className="font-bold text-white text-xs tracking-tight truncate leading-snug">
                  Beyond Sky Micro-Credit
                </p>
                <p className="text-[10px] text-blue-300 font-medium tracking-wide truncate">
                  Enterprise LMS
                </p>
              </div>
            )}
          </div>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(`${item.href}`))
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed && !mobileOpen ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-all group relative',
                  isCollapsed && !mobileOpen
                    ? 'justify-center p-3'
                    : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 shrink-0 transition-transform group-hover:scale-105',
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                  )}
                />

                {(!isCollapsed || mobileOpen) && (
                  <span className="truncate text-xs">{item.label}</span>
                )}

                {/* Floating tooltip on collapsed desktop hover */}
                {isCollapsed && !mobileOpen && (
                  <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-950 text-white text-xs rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-slate-800">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom Section: Role & Collapse Toggle */}
        <div className="border-t border-slate-800 bg-slate-950/50 p-3 shrink-0">
          {(!isCollapsed || mobileOpen) ? (
            <div className="flex items-center justify-between">
              <div className="overflow-hidden pr-2">
                <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Current Role</p>
                <p className="text-xs font-semibold text-blue-400 capitalize truncate mt-0.5">
                  {userRole.replace(/_/g, ' ')}
                </p>
              </div>

              {/* Desktop Collapse Toggle */}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand Sidebar"
                className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
