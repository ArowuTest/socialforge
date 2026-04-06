import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders text content', () => {
    render(<Badge>Published</Badge>)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('applies default variant classes when no variant specified', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-primary/)
    expect(badge.className).toMatch(/text-primary-foreground/)
  })

  it('applies secondary variant classes', () => {
    const { container } = render(<Badge variant="secondary">Draft</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-secondary/)
    expect(badge.className).toMatch(/text-secondary-foreground/)
  })

  it('applies destructive variant classes', () => {
    const { container } = render(<Badge variant="destructive">Failed</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-destructive/)
    expect(badge.className).toMatch(/text-destructive-foreground/)
  })

  it('applies outline variant classes', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>)
    const badge = container.firstChild as HTMLElement
    // outline variant has text-foreground and a visible border (no border-transparent)
    expect(badge.className).toMatch(/text-foreground/)
    // Should NOT suppress border with border-transparent
    expect(badge.className).not.toMatch(/border-transparent/)
  })

  it('applies success variant classes', () => {
    const { container } = render(<Badge variant="success">Active</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-green-100/)
  })

  it('applies warning variant classes', () => {
    const { container } = render(<Badge variant="warning">Expiring</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-yellow-100/)
  })

  it('applies info variant classes', () => {
    const { container } = render(<Badge variant="info">Info</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-blue-100/)
  })

  it('applies brand variant classes', () => {
    const { container } = render(<Badge variant="brand">Agency</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/bg-brand-100/)
  })

  it('merges additional className', () => {
    const { container } = render(<Badge className="ml-2">Extra</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/ml-2/)
  })

  it('renders with base rounded-full class', () => {
    const { container } = render(<Badge>Base</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toMatch(/rounded-full/)
  })
})
