import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic } from './anthropic'
import { TOOL_DEFINITIONS, executeTool } from './tools'

const MAX_ITERATIONS = 10
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

export type TokenUsage = { input_tokens: number; output_tokens: number }

export type AgentCallbacks = {
  onText: (text: string) => void
  onToolCall: (name: string) => void
}

export type AgentResult = {
  fullText: string
  toolCallsLog: string[]
  usage: TokenUsage
}

export async function runAgent(
  messages: Anthropic.Messages.MessageParam[],
  system: string,
  callbacks: AgentCallbacks
): Promise<AgentResult> {
  const history: Anthropic.Messages.MessageParam[] = [...messages]
  const toolCallsLog: string[] = []
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 }
  let fullText = ''

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Messages.Message

    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: TOOL_DEFINITIONS,
        messages: history,
      })
    } catch (err) {
      console.error('[agent] anthropic.messages.create failed:', err)
      const errorText = 'Something went wrong while processing your request. Please try again.'
      callbacks.onText(errorText)
      return { fullText: errorText, toolCallsLog, usage }
    }

    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens

    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    )
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
    )

    if (response.stop_reason === 'end_turn') {
      fullText = textBlocks.map((b) => b.text).join('')
      callbacks.onText(fullText)
      return { fullText, toolCallsLog, usage }
    }

    if (response.stop_reason === 'tool_use') {
      history.push({ role: 'assistant', content: response.content })

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          callbacks.onToolCall(block.name)
          toolCallsLog.push(block.name)

          let content: string
          try {
            content = await executeTool(block.name, block.input as Record<string, unknown>)
          } catch (err) {
            content = `Error executing ${block.name}: ${err instanceof Error ? err.message : 'unknown error'}`
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content,
          }
        })
      )

      history.push({ role: 'user', content: toolResults })
      continue
    }

    fullText = textBlocks.map((b) => b.text).join('')
    callbacks.onText(fullText)
    return { fullText, toolCallsLog, usage }
  }

  const limitText = "I wasn't able to complete your request in the allowed number of steps. Please try rephrasing your question."
  callbacks.onText(limitText)
  return { fullText: limitText, toolCallsLog, usage }
}
