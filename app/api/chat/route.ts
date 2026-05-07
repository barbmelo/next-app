import { anthropic } from '../../lib/anthropic'
import { getPrompt } from '../../lib/prompts'
import { retrieveProducts } from '../../lib/rag'
import { judgeResponse } from '../../lib/judge'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { message } = await request.json()

  const retrieved = await retrieveProducts(message)

  const context = retrieved
    .map((p) => `${p.name} ($${p.price}): ${p.description}`)
    .join('\n\n')

  const prompt = getPrompt('product-qa', context)

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: message }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

  const judgment = await judgeResponse(message, context, text)

  return Response.json({
    response: text,
    promptVersion: prompt.version,
    retrievedProducts: retrieved.map((p) => p.name),
    judgment,
  })
}
