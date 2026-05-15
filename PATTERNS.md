# Design Patterns — The Blueprints Behind the Code

**Analogy:** A building architect doesn't invent a new way to support a roof for every project. They reach for known solutions — arches, load-bearing walls, cantilevers — because those patterns have been tested, named, and understood by everyone on the team. Software design patterns work the same way: named, reusable solutions to recurring problems. Knowing the name lets you recognize the pattern in other codebases and apply it correctly in new ones.

This project uses both classic software patterns and AI-specific ones. Here they are, tied to the exact files where they appear.

---

## AI-Specific Patterns

### Agentic Loop (ReAct)
**File: `app/lib/agent.ts`**

**Analogy:** A detective doesn't solve a case with one piece of evidence. They gather a clue, follow the lead, gather another clue, follow that lead, and keep going until the full picture emerges. The agentic loop is that detective — the model decides what to investigate next, not you.

The model is given tools and a question. It decides whether to call a tool or answer directly. If it calls a tool, the result is added to the conversation and the loop runs again. The model controls the flow — your code just executes what it asks for.

```
LLM → tool_use? → execute tool → feed result back → LLM → ... → end_turn
```

`MAX_ITERATIONS = 10` is the safety valve. Without it, a confused model can loop forever.

**Why it matters:** This is the core pattern in every AI agent. Everything else in this project (RAG, persistence, streaming) is plugged in around it.

---

### Tool Use / Dispatcher
**File: `app/lib/tools.ts`**

**Analogy:** A restaurant has a menu (what customers can order) and a kitchen (where food is actually made). The waiter takes the order and routes it to the right station. The customer never sees the kitchen.

Two concerns are kept strictly apart:
- **`TOOL_DEFINITIONS`** — what the model *sees*: name, description, input schema. This is the menu.
- **`TOOL_MAP` + implementations** — what actually runs. This is the kitchen.
- **`executeTool()`** — the dispatcher. Routes the model's request to the right function.

```ts
const TOOL_MAP = {
  search_products: searchProducts,
  check_order_status: checkOrderStatus,
  // ...
}

export async function executeTool(name, input) {
  const fn = TOOL_MAP[name]
  if (!fn) throw new Error(`Unknown tool: ${name}`)
  return fn(input)
}
```

The model never calls your functions directly — it declares intent, and the dispatcher executes it. This decoupling means you can add, remove, or swap tool implementations without touching the model integration.

---

### RAG — Retrieval-Augmented Generation
**File: `app/lib/rag.ts`**

**Analogy:** Instead of asking a consultant to memorize the entire product catalog, you hand them a folder with only the three most relevant product sheets *for this specific customer question*. They answer from the folder, not from memory.

```
user query → embed → cosine similarity → top-K products → model context
```

The embedding step converts text into a point in high-dimensional space. Cosine similarity finds which product points are closest to the query point — "nearest neighbors" in meaning, not exact keywords.

The three-tier cache built for this project is the production version of this pattern:

```
in-memory cache  →  Postgres  →  OpenAI API
(same process)      (cold start)   (first ever run)
```

---

### LLM-as-Judge / Evaluator
**File: `app/lib/judge.ts`**

**Analogy:** A newspaper editor doesn't just print what reporters write. A second set of eyes reviews each article against a checklist: Is it accurate? Is it clear? Does it answer the headline?

After Claude answers, a second Claude call evaluates that answer. The judge scores helpfulness, accuracy, and clarity. This is how you evaluate AI quality at runtime — you can't express "was this response helpful?" as a unit test.

```
First call:  Claude answers the customer (using tools)
Second call: Claude (as judge) scores the answer 1–5 and explains why
```

In production, you'd run the judge asynchronously and aggregate scores over time to detect regressions when you change a prompt.

---

### Prompt Versioning
**File: `app/lib/prompts.ts`**

**Analogy:** A chef's recipe book. Every tweak gets its own entry, nothing is overwritten, and one line controls which recipe is in use today. You can roll back instantly and compare versions side-by-side in git.

```ts
const ACTIVE_VERSIONS: Record<string, number> = {
  'product-qa': 5,   // ← one line to switch versions
}
```

