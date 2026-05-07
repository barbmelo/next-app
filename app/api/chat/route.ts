import { anthropic } from '../../lib/anthropic'
import { getPrompt } from '../../lib/prompts'
import { retrieveProducts } from '../../lib/rag'
import { judgeResponse } from '../../lib/judge'
import type { NextRequest } from 'next/server'

type Message = { role: 'user' | 'assistant'; content: string }

export async function POST(request: NextRequest) {
  const { messages }: { messages: Message[] } = await request.json()

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  const retrieved = await retrieveProducts(lastUserMessage)
  const context = retrieved
    .map((p) => `${p.name} ($${p.price}): ${p.description}`)
    .join('\n\n')
  const prompt = getPrompt('product-qa', context)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let fullText = ''

      const anthropicStream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: prompt.system,
        messages,
      })

      for await (const event of anthropicStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text
          send({ type: 'text', text: event.delta.text })
        }
      }

      const judgment = await judgeResponse(lastUserMessage, context, fullText)
      send({
        type: 'metadata',
        judgment,
        promptVersion: prompt.version,
        retrievedProducts: retrieved.map((p) => p.name),
      })

      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
