import { anthropic } from '../../lib/anthropic'
import { getPrompt } from '../../lib/prompts'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { message } = await request.json()
  const prompt = getPrompt('product-qa')

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: message }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return Response.json({ response: text, promptVersion: prompt.version })
}
