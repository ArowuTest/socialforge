import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole('button', { name: /click me/i })
    expect(btn).toBeInTheDocument()
    // default variant has bg-primary class from CVA
    expect(btn.className).toMatch(/bg-primary/)
  })

  it('renders with destructive variant and applies destructive class', () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole('button', { name: /delete/i })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toMatch(/bg-destructive/)
  })

  it('renders with outline variant', () => {
    render(<Button variant="outline">Outline</Button>)
    const btn = screen.getByRole('button', { name: /outline/i })
    expect(btn.className).toMatch(/border/)
  })

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    const btn = screen.getByRole('button', { name: /secondary/i })
    expect(btn.className).toMatch(/bg-secondary/)
  })

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Press</Button>)
    fireEvent.click(screen.getByRole('button', { name: /press/i }))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn()
    render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>
    )
    const btn = screen.getByRole('button', { name: /disabled/i })
    fireEvent.click(btn)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('is disabled and shows reduced opacity when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    const btn = screen.getByRole('button', { name: /disabled/i })
    expect(btn).toBeDisabled()
    expect(btn.className).toMatch(/disabled:opacity-50/)
  })

  it('renders as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/home">Go home</a>
      </Button>
    )
    // When asChild=true the Slot renders an <a>, not a <button>
    const link = screen.getByRole('link', { name: /go home/i })
    expect(link).toBeInTheDocument()
    expect(link.tagName).toBe('A')
    // Button classes should still be applied via Slot
    expect(link.className).toMatch(/inline-flex/)
  })

  it('renders with small size class', () => {
    render(<Button size="sm">Small</Button>)
    const btn = screen.getByRole('button', { name: /small/i })
    expect(btn.className).toMatch(/h-9/)
  })

  it('renders with large size class', () => {
    render(<Button size="lg">Large</Button>)
    const btn = screen.getByRole('button', { name: /large/i })
    expect(btn.className).toMatch(/h-11/)
  })

  it('accepts and applies additional className', () => {
    render(<Button className="my-custom-class">Custom</Button>)
    const btn = screen.getByRole('button', { name: /custom/i })
    expect(btn.className).toMatch(/my-custom-class/)
  })
})
