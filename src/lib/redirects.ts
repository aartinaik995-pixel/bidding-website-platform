/** Only allow same-site paths as post-login destinations. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/dashboard'
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  )
    return '/dashboard'
  return value
}
