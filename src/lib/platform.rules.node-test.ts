// Pure-logic checks for the platform fee (10% on top of each bid) and bid limits.
// Runs with Node's built-in test runner, so it needs no extra dependencies:
//   node --test src/lib/platform.rules.node-test.ts
// (Named *.node-test.ts so the Vitest suite does not pick it up.)

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PLATFORM, feeBreakdown, isValidBidAmount } from './platform.ts'

describe('platform constants', () => {
  it('keeps the agreed rules', () => {
    assert.equal(PLATFORM.currency, 'USD')
    assert.equal(PLATFORM.minBidCents, 100)
    assert.equal(PLATFORM.maxBidCents, 500_000)
    assert.equal(PLATFORM.platformFeeBps, 1000)
  })
})

describe('platform fee (10% added on top of the bid)', () => {
  it('charges exactly 10% on whole-dollar bids', () => {
    assert.deepEqual(feeBreakdown(1000), { amountCents: 1000, feeCents: 100, totalChargeCents: 1100 })
    assert.deepEqual(feeBreakdown(100), { amountCents: 100, feeCents: 10, totalChargeCents: 110 })
    assert.deepEqual(feeBreakdown(500_000), { amountCents: 500_000, feeCents: 50_000, totalChargeCents: 550_000 })
  })

  it('rounds the fee half-up to the nearest cent', () => {
    assert.equal(feeBreakdown(101).feeCents, 10) // 10.1 -> 10
    assert.equal(feeBreakdown(105).feeCents, 11) // 10.5 -> 11
    assert.equal(feeBreakdown(12_345).feeCents, 1235) // 1234.5 -> 1235
  })

  it('always adds the bid and fee together, never subtracts', () => {
    for (let amount = 100; amount <= 500_000; amount += 997) {
      const { amountCents, feeCents, totalChargeCents } = feeBreakdown(amount)
      assert.equal(amountCents, amount, `bid ${amount} changed`)
      assert.ok(feeCents >= 0, `fee for ${amount} is negative`)
      assert.equal(totalChargeCents, amountCents + feeCents, `total wrong for ${amount}`)
      assert.ok(Number.isInteger(feeCents) && Number.isInteger(totalChargeCents), `non-integer cents for ${amount}`)
    }
  })

  it('keeps the fee within 10% of the bid, plus at most half a cent of rounding', () => {
    for (let amount = 100; amount <= 500_000; amount += 997) {
      const { feeCents } = feeBreakdown(amount)
      assert.ok(Math.abs(feeCents - amount / 10) <= 0.5, `fee for ${amount} drifted from 10%`)
    }
  })
})

describe('bid limits', () => {
  it('accepts whole-cent amounts from the minimum to the maximum', () => {
    assert.equal(isValidBidAmount(100), true)
    assert.equal(isValidBidAmount(1000), true)
    assert.equal(isValidBidAmount(500_000), true)
  })

  it('rejects amounts below the minimum or above the maximum', () => {
    assert.equal(isValidBidAmount(99), false)
    assert.equal(isValidBidAmount(0), false)
    assert.equal(isValidBidAmount(-100), false)
    assert.equal(isValidBidAmount(500_001), false)
  })

  it('rejects fractional cents and non-numbers', () => {
    assert.equal(isValidBidAmount(100.5), false)
    assert.equal(isValidBidAmount(Number.NaN), false)
    assert.equal(isValidBidAmount(Number.POSITIVE_INFINITY), false)
  })
})
