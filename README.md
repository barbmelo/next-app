# AI Product Assistant

An AI-powered shopping assistant for an electronics store, built with Next.js and Claude. Demonstrates production-grade AI engineering: tool calling, agentic loops, RAG, input guardrails, streaming, persistence, and observability.

## What it does

A customer types a question like *"I need headphones for long flights"* or *"I want to start making YouTube videos"* and gets a smart, accurate answer. The agent searches a catalog of 18 products across 7 categories, checks stock, estimates shipping, and looks up orders — all in real time — before composing a response.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 16 (App Router) |
| Agent + Judge | Anthropic Claude `claude-sonnet-4-6` |
| Guardrail | Anthropic Claude `claude-haiku-4-5` |
| Embeddings (RAG) | OpenAI `text-embedding-3-small` |
| Database | Neon (serverless PostgreSQL) |
| ORM | Drizzle |
| Deployment | Vercel (CI/CD via GitHub Actions) |

## Features

| Feature | File |
|---------|------|
| Agentic loop — MAX_ITERATIONS=10, parallel tools | `app/lib/agent.ts` |
| 5 tools: search, order status, availability, shipping, escalation | `app/lib/tools.ts` |
| Input guardrail — blocks off-topic and prompt injection (Haiku) | `app/lib/guardrail.ts` |
| RAG with cosine similarity, embeddings persisted to Postgres | `app/lib/rag.ts` |
| SSE streaming — `tool_call` → `text` → `metadata` events | `app/api/chat/route.ts` |
| LLM-as-judge — scores 1–5, saved to `evaluations` table | `app/lib/judge.ts` |
| Chat history — sessions + messages in Postgres | `app/lib/db/` |
| Prompt versioning — v1–v5, one line to switch | `app/lib/prompts.ts` |
| Structured JSON logging per request | `app/api/chat/route.ts` |

## Database schema

```
sessions          — conversation sessions (UUID)
messages          — full chat history per session
product_embeddings — persisted RAG embeddings (survives cold starts)
evaluations       — LLM-as-judge scores per request (queryable over time)
```

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

Push schema to database:

```bash
export $(cat .env.local | xargs) && npx drizzle-kit push
```

Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test
```

4 test files, 39 tests covering the agentic loop, all tools, prompt versioning, and guardrail (including fail-open paths).

## Structured log (emitted per request)

```json
{
  "session_id": "c13aec62-...",
  "tokens_used": { "input": 4927, "output": 533 },
  "tool_calls": ["search_products", "check_product_availability"],
  "latency_ms": 3200,
  "judgment_score": 5,
  "guardrail_blocked": false,
  "error": null
}
```

Blocked requests log `guardrail_blocked: true` and `tokens_used: 0` — the agent loop never ran.

## Developer endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/cache` | Inspect in-memory product + RAG cache state |
| `GET /api/docs` | Interactive API docs (Scalar / OpenAPI) |

## Docs

- [`LEARNING.md`](./LEARNING.md) — full explanation of every concept built, with analogies
- [`PATTERNS.md`](./PATTERNS.md) — design patterns used in the project with code examples
