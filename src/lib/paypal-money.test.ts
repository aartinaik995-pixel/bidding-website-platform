import { describe, expect, it } from 'vitest'
import { money } from './payments.server'

describe('PayPal money formatting', () => {
  it('formats integer cents as two-decimal provider currency amounts', () => {
    expect(money(100)).toBe('1.00')
    expect(money(110)).toBe('1.10')
    expect(money(12345)).toBe('123.45')
  })
})
