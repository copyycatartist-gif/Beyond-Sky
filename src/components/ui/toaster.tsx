'use client'

import * as React from 'react'
import { useToast, TOAST_LIMIT, type ToasterToast } from '@/components/ui/use-toast'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = NonNullable<ToasterToast['variant']>

const VARIANT_STYLES: Record<
  Variant,
  { wrap: string; bar: string; icon: React.ReactNode }
> = {
  destructive: {
    wrap: 'border-red-200 bg-red-50 text-red-900',
    bar: 'bg-red-500',
    icon: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    bar: 'bg-emerald-500',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />,
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-900',
    bar: 'bg-amber-500',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
  },
  info: {
    wrap: 'border-blue-200 bg-blue-50 text-blue-900',
    bar: 'bg-blue-500',
    icon: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
  },
  default: {
    wrap: 'border-gray-200 bg-white text-gray-900',
    bar: 'bg-gray-400',
    icon: <Info className="h-5 w-5 text-gray-500 shrink-0" />,
  },
}

function ToastRow({
  toast,
  onClose,
}: {
  toast: ToasterToast
  onClose: (id: string) => void
}) {
  const variant = (toast.variant ?? 'default') as Variant
  const styles = VARIANT_STYLES[variant]
  const duration = toast.duration ?? null
  const [paused, setPaused] = React.useState(false)
  const [progress, setProgress] = React.useState(100)
  const [leaving, setLeaving] = React.useState(false)

  const close = React.useCallback(() => {
    setLeaving(true)
    // Let the exit animation play before unmounting.
    window.setTimeout(() => onClose(toast.id), 200)
  }, [onClose, toast.id])

  // Auto-dismiss countdown with pause-on-hover support.
  React.useEffect(() => {
    if (!duration || paused || leaving) return
    const start = Date.now()
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        window.clearInterval(tick)
        close()
      }
    }, 60)
    return () => window.clearInterval(tick)
  }, [duration, paused, leaving, close])

  const isAlert = variant === 'destructive'

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        'toast-enter pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-xl border p-4 shadow-lg transition-all duration-200',
        styles.wrap,
        leaving && 'toast-exit'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{styles.icon}</span>

        <div className="grid gap-1">
          {toast.title && <div className="text-sm font-semibold">{toast.title}</div>}
          {toast.description && (
            <div className="text-xs leading-relaxed text-gray-600">{toast.description}</div>
          )}
          {toast.action && <div className="mt-1.5 flex gap-2">{toast.action}</div>}
        </div>
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Dismiss notification"
        className="rounded-md p-1 text-gray-400 opacity-70 transition hover:bg-gray-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
      >
        <X className="h-4 w-4" />
      </button>

      {duration ? (
        <span
          className={cn('absolute bottom-0 left-0 h-0.5 transition-[width] ease-linear', styles.bar)}
          style={{ width: `${progress}%`, transitionDuration: '60ms' }}
        />
      ) : null}
    </div>
  )
}

export function Toaster() {
  const { toasts, remove } = useToast()

  if (!toasts.length) return null

  const open = toasts.filter((t) => t.open !== false)
  const visible = open.slice(0, TOAST_LIMIT)
  const hiddenCount = Math.max(0, open.length - visible.length)

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 p-4 sm:bottom-0 sm:right-0 md:max-w-[420px]">
      {hiddenCount > 0 && (
        <div className="pointer-events-none mb-1 text-center text-xs font-medium text-gray-500">
          +{hiddenCount} more notification{hiddenCount > 1 ? 's' : ''}
        </div>
      )}
      {visible.map((t) => (
        <ToastRow key={t.id} toast={t} onClose={remove} />
      ))}
    </div>
  )
}
