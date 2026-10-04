'use client'

import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateICS } from '@/lib/calendar'

interface CalendarExportButtonProps {
  clientName: string
  taskTitle: string
  dueDate: string
  location?: string
}

export function CalendarExportButton({
  clientName,
  taskTitle,
  dueDate,
  location,
}: CalendarExportButtonProps) {
  const handleExport = () => {
    const startDate = new Date(dueDate)
    if (isNaN(startDate.getTime())) return

    const ics = generateICS({
      title: `${taskTitle} — ${clientName}`,
      description: `${taskTitle} for client ${clientName}`,
      startDate,
      location,
    })

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeName = taskTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    anchor.href = url
    anchor.download = `${safeName || 'task'}.ics`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={handleExport}
      title="Export to calendar (.ics)"
      aria-label={`Export ${taskTitle} for ${clientName} to calendar`}
    >
      <Calendar className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">ICS</span>
    </Button>
  )
}
