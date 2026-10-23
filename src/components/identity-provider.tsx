import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  getUser,
  handleAuthCallback,
  logout as identityLogout,
  onAuthChange,
  updateUser,
  type User,
} from '@netlify/identity'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type IdentityState = {
  user: User | null
  ready: boolean
  signOut: () => Promise<void>
}

const IdentityContext = createContext<IdentityState | null>(null)

const callbackKeys = [
  'confirmation_token',
  'recovery_token',
  'invite_token',
  'email_change_token',
  'access_token',
  'error',
]

/** Client-side auth state for the UI. Server functions verify the session themselves. */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let active = true
    const unsubscribe = onAuthChange((event, next) => {
      if (!active) return
      setUser(next)
      if (event === 'login' || event === 'logout') void router.invalidate()
    })

    async function initialize() {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1))
        if (callbackKeys.some((key) => params.has(key))) {
          const result = await handleAuthCallback()
          if (result?.type === 'confirmation')
            toast.success('Email confirmed. You are signed in.')
          if (result?.type === 'oauth') toast.success('Signed in.')
          if (result?.type === 'recovery') setRecovering(true)
          if (result?.type === 'email_change')
            toast.success('Email address updated.')
          if (result) await router.invalidate()
        }
      } catch {
        toast.error('That sign-in link is invalid or has expired.')
      }
      const current = await getUser()
      if (active) {
        setUser(current)
        setReady(true)
      }
    }
    void initialize()
    return () => {
      active = false
      unsubscribe()
    }
  }, [router])

  async function signOut() {
    await identityLogout()
    setUser(null)
    await router.invalidate()
    toast.success('Signed out.')
  }

  return (
    <IdentityContext.Provider value={{ user, ready, signOut }}>
      {children}
      <NewPasswordDialog
        open={recovering}
        onDone={() => setRecovering(false)}
      />
    </IdentityContext.Provider>
  )
}

export function useIdentity() {
  const state = useContext(IdentityContext)
  if (!state) throw new Error('IdentityProvider is required')
  return state
}

function NewPasswordDialog({
  open,
  onDone,
}: {
  open: boolean
  onDone: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(
      new FormData(event.currentTarget).get('password') ?? '',
    )
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await updateUser({ password })
      toast.success('Password updated.')
      onDone()
    } catch {
      setError('Could not update your password. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>
            You're signed in. Choose a new password for your account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