Prompt changes are code changes — they live in version control, they're reviewable in PRs, and the active version is included in every API response so you always know which prompt produced a given answer.

---

## Classic Software Patterns

### Singleton
**Files: `app/lib/anthropic.ts`, `app/lib/rag.ts`, `app/lib/db/index.ts`**

**Analogy:** A coffee machine at the office. You don't buy a new machine every time someone wants coffee. You buy one, put it in the break room, and everyone shares it.

```ts
let _client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!_client) _client = new Anthropic()
  return _client
}
```

The client is created once (lazily, on first use) and reused for every subsequent call. This matters especially in serverless: connection setup is expensive, and doing it per-request wastes time and money.

The *lazy* part is critical — the client is created only when a request actually arrives, not at import time. Creating it at module scope causes the constructor to run during the Next.js build phase, where no environment variables exist, and it throws immediately (see Bug 1 in `LEARNING.md` Section 17).

---

### Callback / Observer
**File: `app/lib/agent.ts` → `AgentCallbacks`**

**Analogy:** A live sports broadcast. The athlete just plays the game — they don't decide whether the footage goes to TV, radio, or a streaming app. The broadcast infrastructure listens and routes the output wherever it's needed.

```ts
type AgentCallbacks = {
  onText: (text: string) => void
  onToolCall: (name: string) => void
}
```

The agent fires events (`onText`, `onToolCall`) but has no knowledge of SSE, HTTP, or the browser. The route handler wires those callbacks to the SSE stream. The same agent could run in a CLI, a test, or a WebSocket with zero changes to `agent.ts`.

This is why tests can verify agent behavior without an HTTP server — they just pass plain functions as callbacks:

```ts
const onText = vi.fn()
await runAgent(messages, system, { onText, onToolCall: vi.fn() })
expect(onText).toHaveBeenCalledWith('Your order is shipped.')
```

---

### Repository
**File: `app/lib/db/queries.ts`**

**Analogy:** A library's front desk. You don't go into the stacks yourself — you ask the librarian. They know where everything is and handle all the searching. If the library reorganizes the stacks, you don't change how you ask — you just ask the same librarian.

All database access is behind named functions:

```ts
getOrCreateSession(sessionId?)
saveMessage(sessionId, role, content)
getMessages(sessionId)
getStoredEmbeddings()
saveEmbeddings(entries)
```

Nothing outside this file writes raw Drizzle queries. If you swap Neon for another database, you change one file and nothing else notices.

---

### Three-Tier Cache
**File: `app/lib/rag.ts` → `getProductEmbeddings()`**

**Analogy:** Looking up a word. First you check your own memory (instant). If you can't remember, you check the notebook on your desk (fast). If it's not there, you go to the library (slow but authoritative). On the way back, you write it in your notebook so you won't need the library next time.

```
in-memory variable  →  Postgres table  →  OpenAI embeddings API
     ~0ms                  ~10ms               ~300ms + cost
```

Each tier is cheaper and faster than the next. The rule: check the cheapest source first, fall through only if needed, populate all cheaper tiers on the way back.

This pattern appears everywhere in production systems: L1/L2/L3 CPU cache, CDN → origin → database, Redis → Postgres → external API.

---

## How the Patterns Connect

```
ProductChat.tsx (UI)
  │
  │  fires Callback: onText / onToolCall
  ▼
/api/chat  (route)
  │
  │  Repository: getOrCreateSession, getMessages, saveMessage
  │  Singleton: getDb()
  ▼
runAgent()  ← Agentic Loop
  │
  │  Callback → SSE stream (Observer)
  │
  ├─ executeTool()  ← Dispatcher
  │    │
  │    └─ retrieveProducts()  ← RAG + Three-Tier Cache
  │         Singleton: getOpenAI()
  │
  └─ judgeResponse()  ← LLM-as-Judge
       Singleton: getAnthropic()
```

**The key insight:** Agentic Loop + Callbacks is the skeleton. Every other pattern is an organ plugged into it. RAG gives the agent knowledge. Repository gives it memory. LLM-as-judge gives it a quality signal. Singleton keeps it efficient. Dispatcher keeps it extensible.
