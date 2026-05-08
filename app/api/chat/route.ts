import { getPrompt } from '../../lib/prompts'
import { judgeResponse } from '../../lib/judge'
import { runAgent } from '../../lib/agent'
import type { NextRequest } from 'next/server'

type Message = { role: 'user' | 'assistant'; content: string }

export async function POST(request: NextRequest) {
  const { messages }: { messages: Message[] } = await request.json()

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  const { version: promptVersion, system } = getPrompt('product-qa')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const toolCallsLog: string[] = []

      const { fullText } = await runAgent(messages, system, {
        onText: (text) => send({ type: 'text', text }),
        onToolCall: (name) => {
          toolCallsLog.push(name)
          send({ type: 'tool_call', name })
        },
      })

      const judgment = await judgeResponse(lastUserMessage, '', fullText, toolCallsLog)

      send({
        type: 'metadata',
        judgment,
        promptVersion,
        toolCallsLog,
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
