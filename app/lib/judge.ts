import 'server-only'
import { anthropic } from './anthropic'

export type Judgment = {
  score: number
  passed: boolean
  reason: string
}

const JUDGE_PROMPT = `You are evaluating a product assistant's response. You will be given:
- The customer's question
- The product context the assistant had access to
- The assistant's response

Score the response from 1 to 5 on these criteria:
- Accuracy: does it only mention features present in the product context?
- Helpfulness: does it actually answer the question?
- Grounding: does it avoid making up details not in the context?

Respond with valid JSON only, no other text:
{"score": <1-5>, "passed": <true if score >= 4>, "reason": "<one sentence explaining the score>"}`

export async function judgeResponse(
  question: string,
  context: string,
  response: string
): Promise<Judgment> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: JUDGE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Question: ${question}\n\nProduct context:\n${context}\n\nAssistant response:\n${response}`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  return JSON.parse(text) as Judgment
}
