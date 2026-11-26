import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  AuthError,
  login,
  MissingIdentityError,
  requestPasswordRecovery,
  signup,
} from '@netlify/identity'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { safeRedirect } from '@/lib/redirects'

type Mode = 'signin' | 'signup' | 'reset'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string'
      ? { redirect: safeRedirect(search.redirect) }
      : {},
  head: () => ({ meta: [{ title: 'Sign in · BidMySite' }] }),
  component: LoginPage,
})

function describeError(error: unknown, mode: Mode) {
  if (error instanceof MissingIdentityError)
    return 'Accounts are not available right now.'
  if (error instanceof AuthError) {
    if (mode === 'signin' && (error.status === 400 || error.status === 401)) {
      return /confirm/i.test(error.message)
        ? 'Please confirm your email first — check your inbox for the link.'
        : 'Invalid email or password.'
    }
    if (error.status === 403) return 'Sign-ups are closed right now.'
    if (error.status === 422)
      return 'Check your email and use a password of at least 8 characters.'
    if (error.status === 429)
      return 'Too many attempts. Please wait a minute and try again.'
  }
  return 'Something went wrong. Please try again.'
}

function LoginPage() {
  const { redirect } = Route.useSearch()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') ?? '').trim()
    const password = String(fields.get('password') ?? '')
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        await login(email, password)
        await router.invalidate()
        toast.success('Signed in.')
        await router.navigate({ href: redirect ?? '/dashboard' })
      } else if (mode === 'signup') {
        const name = String(fields.get('name') ?? '').trim()
        const user = await signup(email, password, { full_name: name })
        if (user.confirmedAt) {
          await router.invalidate()
          toast.success('Account created.')
          await router.navigate({ href: redirect ?? '/dashboard' })
        } else {
          setNotice(
            `We sent a confirmation link to ${email}. Open it to activate your account.`,
          )
        }
      } else {
        await requestPasswordRecovery(email)
        setNotice(
          `If an account exists for ${email}, a password reset link is on its way.`,
        )
      }
    } catch (err) {
      setError(describeError(err, mode))
    } finally {
      setPending(false)
    }
  }

  const title =
    mode === 'signin'
      ? 'Welcome back'
      : mode === 'signup'
        ? 'Create your account'
        : 'Reset your password'

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted-foreground">
        {mode === 'reset'
          ? "Enter your email and we'll send you a link to set a new password."
          : 'An account lets you submit websites and manage them from your dashboard.'}
      </p>

      {mode !== 'reset' && (
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as Mode)
            setError(null)
            setNotice(null)
          }}
          className="mt-8"
        >
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Create account
            </TabsTrigger>
          </TabsList>
          <TabsContent value={mode} />
        </Tabs>
      )}

      {notice ? (
        <div className="mt-6 rounded-2xl border bg-card p-6">
          <MailCheck className="size-8 text-live" />
          <p className="mt-3 font-semibold">Check your email</p>
          <p className="mt-1 text-sm text-muted-foreground">{notice}</p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setNotice(null)
              setMode('signin')
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 rounded-2xl border bg-card p-6">
          <fieldset disabled={pending} className="space-y-5">
            <legend className="sr-only">{title}</legend>
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
                <p className="text-xs text-muted-foreground">
                  Shown publicly next to your bids.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            {mode !== 'reset' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset')
                        setError(null)
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                />
              </div>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full">
              {pending
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send reset link'}
            </Button>
            {mode === 'reset' && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode('signin')}
              >
                Back to sign in
              </Button>
            )}
          </fieldset>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing you agree to our{' '}
        <Link to="/terms" className="underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  )
}
