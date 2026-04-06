import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/use-debounce'

describe('useDebounce()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately without waiting for delay', () => {
    const { result } = renderHook(() => useDebounce('hello', 500))
    expect(result.current).toBe('hello')
  })

  it('does not update the value before the delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    // Change the value
    rerender({ value: 'updated', delay: 500 })

    // Advance time by less than the delay (499 ms)
    act(() => {
      vi.advanceTimersByTime(499)
    })

    // Should still return the original value
    expect(result.current).toBe('initial')
  })

  it('returns the updated value after the delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })

    // Advance past the delay
    act(() => {
      vi.advanceTimersByTime(501)
    })

    expect(result.current).toBe('updated')
  })

  it('cancels the previous timeout when value changes rapidly (only last value wins)', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'first', delay: 300 } }
    )

    // Rapidly change the value multiple times
    rerender({ value: 'second', delay: 300 })
    act(() => { vi.advanceTimersByTime(100) })

    rerender({ value: 'third', delay: 300 })
    act(() => { vi.advanceTimersByTime(100) })

    rerender({ value: 'final', delay: 300 })
    act(() => { vi.advanceTimersByTime(100) })

    // At this point 300ms has not elapsed since the last change
    expect(result.current).toBe('first')

    // Now let the full delay elapse after the last change
    act(() => { vi.advanceTimersByTime(300) })

    // Only the last value should have been committed
    expect(result.current).toBe('final')
  })

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 200 } }
    )

    expect(result.current).toBe(0)

    rerender({ value: 42, delay: 200 })
    act(() => { vi.advanceTimersByTime(200) })

    expect(result.current).toBe(42)
  })

  it('works with object values', () => {
    const initialObj = { name: 'Alice' }
    const updatedObj = { name: 'Bob' }

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initialObj, delay: 100 } }
    )

    expect(result.current).toEqual({ name: 'Alice' })

    rerender({ value: updatedObj, delay: 100 })
    act(() => { vi.advanceTimersByTime(100) })

    expect(result.current).toEqual({ name: 'Bob' })
  })

  it('uses the delay provided at the time of the timeout creation', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'start', delay: 1000 } }
    )

    rerender({ value: 'end', delay: 1000 })

    // Advance only half the delay — still original
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe('start')

    // Advance the rest
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe('end')
  })
})
