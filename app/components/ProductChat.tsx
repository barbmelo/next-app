'use client'
import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import type { Judgment } from '../lib/judge'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  toolCallsLog?: string[]
  judgment?: Judgment
  promptVersion?: number
}

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Searching products',
  check_order_status: 'Checking order',
  check_product_availability: 'Checking stock',
  get_shipping_estimate: 'Getting shipping rates',
  escalate_to_support: 'Escalating to support',
}

const SUGGESTIONS = [
  'I need headphones for long flights',
  'Where is my order ORD-1001?',
  'What is in stock under $60?',
  'I want to start making YouTube videos',
]

export default function ProductChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeToolCalls, setActiveToolCalls] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeToolCalls])

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function send(text: string) {
    if (!text.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: text }
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setActiveToolCalls([])
    setInput('')
    setLoading(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, session_id: sessionId }),
    })

    if (!res.ok || !res.body) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Something went wrong. Please try again.',
        }
        return updated
      })
      setLoading(false)
      return
    }

    const reader = res.body.getReader()
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center pb-10">
            <div>
              <p className="text-gray-700 font-medium">How can I help you today?</p>
              <p className="text-sm text-gray-400 mt-1">Ask about products, orders, or shipping.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm bg-brand-100 hover:bg-brand-200 border border-brand-200 text-brand-600 px-3 py-1.5 rounded-full transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[75%] space-y-1.5">
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm whitespace-pre-wrap'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  msg.content
                ) : msg.content ? (
                  <Markdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                      h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                      h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                      h3: ({ children }) => <p className="font-medium mb-1">{children}</p>,
                      code: ({ children }) => <code className="bg-gray-200 rounded px-1 text-xs font-mono">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </Markdown>
                ) : loading && i === messages.length - 1 ? (
                  <span className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : null}
              </div>

              {msg.role === 'assistant' && msg.judgment && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {[...new Set(msg.toolCallsLog)]?.map((tool) => (
                    <span
                      key={tool}
                      className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full"
                    >
                      {TOOL_LABELS[tool] ?? tool}
                    </span>
                  ))}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      msg.judgment.passed
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : 'bg-red-50 text-red-600 border-red-200'
                    }`}
                    title={msg.judgment.reason}
                  >
                    {msg.judgment.score}/5
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {activeToolCalls.length > 0 && (
          <div className="flex justify-start">
            <div className="flex flex-wrap gap-1.5 max-w-[75%]">
              {activeToolCalls.map((tool, i) => (
                <span
                  key={i}
                  className="text-xs bg-brand-100 text-brand-600 border border-brand-200 px-3 py-1 rounded-full flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
                  {TOOL_LABELS[tool] ?? tool}
                </span>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-brand-200 px-4 py-4 bg-brand-50">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end max-w-3xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustHeight() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask me anything…"
            disabled={loading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-50 leading-relaxed transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-xl bg-brand-600 text-white px-5 py-3 text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
        {sessionId && (
          <p className="text-center text-xs text-gray-300 mt-2">session {sessionId.slice(0, 8)}</p>
        )}
      </div>
    </div>
  )
}
