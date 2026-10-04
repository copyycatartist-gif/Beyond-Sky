'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'

const SIGNOUT_PATH = '/auth/signout'
const COUNTDOWN_SECONDS = 60
const ACTIVITY_THROTTLE_MS = 5_000
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll']

interface SessionTimeoutWarningProps {
  /** Minutes of inactivity before the warning modal appears (default: 14) */
  timeoutMinutes?: number
}

/**
 * Client-side session timeout warning.
 *
 * Tracks user activity (throttled) and, after `timeoutMinutes` of inactivity,
 * shows a modal with a 60-second countdown. The user can stay signed in
 * (resets the timer) or sign out now. If the countdown reaches zero the
 * user is redirected to /auth/signout automatically.
 *
 * The modal implements a simple focus trap: Tab cycles within the dialog.
 */
export function SessionTimeoutWarning({ timeoutMinutes = 14 }: SessionTimeoutWarningProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [signingOut, setSigningOut] = useState(false)

  const lastActivityRef = useRef(Date.now())
  const timeoutMs = timeoutMinutes * 60 * 1000
  const dialogRef = useRef<HTMLDivElement>(null)
  const stayButtonRef = useRef<HTMLButtonElement>(null)

  const signOut = useCallback(() => {
    setSigningOut(true)
    router.push(SIGNOUT_PATH)
  }, [router])

  const staySignedIn = useCallback(() => {
    lastActivityRef.current = Date.now()
    setVisible(false)
    setCountdown(COUNTDOWN_SECONDS)
    setSigningOut(false)
  }, [])

  // Throttled activity tracker — resets the inactivity clock
  useEffect(() => {
    let throttled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const onActivity = () => {
      if (throttled) return
      throttled = true
      lastActivityRef.current = Date.now()
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        throttled = false
      }, ACTIVITY_THROTTLE_MS)
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Inactivity poller — shows the modal once the timeout elapses
  useEffect(() => {
    const poll = setInterval(() => {
      if (!visible && Date.now() - lastActivityRef.current >= timeoutMs) {
        setVisible(true)
        setCountdown(COUNTDOWN_SECONDS)
      }
    }, 10_000)
    return () => clearInterval(poll)
  }, [visible, timeoutMs])

  // Countdown ticker — auto sign-out at zero
  useEffect(() => {
    if (!visible) return
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(tick)
          signOut()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [visible, signOut])

  // Focus the primary action when the modal opens
  useEffect(() => {
    if (visible) {
      stayButtonRef.current?.focus()
    }
  }, [visible])

  // Focus trap + Escape handling
  useEffect(() => {
    if (!visible) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        staySignedIn()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible, staySignedIn])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>
          <h2 id="session-timeout-title" className="text-lg font-semibold text-gray-900">
            Your session is about to expire
          </h2>
          <p id="session-timeout-description" className="mt-2 text-sm text-gray-600">
            You have been inactive. You will be signed out in{' '}
            <span className="font-semibold tabular-nums text-amber-600">{countdown}</span>{' '}
            {countdown === 1 ? 'second' : 'seconds'}.
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={signOut} disabled={signingOut}>
            {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign Out Now
          </Button>
          <Button ref={stayButtonRef} onClick={staySignedIn}>
            Stay Signed In
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SessionTimeoutWarning
