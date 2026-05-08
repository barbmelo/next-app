import { getPrompt } from '../../lib/prompts'
import { judgeResponse } from '../../lib/judge'
import { runAgent } from '../../lib/agent'
import { getOrCreateSession, saveMessage, getMessages } from '../../lib/db/queries'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { message, session_id }: { message: string; session_id?: string } =
    await request.json()

  const sessionId = await getOrCreateSession(session_id)
  const history = await getMessages(sessionId)

  await saveMessage(sessionId, 'user', message)

  const messages = [...history, { role: 'user' as const, content: message }]
  const { version: promptVersion, system } = getPrompt('product-qa')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const toolCallsLog: string[] = []
      let fullText = ''

      const result = await runAgent(messages, system, {
        onText: (text) => {
          fullText += text
          send({ type: 'text', text })
        },
        onToolCall: (name) => {
          toolCallsLog.push(name)
          send({ type: 'tool_call', name })
        },
      })

      fullText = result.fullText

      await saveMessage(sessionId, 'assistant', fullText)

      const judgment = await judgeResponse(message, '', fullText, toolCallsLog)

      send({
        type: 'metadata',
        judgment,
        promptVersion,
        toolCallsLog,
        session_id: sessionId,
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
