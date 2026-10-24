// Persistent per-user rate limits. Database upserts keep this effective across
// serverless instances instead of relying on process-local memory.

import { sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { userRateLimits } from "../../db/schema.js";

export class RateLimitExceededError extends Error {
  constructor() {
    super("Too many attempts. Please wait before trying again.");
  }
}

export async function enforceUserRateLimit({
  userId,
  action,
  limit,
  windowMs,
}: {
  userId: string;
  action: string;
  limit: number;
  windowMs: number;
}) {
  const now = new Date();
  const expiredBefore = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(userRateLimits)
    .values({
      userId,
      action,
      windowStartedAt: now,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: [userRateLimits.userId, userRateLimits.action],
      set: {
        windowStartedAt: sql`case when ${userRateLimits.windowStartedAt} <= ${expiredBefore} then ${now} else ${userRateLimits.windowStartedAt} end`,
        requestCount: sql`case when ${userRateLimits.windowStartedAt} <= ${expiredBefore} then 1 else ${userRateLimits.requestCount} + 1 end`,
      },
    })
    .returning({ requestCount: userRateLimits.requestCount });

  if (!row || row.requestCount > limit) {
    throw new RateLimitExceededError();
  }
}
