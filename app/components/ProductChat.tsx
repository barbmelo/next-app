'use client'
import { useState } from 'react'
import type { Judgment } from '../lib/judge'

export default function ProductChat() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [promptVersion, setPromptVersion] = useState<number | null>(null)
  const [retrievedProducts, setRetrievedProducts] = useState<string[]>([])
  const [judgment, setJudgment] = useState<Judgment | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    setResponse('')
    setRetrievedProducts([])
    setJudgment(null)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const data = await res.json()
    setResponse(data.response)
    setPromptVersion(data.promptVersion)
    setRetrievedProducts(data.retrievedProducts ?? [])
    setJudgment(data.judgment ?? null)
    setLoading(false)
  }

  return (
    <div>
      <h2>Ask about our products</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. I need something for long flights"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </form>
      {response && (
        <div>
          <p>{response}</p>
          <small>
            prompt v{promptVersion} · retrieved: {retrievedProducts.join(', ')}
          </small>
          {judgment && (
            <div>
              <small>
                judge: {judgment.passed ? '✓ pass' : '✗ fail'} · score {judgment.score}/5 · {judgment.reason}
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
