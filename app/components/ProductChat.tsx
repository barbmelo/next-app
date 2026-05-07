'use client'
import { useState } from 'react'

export default function ProductChat() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [promptVersion, setPromptVersion] = useState<number | null>(null)
  const [retrievedProducts, setRetrievedProducts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    setResponse('')
    setRetrievedProducts([])
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const data = await res.json()
    setResponse(data.response)
    setPromptVersion(data.promptVersion)
    setRetrievedProducts(data.retrievedProducts ?? [])
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
        </div>
      )}
    </div>
  )
}
