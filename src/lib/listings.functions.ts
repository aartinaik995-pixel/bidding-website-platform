// Server functions for listings: public rankings and website submissions.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { listings } from '../../db/schema.js'
import { currentUser, requireUser } from './auth.server'
import {
  loadHomeData,
  loadLeaderboardData,
  loadListingPage,
} from './listings.server'

export const getHomeData = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number().int().min(1).max(50) }))
  .handler(({ data }) => loadHomeData(data.limit))

export const getLeaderboardData = createServerFn({ method: 'GET' }).handler(
  () => loadLeaderboardData(),
)

/** A listing's details page. Pending or removed listings are visible only to their owner and admins. */
export const getListingPage = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }) => loadListingPage(data.slug, await currentUser()))

const blockedHosts =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i

const submissionInput = z.object({
  url: z
    .string()
    .trim()
    .max(300)
    .url()
    .refine((value) => {
      try {
        const url = new URL(value)
        return (
          /^https?:$/.test(url.protocol) &&
          url.hostname.includes('.') &&
          !blockedHosts.test(url.hostname) &&
          !url.username &&
          !url.password
        )
      } catch {
        return false
      }
    }, 'Enter a public http:// or https:// website address'),
  title: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(280),
  ownerName: z.string().trim().min(1).max(80),
})

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 48)
      .replace(/^-+|-+$/g, '') || 'site'
  )
}

/** New listings are open for bids immediately; no admin approval step. */
export const submitListing = createServerFn({ method: 'POST' })
  .validator(submissionInput)
  .handler(async ({ data }) => {
    const user = await requireUser()

    const base = slugify(data.title)
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug =
        attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 6)}`
      const [row] = await db
        .insert(listings)
        .values({
          slug,
          url: new URL(data.url).toString(),
          title: data.title,
          description: data.description,
          ownerId: user.id,
          ownerName: data.ownerName,
          contactEmail: user.email,
        })
        .onConflictDoNothing({ target: listings.slug })
        .returning({ slug: listings.slug })
      if (row) return { slug: row.slug }
    }
    throw new Error('Could not save your listing. Please try again.')
  })
