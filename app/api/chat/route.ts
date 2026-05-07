import { anthropic } from '../../lib/anthropic'
import type { NextRequest } from 'next/server'

const SYSTEM_PROMPT = `You are a helpful assistant for a product called the "Lumina Wireless Headphones".

Product details:
- Price: $89.99
- Colors: Black, White, Midnight Blue
- Battery life: 30 hours
- Bluetooth 5.3, 10m range
- Built-in noise cancellation
- Foldable design, 250g
- Includes USB-C charging cable and carrying pouch

Answer customer questions about this product concisely and helpfully.`

export async function POST(request: NextRequest) {
  const { message } = await request.json()

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: message }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return Response.json({ response: text })
}
