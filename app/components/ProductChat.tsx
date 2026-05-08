'use client'
import { useState, useRef, useEffect } from 'react'
import type { Judgment } from '../lib/judge'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  toolCallsLog?: string[]
  judgment?: Judgment
  promptVersion?: number
}

export default function ProductChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeToolCalls, setActiveToolCalls] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeToolCalls])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: input }
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setActiveToolCalls([])
    setInput('')
    setLoading(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, session_id: sessionId }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)
        if (raw === '[DONE]') break

        const event = JSON.parse(raw)

        if (event.type === 'tool_call') {
          setActiveToolCalls((prev) => [...prev, event.name])
        } else if (event.type === 'text') {
          setActiveToolCalls([])
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: updated[updated.length - 1].content + event.text,
            }
            return updated
          })
        } else if (event.type === 'metadata') {
          if (!sessionId) setSessionId(event.session_id)
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              judgment: event.judgment,
              toolCallsLog: event.toolCallsLog,
              promptVersion: event.promptVersion,
            }
            return updated
          })
        }
      }
    }

    setLoading(false)
  }

  return (
    <div>
      <h2>Ask about our products</h2>
      {sessionId && <small>session: {sessionId}</small>}

      <div>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <p>{msg.content}</p>
            {msg.role === 'assistant' && msg.judgment && (
              <small>
                prompt v{msg.promptVersion}
                {msg.toolCallsLog && msg.toolCallsLog.length > 0 && (
                  <> · tools: {msg.toolCallsLog.join(' → ')}</>
                )}
                {' · '}judge: {msg.judgment.passed ? '✓ pass' : '✗ fail'} · score{' '}
                {msg.judgment.score}/5 · {msg.judgment.reason}
              </small>
            )}
          </div>
        ))}

        {activeToolCalls.length > 0 && (
          <p><small>calling: {activeToolCalls.join(' → ')}...</small></p>
        )}
        {loading && messages.at(-1)?.content === '' && activeToolCalls.length === 0 && (
          <p>...</p>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. I need something for long flights"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
