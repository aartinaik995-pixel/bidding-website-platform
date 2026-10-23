import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

/** Re-runs the current route loaders on an interval while the tab is visible, so new verified bids appear. */
export function useLiveRefresh(intervalMs = 15_000) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void router.invalidate()
    }
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [router, intervalMs])
}
