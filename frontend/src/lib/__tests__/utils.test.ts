import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  cn,
  formatNumber,
  truncateText,
  getPlatformColor,
  formatRelativeTime,
} from '@/lib/utils'
import { Platform } from '@/types'

// ---------------------------------------------------------------------------
// cn()
// ---------------------------------------------------------------------------
describe('cn()', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('resolves conflicting Tailwind classes (last wins)', () => {
    // tailwind-merge: p-4 overrides p-2
    const result = cn('p-2', 'p-4')
    expect(result).toBe('p-4')
  })

  it('applies conditional classes when truthy', () => {
    const active = true
    expect(cn('base', active && 'active')).toBe('base active')
  })

  it('omits conditional classes when falsy', () => {
    const active = false
    expect(cn('base', active && 'active')).toBe('base')
  })

  it('handles undefined / null values gracefully', () => {
    expect(cn('base', undefined, null as unknown as string)).toBe('base')
  })
})

// ---------------------------------------------------------------------------
// formatNumber()
// ---------------------------------------------------------------------------
describe('formatNumber()', () => {
  it('returns plain string for numbers under 1000', () => {
    expect(formatNumber(999)).toBe('999')
  })

  it('returns "1.0k" for exactly 1000', () => {
    expect(formatNumber(1000)).toBe('1.0k')
  })

  it('returns "1.5k" for 1500', () => {
    expect(formatNumber(1500)).toBe('1.5k')
  })

  it('returns "1.0M" for exactly 1 000 000', () => {
    expect(formatNumber(1_000_000)).toBe('1.0M')
  })

  it('returns "2.5M" for 2 500 000', () => {
    expect(formatNumber(2_500_000)).toBe('2.5M')
  })

  it('handles 0 correctly', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// truncateText()
// ---------------------------------------------------------------------------
describe('truncateText()', () => {
  it('returns text as-is when within limit', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('returns text as-is when exactly at limit', () => {
    expect(truncateText('hello', 5)).toBe('hello')
  })

  it('truncates text and appends "..." when over limit', () => {
    const result = truncateText('Hello World', 8)
    expect(result).toBe('Hello...')
    expect(result.length).toBe(8)
  })

  it('truncates a long string correctly', () => {
    const input = 'The quick brown fox jumps over the lazy dog'
    const result = truncateText(input, 15)
    expect(result.endsWith('...')).toBe(true)
    expect(result.length).toBe(15)
  })

  it('handles empty string', () => {
    expect(truncateText('', 5)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getPlatformColor()
// ---------------------------------------------------------------------------
describe('getPlatformColor()', () => {
  it('returns correct color for instagram', () => {
    expect(getPlatformColor(Platform.INSTAGRAM)).toBe('#E1306C')
  })

  it('returns correct color for tiktok', () => {
    // Source uses #010101 for TikTok
    expect(getPlatformColor(Platform.TIKTOK)).toBe('#010101')
  })

  it('returns correct color for linkedin', () => {
    expect(getPlatformColor(Platform.LINKEDIN)).toBe('#0A66C2')
  })

  it('returns correct color for twitter', () => {
    expect(getPlatformColor(Platform.TWITTER)).toBe('#1DA1F2')
  })

  it('returns correct color for youtube', () => {
    expect(getPlatformColor(Platform.YOUTUBE)).toBe('#FF0000')
  })

  it('returns correct color for threads', () => {
    expect(getPlatformColor(Platform.THREADS)).toBe('#000000')
  })

  it('returns correct color for facebook', () => {
    expect(getPlatformColor(Platform.FACEBOOK)).toBe('#1877F2')
  })

  it('returns correct color for pinterest', () => {
    expect(getPlatformColor(Platform.PINTEREST)).toBe('#E60023')
  })
})

// ---------------------------------------------------------------------------
// formatRelativeTime()
// ---------------------------------------------------------------------------
describe('formatRelativeTime()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "less than a minute ago" for a date just now', () => {
    const justNow = new Date('2024-06-01T11:59:45Z') // 15 seconds ago
    const result = formatRelativeTime(justNow)
    expect(result).toMatch(/less than a minute ago/)
  })

  it('returns "5 minutes ago" for 5 minutes in the past', () => {
    const fiveMinAgo = new Date('2024-06-01T11:55:00Z')
    const result = formatRelativeTime(fiveMinAgo)
    expect(result).toMatch(/5 minutes ago/)
  })

  it('returns "about 2 hours ago" for 2 hours in the past', () => {
    const twoHoursAgo = new Date('2024-06-01T10:00:00Z')
    const result = formatRelativeTime(twoHoursAgo)
    expect(result).toMatch(/about 2 hours ago/)
  })

  it('returns "3 days ago" for 3 days in the past', () => {
    const threeDaysAgo = new Date('2024-05-29T12:00:00Z')
    const result = formatRelativeTime(threeDaysAgo)
    expect(result).toMatch(/3 days ago/)
  })

  it('accepts a string date', () => {
    const result = formatRelativeTime('2024-06-01T11:55:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
