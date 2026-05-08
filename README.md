# AI Product Assistant

An AI-powered product assistant for an electronics store, built with Next.js and Claude. Demonstrates production-grade AI engineering patterns: tool calling, agentic loops, RAG, streaming, persistence, and observability.

## What it does

A customer types a question like *"I need something for long flights"* and gets a smart, accurate answer. The agent searches the product catalog, checks stock, estimates shipping — all in real time — before composing a response.

## Stack

- **Next.js** (App Router) — frontend + API route handlers
- **Anthropic Claude** (`claude-sonnet-4-6`) — agent + LLM-as-judge
- **OpenAI** (`text-embedding-3-small`) — product search embeddings (RAG)
- **Neon** — serverless PostgreSQL for session persistence
- **Drizzle ORM** — type-safe database queries
- **Vercel** — deployment + function logs

## Key features

| Feature | File |
|---|---|
| Agentic loop (MAX_ITERATIONS=10, parallel tools) | `app/lib/agent.ts` |
| 5 tools: search, order status, availability, shipping, escalation | `app/lib/tools.ts` |
| RAG with cosine similarity | `app/lib/rag.ts` |
| SSE streaming (tool_call → text → metadata) | `app/api/chat/route.ts` |
| LLM-as-judge (scores 1–5) | `app/lib/judge.ts` |
| Server-side chat history (sessions + messages) | `app/lib/db/` |
| Structured JSON logging (tokens, latency, score) | `app/api/chat/route.ts` |
| Prompt versioning (v1–v4) | `app/lib/prompts.ts` |

## Local setup

```bash
npm install
```

Create `.env.local`:

```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
DATABASE_URL=...
```

Run migrations:

```bash
npx dotenv -e .env.local -- npx drizzle-kit push
```

Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structured log (emitted per request)

```json
{
  "session_id": "c13aec62-...",
  "tokens_used": { "input": 4927, "output": 533 },
  "tool_calls": ["search_products", "check_product_availability"],
  "latency_ms": 3200,
  "judgment_score": 5,
  "error": null
}
```

Logs appear in Vercel function logs and can be piped to any monitoring tool.
