# Logistics AI Agent - Evolution Project

## Context
This is an AI-powered product assistant for an electronics store.
We are evolving it to demonstrate production-grade AI engineering skills
for a technical interview focused on: tool calling, stateful agents,
persistence, and observability.

## Current State
- Next.js app with Claude API integration
- Agentic loop with 5 tools (search, order status, availability, shipping, escalation)
- RAG with OpenAI embeddings (text-embedding-3-small) wrapped as search_products tool
- Streaming via SSE (tool_call events, text events, metadata event)
- LLM-as-judge evaluation with token tracking
- Server-side chat history in Neon PostgreSQL via Drizzle ORM
- Structured JSON logging per request (tokens, latency, score, tool calls)
- Prompt versioning in app/lib/prompts.ts (currently v4, agent-aware)

## Evolution Goals (in order of priority)

### ✓ 1. Tool Calling (highest priority)
Replace the RAG-only approach with an agentic loop using tool calling.
Keep RAG as one of the tools, but let the model decide when to use it.

Tools implemented (app/lib/tools.ts):
- search_products(query) → wraps existing RAG logic
- check_order_status(order_id) → mock data
- check_product_availability(sku) → mock data
- get_shipping_estimate(product_id, zip_code) → mock data
- escalate_to_support(reason, priority) → logs and returns confirmation

Agentic loop (app/lib/agent.ts):
- Multiple tool calls in sequence (and in parallel when requested together)
- Tool errors handled gracefully (never hangs)
- MAX_ITERATIONS = 10 guard

### ✓ 2. Server-side State Persistence
Chat history moved from React state to Neon (serverless PostgreSQL) via Drizzle ORM.
Each conversation gets a session_id (UUID).
Schema: sessions(id, created_at) + messages(id, session_id, role, content, created_at)
Files: app/lib/db/schema.ts, app/lib/db/index.ts, app/lib/db/queries.ts

### ✓ 3. Structured Logging / Observability
Every request emits a JSON log (visible in Vercel function logs):
- session_id
- tokens_used (input + output, summed across all agent iterations + judge)
- tool_calls (array of tool names called, in order)
- latency_ms
- judgment_score (from LLM-as-judge)
- error (null on success)

## Technical Constraints
- TypeScript strict mode
- Never break existing streaming behavior
- Keep LLM-as-judge evaluation
- Keep prompt versioning pattern
- Error handling must always return a user-friendly message

## Code Style
- Prefer explicit types over inference
- Functions should do one thing
- Keep API routes thin - logic goes in lib/