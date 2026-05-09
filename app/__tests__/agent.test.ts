import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/anthropic', () => ({
  anthropic: { messages: { create: vi.fn() } },
}))

vi.mock('../lib/tools', () => ({
  TOOL_DEFINITIONS: [],
  executeTool: vi.fn().mockResolvedValue(JSON.stringify({ result: 'tool result' })),
}))

import { runAgent } from '../lib/agent'
import { anthropic } from '../lib/anthropic'
import { executeTool } from '../lib/tools'

const mockCreate = vi.mocked(anthropic.messages.create)

function makeEndTurnResponse(text: string, inputTokens = 10, outputTokens = 5) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

function makeToolUseResponse(toolName: string, toolInput = {}, inputTokens = 20, outputTokens = 10) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tool_abc', name: toolName, input: toolInput }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

describe('runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns text and calls onText on end_turn', async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse('Hello, how can I help?'))

    const onText = vi.fn()
    const result = await runAgent(
      [{ role: 'user', content: 'Hi' }],
      'system prompt',
      { onText, onToolCall: vi.fn() }
    )

    expect(result.fullText).toBe('Hello, how can I help?')
    expect(onText).toHaveBeenCalledWith('Hello, how can I help?')
    expect(result.toolCallsLog).toHaveLength(0)
  })

  it('accumulates token usage across the single call', async () => {
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse('Done', 100, 50))

    const result = await runAgent(
      [{ role: 'user', content: 'Hi' }],
      'system',
      { onText: vi.fn(), onToolCall: vi.fn() }
    )

    expect(result.usage.input_tokens).toBe(100)
    expect(result.usage.output_tokens).toBe(50)
  })

  it('executes a tool and loops until end_turn', async () => {
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse('check_order_status', { order_id: 'ORD-1001' }, 20, 10))
      .mockResolvedValueOnce(makeEndTurnResponse('Your order is shipped.', 30, 15))

    const onToolCall = vi.fn()
    const result = await runAgent(
      [{ role: 'user', content: 'Where is my order ORD-1001?' }],
      'system',
      { onText: vi.fn(), onToolCall }
    )

    expect(onToolCall).toHaveBeenCalledWith('check_order_status')
    expect(result.toolCallsLog).toEqual(['check_order_status'])
    expect(result.fullText).toBe('Your order is shipped.')
    expect(result.usage.input_tokens).toBe(50)
    expect(result.usage.output_tokens).toBe(25)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('handles tool errors gracefully and continues', async () => {
    vi.mocked(executeTool).mockRejectedValueOnce(new Error('DB connection failed'))

    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse('check_order_status', { order_id: 'ORD-1001' }))
      .mockResolvedValueOnce(makeEndTurnResponse('I ran into an issue checking that order.'))

    const result = await runAgent(
      [{ role: 'user', content: 'Check order' }],
      'system',
      { onText: vi.fn(), onToolCall: vi.fn() }
    )

    // Agent should not throw — it passes the error back to Claude and continues
    expect(result.fullText).toBe('I ran into an issue checking that order.')
    expect(mockCreate).toHaveBeenCalledTimes(2)

    // The tool_result sent to Claude should contain the error message
    const secondCallMessages = mockCreate.mock.calls[1][0].messages
    const toolResultMsg = secondCallMessages.find(
      (m: { role: string; content: unknown }) => m.role === 'user' && Array.isArray(m.content)
    )
    expect(JSON.stringify(toolResultMsg.content)).toContain('DB connection failed')
  })

  it('stops after MAX_ITERATIONS and returns a limit message', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse('search_products', { query: 'something' }))

    const result = await runAgent(
      [{ role: 'user', content: 'Loop forever' }],
      'system',
      { onText: vi.fn(), onToolCall: vi.fn() }
    )

    expect(result.fullText).toContain("wasn't able to complete")
    expect(mockCreate).toHaveBeenCalledTimes(10)
  })

  it('logs all tool calls in toolCallsLog in order', async () => {
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse('search_products', { query: 'headphones' }))
      .mockResolvedValueOnce(makeToolUseResponse('check_product_availability', { sku: '1' }))
      .mockResolvedValueOnce(makeEndTurnResponse('Here is what I found.'))

    const result = await runAgent(
      [{ role: 'user', content: 'Find headphones and check if in stock' }],
      'system',
      { onText: vi.fn(), onToolCall: vi.fn() }
    )

    expect(result.toolCallsLog).toEqual(['search_products', 'check_product_availability'])
  })

  it('returns fallback text when anthropic.messages.create throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'))

    const onText = vi.fn()
    const result = await runAgent(
      [{ role: 'user', content: 'Hi' }],
      'system',
      { onText, onToolCall: vi.fn() }
    )

    expect(result.fullText).toContain('Something went wrong')
    expect(onText).toHaveBeenCalled()
  })
})
