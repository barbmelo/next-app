import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic } from './anthropic'
import { TOOL_DEFINITIONS, executeTool } from './tools'

const MAX_ITERATIONS = 10
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

export type AgentCallbacks = {
  onText: (text: string) => void
  onToolCall: (name: string) => void
}

export type AgentResult = {
  fullText: string
  toolCallsLog: string[]
}

export async function runAgent(
  messages: Anthropic.Messages.MessageParam[],
  system: string,
  callbacks: AgentCallbacks
): Promise<AgentResult> {
  const history: Anthropic.Messages.MessageParam[] = [...messages]
  const toolCallsLog: string[] = []
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
      const errorText = 'Something went wrong while processing your request. Please try again.'
      callbacks.onText(errorText)
      return { fullText: errorText, toolCallsLog }
    }

    // Collect any text blocks from this response
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    )
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
    )

    if (response.stop_reason === 'end_turn') {
      fullText = textBlocks.map((b) => b.text).join('')
      callbacks.onText(fullText)
      return { fullText, toolCallsLog }
    }

    if (response.stop_reason === 'tool_use') {
      // Add the assistant turn (including tool_use blocks) to history
      history.push({ role: 'assistant', content: response.content })

      // Execute all tools in parallel
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

    // Unexpected stop reason — return whatever text we have
    fullText = textBlocks.map((b) => b.text).join('')
    callbacks.onText(fullText)
    return { fullText, toolCallsLog }
  }

  // Max iterations reached
  const limitText = "I wasn't able to complete your request in the allowed number of steps. Please try rephrasing your question."
  callbacks.onText(limitText)
  return { fullText: limitText, toolCallsLog }
}
