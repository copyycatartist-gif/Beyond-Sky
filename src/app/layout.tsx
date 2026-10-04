import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'Beyond Sky Micro-Credit Enterprise | Loan Management System',
  description: 'Production Micro-Lending Management System for Beyond Sky Micro-Credit Enterprise',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <body className="h-full font-sans antialiased text-slate-900 bg-slate-50">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
