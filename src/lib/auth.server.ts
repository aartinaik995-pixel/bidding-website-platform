// Server-only helpers for reading the signed-in Netlify Identity user.
// Never import this from client components; call it from server function
// handlers and API routes only.

import { getUser } from '@netlify/identity'
import { sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'

export type SessionUser = {
  id: string
  email: string
  name: string
  isAdmin: boolean
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Please sign in to continue.')
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('You do not have access to this.')
  }
}

/** The verified user from the Identity session cookie, or null. Roles come from server-controlled app metadata. */
export async function currentUser(): Promise<SessionUser | null> {
  const user = await getUser()
  if (!user?.id || !user.email) return null
  return {
    id: user.id,
    email: user.email,
    name: (user.name ?? '').trim(),
    isAdmin: user.roles?.includes('admin') === true,
  }
}

/** Requires a signed-in user and keeps the users table in sync with Identity. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new AuthRequiredError()
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, name: user.name })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name: user.name, lastSeenAt: sql`now()` },
    })
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.isAdmin) throw new ForbiddenError()
  return user
}

/** Public display name: the account's name, never its email address. */
export function displayName(user: SessionUser) {
  return user.name || 'Anonymous bidder'
}
