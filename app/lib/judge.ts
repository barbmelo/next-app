import 'server-only'
import { getAnthropic } from './anthropic'
import type { TokenUsage } from './agent'

export type Judgment = {
  score: number
  passed: boolean
  reason: string
}

export type JudgeResult = {
  judgment: Judgment
  usage: TokenUsage
}

const JUDGE_PROMPT = `You are evaluating a product assistant's response. You will be given:
- The customer's question
- How the assistant gathered information (either tool calls or pre-loaded context)
- The assistant's response

Score the response from 1 to 5 on these criteria:
- Helpfulness: does it actually answer the question asked?
- Accuracy: does the answer appear grounded and consistent (no obvious contradictions)?
- Clarity: is the response clear and appropriately concise?

If the assistant used tool calls, trust that the tool results were accurate — do not penalize for "missing context".

Respond with valid JSON only, no other text:
{"score": <1-5>, "passed": <true if score >= 4>, "reason": "<one sentence explaining the score>"}`

export async function judgeResponse(
  question: string,
  context: string,
  response: string,
  toolCallsLog: string[] = []
): Promise<JudgeResult> {
  const contextSection =
    toolCallsLog.length > 0
      ? `Tools used: ${toolCallsLog.join(', ')}`
      : `Product context:\n${context}`

  const msg = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: JUDGE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Question: ${question}\n\n${contextSection}\n\nAssistant response:\n${response}`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

  let judgment: Judgment
  try {
    judgment = JSON.parse(text) as Judgment
  } catch {
    judgment = { score: 0, passed: false, reason: 'Judge returned malformed output.' }
  }

  return {
    judgment,
    usage: {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    },
  }
}
