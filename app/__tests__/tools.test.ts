import { vi, describe, it, expect } from 'vitest'

vi.mock('../lib/rag', () => ({
  retrieveProducts: vi.fn(),
}))

vi.mock('../lib/products', () => ({
  getProducts: vi.fn().mockResolvedValue([
    { id: '9',  name: 'WD 2TB External Hard Drive', price: 64,  description: 'USB 3.0 portable hard drive' },
    { id: '10', name: 'SanDisk 1TB SSD',             price: 109, description: 'Internal solid state drive' },
    { id: '11', name: 'Silicon Power 256GB SSD',      price: 58,  description: 'Compact solid state drive' },
  ]),
}))

import { executeTool } from '../lib/tools'
import { retrieveProducts } from '../lib/rag'

describe('check_order_status', () => {
  it('returns order details for a known order ID', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ORD-1001' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('shipped')
    expect(parsed.carrier).toBe('UPS')
    expect(parsed.order_id).toBe('ORD-1001')
  })

  it('is case-insensitive', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ord-1001' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('shipped')
  })

  it('returns not-found message for unknown order', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ORD-9999' })
    expect(result).toContain('not found')
  })

  it('returns processing status for ORD-1002', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ORD-1002' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('processing')
  })

  it('returns delivered status for ORD-1003', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ORD-1003' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('delivered')
    expect(parsed.signed_by).toBe('Front Door')
  })

  it('returns cancelled status for ORD-1004', async () => {
    const result = await executeTool('check_order_status', { order_id: 'ORD-1004' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('cancelled')
    expect(parsed.reason).toBe('Customer request')
  })
})

describe('check_product_availability', () => {
  it('returns stock info by product ID', async () => {
    const result = await executeTool('check_product_availability', { sku: '9' })
    const parsed = JSON.parse(result)
    expect(parsed.in_stock).toBe(true)
    expect(parsed.quantity).toBe(42)
    expect(parsed.product_id).toBe('9')
  })

  it('returns out-of-stock for product 11', async () => {
    const result = await executeTool('check_product_availability', { sku: '11' })
    const parsed = JSON.parse(result)
    expect(parsed.in_stock).toBe(false)
    expect(parsed.quantity).toBe(0)
  })

  it('supports lookup by partial name', async () => {
    const result = await executeTool('check_product_availability', { sku: 'SanDisk' })
    const parsed = JSON.parse(result)
    expect(parsed.product_id).toBe('10')
    expect(parsed.name).toContain('SanDisk')
  })

  it('is case-insensitive for name lookup', async () => {
    const result = await executeTool('check_product_availability', { sku: 'sandisk' })
    const parsed = JSON.parse(result)
    expect(parsed.product_id).toBe('10')
  })

  it('returns not-found for unknown product', async () => {
    const result = await executeTool('check_product_availability', { sku: 'unknown-product-xyz' })
    expect(result).toContain('not found')
  })
})

describe('get_shipping_estimate', () => {
  it('returns three shipping options for a valid product', async () => {
    const result = await executeTool('get_shipping_estimate', { product_id: '9', zip_code: '10001' })
    const parsed = JSON.parse(result)
    expect(parsed.options).toHaveLength(3)
    expect(parsed.options[0].method).toBe('Standard')
    expect(parsed.options[1].method).toBe('Express')
    expect(parsed.options[2].method).toBe('Overnight')
  })

  it('includes the destination zip code', async () => {
    const result = await executeTool('get_shipping_estimate', { product_id: '10', zip_code: '90210' })
    const parsed = JSON.parse(result)
    expect(parsed.destination_zip).toBe('90210')
  })

  it('includes the product name', async () => {
    const result = await executeTool('get_shipping_estimate', { product_id: '9', zip_code: '10001' })
    const parsed = JSON.parse(result)
    expect(parsed.product).toContain('WD')
  })

  it('returns not-found for unknown product ID', async () => {
    const result = await executeTool('get_shipping_estimate', { product_id: '99', zip_code: '10001' })
    expect(result).toContain('not found')
  })
})

describe('escalate_to_support', () => {
  it('creates a support ticket with the correct format', async () => {
    const result = await executeTool('escalate_to_support', { reason: 'Broken product', priority: 'high' })
    const parsed = JSON.parse(result)
    expect(parsed.ticket_id).toMatch(/^TKT-\d+$/)
    expect(parsed.priority).toBe('high')
    expect(parsed.message).toBeDefined()
  })

  it('increments ticket ID on each call', async () => {
    const r1 = JSON.parse(await executeTool('escalate_to_support', { reason: 'Issue A', priority: 'low' }))
    const r2 = JSON.parse(await executeTool('escalate_to_support', { reason: 'Issue B', priority: 'low' }))
    const id1 = parseInt(r1.ticket_id.replace('TKT-', ''))
    const id2 = parseInt(r2.ticket_id.replace('TKT-', ''))
    expect(id2).toBe(id1 + 1)
  })
})

describe('search_products', () => {
  it('returns formatted results from RAG', async () => {
    vi.mocked(retrieveProducts).mockResolvedValueOnce([
      { id: '1', name: 'Lumina Wireless Headphones', price: 89.99, description: 'Great headphones' },
    ])
    const result = await executeTool('search_products', { query: 'headphones for travel' })
    const parsed = JSON.parse(result)
    expect(parsed[0].name).toBe('Lumina Wireless Headphones')
    expect(parsed[0].id).toBe('1')
  })

  it('returns no-results message when RAG finds nothing', async () => {
    vi.mocked(retrieveProducts).mockResolvedValueOnce([])
    const result = await executeTool('search_products', { query: 'xyz-nonexistent' })
    expect(result).toBe('No products found matching that query.')
  })
})

describe('executeTool dispatcher', () => {
  it('throws for unknown tool names', async () => {
    await expect(executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool')
  })
})
