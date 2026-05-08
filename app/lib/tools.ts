import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { retrieveProducts } from './rag'
import { products } from './products'

export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: 'search_products',
    description:
      'Search the product catalog using a semantic query. Use when the customer asks about products, features, prices, or recommendations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what the customer is looking for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_order_status',
    description: 'Check the status of an existing customer order by order ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_id: { type: 'string', description: 'The order ID, e.g. ORD-1001' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'check_product_availability',
    description: 'Check whether a specific product is currently in stock.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sku: { type: 'string', description: 'Product ID (1–6) or product name' },
      },
      required: ['sku'],
    },
  },
  {
    name: 'get_shipping_estimate',
    description: 'Get shipping options and cost estimate for a product to a given zip code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_id: { type: 'string', description: 'The product ID (1–6)' },
        zip_code: { type: 'string', description: 'Destination zip code' },
      },
      required: ['product_id', 'zip_code'],
    },
  },
  {
    name: 'escalate_to_support',
    description:
      'Escalate a customer issue to the human support team when you cannot resolve it yourself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Description of the issue to escalate' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level based on customer urgency',
        },
      },
      required: ['reason', 'priority'],
    },
  },
]

// --- Mock data ---

type OrderStatus = {
  status: string
  carrier?: string
  tracking?: string
  eta?: string
  estimated_ship_date?: string
  delivered_at?: string
  signed_by?: string
  cancelled_at?: string
  reason?: string
}

const MOCK_ORDERS: Record<string, OrderStatus> = {
  'ORD-1001': { status: 'shipped', carrier: 'UPS', tracking: '1Z999AA10123456784', eta: '2026-05-10' },
  'ORD-1002': { status: 'processing', estimated_ship_date: '2026-05-09' },
  'ORD-1003': { status: 'delivered', delivered_at: '2026-05-07', signed_by: 'Front Door' },
  'ORD-1004': { status: 'cancelled', cancelled_at: '2026-05-06', reason: 'Customer request' },
}

type StockInfo = { in_stock: boolean; quantity: number }

const MOCK_STOCK: Record<string, StockInfo> = {
  '1': { in_stock: true, quantity: 42 },
  '2': { in_stock: true, quantity: 15 },
  '3': { in_stock: false, quantity: 0 },
  '4': { in_stock: true, quantity: 88 },
  '5': { in_stock: true, quantity: 7 },
  '6': { in_stock: true, quantity: 23 },
}

// --- Tool implementations ---

async function searchProducts(input: Record<string, unknown>): Promise<string> {
  const query = String(input.query ?? '')
  const results = await retrieveProducts(query, 3)
  if (results.length === 0) return 'No products found matching that query.'
  return JSON.stringify(results.map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.description })))
}

function checkOrderStatus(input: Record<string, unknown>): string {
  const orderId = String(input.order_id ?? '').toUpperCase()
  const order = MOCK_ORDERS[orderId]
  if (!order) return `Order ${orderId} not found. Please verify the order ID and try again.`
  return JSON.stringify({ order_id: orderId, ...order })
}

function checkProductAvailability(input: Record<string, unknown>): string {
  const sku = String(input.sku ?? '')
  // Support lookup by ID or by name
  const product =
    products.find((p) => p.id === sku) ??
    products.find((p) => p.name.toLowerCase().includes(sku.toLowerCase()))

  if (!product) return `Product "${sku}" not found in catalog.`
  const stock = MOCK_STOCK[product.id] ?? { in_stock: false, quantity: 0 }
  return JSON.stringify({ product_id: product.id, name: product.name, ...stock })
}

function getShippingEstimate(input: Record<string, unknown>): string {
  const productId = String(input.product_id ?? '')
  const zipCode = String(input.zip_code ?? '')
  const product = products.find((p) => p.id === productId)
  if (!product) return `Product ID "${productId}" not found.`

  return JSON.stringify({
    product: product.name,
    destination_zip: zipCode,
    options: [
      { method: 'Standard', days: '5–7 business days', cost: '$4.99' },
      { method: 'Express', days: '2–3 business days', cost: '$12.99' },
      { method: 'Overnight', days: '1 business day', cost: '$24.99' },
    ],
  })
}

let ticketCounter = 1000

function escalateToSupport(input: Record<string, unknown>): string {
  const reason = String(input.reason ?? '')
  const priority = String(input.priority ?? 'medium')
  const ticketId = `TKT-${++ticketCounter}`
  console.log(`[ESCALATION] ${ticketId} | priority=${priority} | reason=${reason}`)
  return JSON.stringify({
    ticket_id: ticketId,
    priority,
    message: 'A support agent will follow up within 24 hours.',
  })
}

// --- Dispatcher ---

const TOOL_MAP: Record<string, (input: Record<string, unknown>) => string | Promise<string>> = {
  search_products: searchProducts,
  check_order_status: checkOrderStatus,
  check_product_availability: checkProductAvailability,
  get_shipping_estimate: getShippingEstimate,
  escalate_to_support: escalateToSupport,
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const fn = TOOL_MAP[name]
  if (!fn) throw new Error(`Unknown tool: ${name}`)
  return fn(input)
}
