import { describe, it, expect } from 'vitest'
import { getPrompt } from '../lib/prompts'

describe('getPrompt', () => {
  it('returns the active version (4)', () => {
    const { version } = getPrompt('product-qa')
    expect(version).toBe(4)
  })

  it('returns a string system prompt', () => {
    const { system } = getPrompt('product-qa')
    expect(typeof system).toBe('string')
  })

  it('v4 prompt instructs use of tools', () => {
    const { system } = getPrompt('product-qa')
    expect(system).toContain('search_products')
    expect(system).toContain('check_order_status')
  })

  it('throws for an unknown prompt name', () => {
    expect(() => getPrompt('nonexistent')).toThrow('Unknown prompt: nonexistent')
  })

  it('accepts a context argument without error on v4', () => {
    // v4 is a static string prompt — context is accepted but ignored
    const { system } = getPrompt('product-qa', 'some injected context')
    expect(system).toContain('search_products')
    expect(system).not.toContain('some injected context')
  })
})
