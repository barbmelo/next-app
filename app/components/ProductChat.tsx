'use client'
import { useState } from 'react'

export default function ProductChat() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    setResponse('')
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    const data = await res.json()
    setResponse(data.response)
    setLoading(false)
  }

  return (
    <div>
      <h2>Ask about this product</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. What colors does this come in?"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </form>
      {response && <p>{response}</p>}
    </div>
  )
}
