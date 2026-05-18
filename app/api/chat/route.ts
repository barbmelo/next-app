import { getPrompt } from '../../lib/prompts'
import { judgeResponse } from '../../lib/judge'
import { runAgent } from '../../lib/agent'
import { checkGuardrail } from '../../lib/guardrail'
import { getOrCreateSession, saveMessage, getMessages } from '../../lib/db/queries'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  let message: string
  let session_id: string | undefined
  try {
    const body = await request.json()
    message = body.message
    session_id = body.session_id
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })
  }

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

      let error: string | null = null

      try {
        const guardrail = await checkGuardrail(message)

        if (!guardrail.allowed) {
          const declineText = "I'm here to help with electronics products, orders, and shipping. I can't help with that particular request — is there something store-related I can assist you with?"
          await saveMessage(sessionId, 'assistant', declineText)
          send({ type: 'text', text: declineText })
          console.log(JSON.stringify({
            session_id: sessionId,
            tokens_used: { input: 0, output: 0 },
            tool_calls: [],
            latency_ms: Date.now() - startTime,
            judgment_score: null,
            guardrail_blocked: true,
            guardrail_reason: guardrail.reason,
            error: null,
          }))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }

        const agentResult = await runAgent(messages, system, {
          onText: (text) => send({ type: 'text', text }),
          onToolCall: (name) => send({ type: 'tool_call', name }),
        })

        await saveMessage(sessionId, 'assistant', agentResult.fullText)

        const { judgment, usage: judgeUsage } = await judgeResponse(
          message,
          '',
          agentResult.fullText,
          agentResult.toolCallsLog
        )

        send({
          type: 'metadata',
          judgment,
          promptVersion,
          toolCallsLog: agentResult.toolCallsLog,
          session_id: sessionId,
        })

        console.log(JSON.stringify({
          session_id: sessionId,
          tokens_used: {
            input: agentResult.usage.input_tokens + judgeUsage.input_tokens,
            output: agentResult.usage.output_tokens + judgeUsage.output_tokens,
          },
          tool_calls: agentResult.toolCallsLog,
          latency_ms: Date.now() - startTime,
          judgment_score: judgment.score,
          guardrail_blocked: false,
          error: null,
        }))
      } catch (err) {
        error = err instanceof Error ? err.message : 'unknown error'
        console.log(JSON.stringify({
          session_id: sessionId,
          tokens_used: { input: 0, output: 0 },
          tool_calls: [],
          latency_ms: Date.now() - startTime,
          judgment_score: null,
          guardrail_blocked: false,
          error,
        }))
        send({ type: 'text', text: 'Something went wrong. Please try again.' })
      }

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
