'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function ClientPrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 gap-1.5 no-print"
      onClick={() => window.print()}
    >
      <Printer className="h-3.5 w-3.5" />
      Print
    </Button>
  )
}
