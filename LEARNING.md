# What We Built — And Why It Works

This document explains everything we built together in plain language, with analogies to make the concepts stick.

---

## The Big Picture

We built an AI-powered product assistant for an electronics store. A customer can type a question like *"I need something for long flights"* and get a smart, accurate answer — even though we never explicitly programmed what to say about flights.

The full pipeline looks like this:

```
Customer question
  → Load conversation history from database
  → Agent decides which tools to call
  → Tools run (search products, check stock, get shipping, etc.)
  → Claude answers using tool results
  → Save messages to database
  → Stream the answer word by word to the screen
  → Grade the answer automatically (LLM-as-judge)
  → Emit structured log (tokens, latency, score, tool calls)
```

Each piece is explained below.

---

## 1. The Claude API — Hiring a Smart Consultant

**Analogy:** Imagine you hire a consultant. Before the meeting, you hand them a briefing document ("You work for our electronics store, here are our products..."). Then the customer walks in and asks a question. The consultant answers based on the briefing.

That's exactly the Claude API:

- **System prompt** = the briefing document (who are you, what do you know)
- **User message** = the customer's question
- **Assistant response** = the consultant's answer

```
System: "You are a helpful assistant for Lumina Wireless Headphones..."
User: "What colors does it come in?"
Claude: "It comes in Black, White, and Midnight Blue!"
```

We call the API from a **Route Handler** — a server-side function in Next.js that runs on Vercel's servers, not in the user's browser. This is important because the API key must stay secret on the server.

---

## 2. The `server-only` Guard — A Restricted Access Badge

**Analogy:** In a building, some rooms require a special security badge. If you walk in without one, the alarm goes off immediately.

The `server-only` package works the same way. We created `app/lib/anthropic.ts` with `import 'server-only'` at the top. If anyone ever accidentally imports this file in a client component (code that runs in the browser), the build fails immediately with a clear error — before it ever reaches production.

This prevents the most common security mistake in Next.js: accidentally exposing API keys to the browser.

---

## 3. Environment Variables — Keys to a Safe

**Analogy:** Your API key is like the combination to a safe. You wouldn't write it on a sticky note stuck to the safe. You keep it somewhere secure and only share it with people who need it.

- **`.env.local`** = your personal copy of the combination (never committed to git)
- **Vercel Environment Variables** = the secure vault in production (set through the dashboard)
- **`process.env.ANTHROPIC_API_KEY`** = the code that "opens the safe" at runtime

The `.gitignore` file blocks `.env*` files from ever being committed to GitHub — git refuses to touch them.

---

## 4. Prompt Versioning — A Recipe Book

**Analogy:** Imagine you're a chef with a signature sauce recipe. Over time you tweak it — more garlic in v2, added lemon in v3. You keep all versions written down so you can compare them, roll back if a version is bad, and know exactly which version you're serving today.

That's `app/lib/prompts.ts`. It stores all prompt versions for each feature, and a single line controls which one is active:

```ts
const ACTIVE_VERSIONS = {
  'product-qa': 4,  // ← change this to switch versions
}
```

- **v1**: concise and helpful, single hardcoded product
- **v2**: enthusiastic, redirects off-topic questions
- **v3**: dynamic — accepts product context injected from the RAG step
- **v4**: agent-aware — instructs Claude to use tools instead of relying on pre-loaded context

The API response always includes `promptVersion` so you know exactly which recipe was used for each answer.

---

## 5. RAG — The Open-Book Exam

**Analogy:** Imagine two ways to take an exam:
- **Closed-book**: You memorize everything and answer from memory. Risky — you might misremember or make things up.
- **Open-book**: Before answering, you quickly scan the relevant pages and answer based on what you find. More accurate, and you can't invent things that aren't in the book.

RAG (Retrieval-Augmented Generation) is the open-book exam approach. Instead of hoping Claude knows your products, you *retrieve* the relevant product info first and give it to Claude along with the question.

### How retrieval works: Embeddings and Similarity

**Analogy:** Imagine a map where every word or sentence has a location. Words with similar meanings are placed near each other on the map. "Headphones" and "earbuds" are close together. "Power bank" and "battery" are close together. "Keyboard" is far from "speaker."

An **embedding** is just a list of hundreds of numbers that represents a sentence's position on this map.

**Finding the best match** = finding which product points are closest to the question point. This is called **cosine similarity** — it measures the angle between two points. Smaller angle = more similar meaning.

```
"long flights" question  →  [0.2, -0.5, 0.8, ...]  (hundreds of numbers)
Lumina Headphones        →  [0.3, -0.4, 0.7, ...]  (very close → high similarity)
TypeFlow Keyboard        →  [-0.6, 0.2, -0.1, ...]  (far away → low similarity)
```

In our current architecture, RAG still exists but is wrapped inside a **tool** called `search_products`. Claude decides when to call it rather than it always running automatically.

---

## 6. LLM-as-Judge — The Quality Inspector

**Analogy:** Imagine a factory assembly line. A worker builds a product, and then a quality inspector checks it before it ships. The inspector has a checklist: Is it accurate? Does it answer the question? Did it invent any features?

LLM-as-judge is the same idea: after Claude answers, a *second* Claude call evaluates the answer.

```
First call:  Claude answers the customer's question (using tools)
Second call: Claude (as judge) scores the answer 1–5 and explains why
```

The judge checks:
- **Helpfulness** — did it actually answer what was asked?
- **Accuracy** — is the answer consistent and grounded?
- **Clarity** — is it clear and appropriately concise?

A score of 4+ = pass. When the agent uses tools, the judge is told which tools were called so it doesn't mistakenly penalize Claude for "making things up."

---

## 7. Tool Calling — Giving the Consultant a Toolbox

**Analogy:** Your consultant is smart, but they don't know everything from memory. So you give them a set of tools they can use during the meeting: a product catalog search, an order tracking system, a stock checker, a shipping calculator, and an escalation button. They decide on their own which tools to use and in what order.

We built 5 tools in `app/lib/tools.ts`:

| Tool | What it does |
|---|---|
| `search_products` | Searches the product catalog using RAG |
| `check_order_status` | Looks up an order by ID (e.g. ORD-1001) |
| `check_product_availability` | Checks if a product is in stock |
| `get_shipping_estimate` | Returns shipping options and costs to a zip code |
| `escalate_to_support` | Creates a support ticket for unresolvable issues |

Each tool has a **schema** — a description of what it does and what inputs it needs. Claude reads these schemas and decides on its own which tools to call.

---

## 8. The Agentic Loop — The Consultant Who Keeps Researching Until Done

**Analogy:** A good consultant doesn't just answer immediately. They might say "let me check the stock first" → check it → "now let me get the shipping rate" → check that too → then give you a complete answer. They loop through research steps until they have everything they need.

That's the agentic loop in `app/lib/agent.ts`. It runs like this:

```
1. Send question to Claude (with tool definitions)
2. Claude says: "I need to call search_products"
3. We run search_products, get the result
4. Send result back to Claude
5. Claude says: "Now I need check_product_availability"
6. We run it, get the result, send it back
7. Claude says: "Now I have enough — here's my answer"
8. Done
```

Key safety features:
- **MAX_ITERATIONS = 10**: if Claude keeps calling tools without finishing, we stop after 10 rounds. This prevents infinite loops.
- **Per-tool error handling**: if one tool fails, the error is passed back to Claude. The loop never hangs.
- **Parallel tool execution**: if Claude requests multiple tools at once, they all run at the same time.

---

## 9. Streaming — Cooking in Front of You

**Analogy:** Two restaurant experiences:
- **No streaming**: You order, wait 10 minutes in silence, then the full plate arrives.
- **Streaming**: The chef cooks in front of you. You can see the dish being assembled in real time.

The server sends **Server-Sent Events (SSE)** — a stream of small messages the browser reads one by one:

```
data: {"type":"tool_call","name":"search_products"}
data: {"type":"tool_call","name":"check_product_availability"}
data: {"type":"text","text":"The Lumina headphones are in stock..."}
data: {"type":"text","text":" and ship for $4.99 standard."}
data: {"type":"metadata","judgment":{...},"toolCallsLog":[...]}
data: [DONE]
```

Tool calls appear first (so the user sees "calling: search_products..."), then the text answer, then the judgment.

---

## 10. Chat History — Short-Term Memory

**Analogy:** Imagine calling customer support. In version A, every time you ask a follow-up question the agent has no memory of what you just said. In version B, the agent remembers the whole conversation.

The entire conversation is stored in the database and loaded on every request. The client only sends the new message and the session ID — the server fetches the rest:

```
Client sends:  { message: "is it in stock?", session_id: "abc-123" }
Server loads:  all previous messages from Neon
Server sends:  full history + new message to Claude
```

Claude sees the full context and knows "it" refers to the product mentioned earlier. The "memory" is history loaded from the database, not re-sent by the browser.

---

## 11. Server-side Persistence — The Hotel Guest Registry

**Analogy:** Imagine a hotel. When you check in, you're given a room key with a unique ID. Every time you come back — even after leaving and returning — the front desk looks up your ID in the registry and knows exactly who you are and what you need. If you lose your key and get a new one, your history is gone. But as long as you keep your key, the front desk remembers everything.

That's our session system. Each conversation gets a **UUID** (a unique ID like `a2899e6f-9db8-4219-936d-b79d29650dac`). The database stores every message:

```
sessions table:
  id (UUID)  |  created_at

messages table:
  id  |  session_id  |  role  |  content  |  created_at
```

We use **Drizzle ORM** to talk to the database. Drizzle lets you write database queries in TypeScript instead of raw SQL:

```ts
// Instead of: SELECT * FROM messages WHERE session_id = ?
const rows = await db.select().from(messages).where(eq(messages.sessionId, sessionId))
```

The database runs on **Neon** — a serverless PostgreSQL service with a free tier. "Serverless" here means you don't manage a server; Neon scales automatically and only charges for what you use (which for this project is essentially free).

**Why move history to the server?**
- Before: if you refreshed the page, conversation was gone (it only lived in React state)
- After: history survives page refreshes, device switches, and server restarts
- Bonus: the client payload is much smaller — no need to send the entire history on every request

---

## 12. Structured Logging / Observability — The Flight Recorder

**Analogy:** Every commercial aircraft has a black box — a flight recorder that captures everything: speed, altitude, engine status, pilot inputs. If something goes wrong, investigators can open the black box and understand exactly what happened, when, and why.

Our structured log is the black box for every AI request. After each conversation turn, we emit one JSON line:

```json
{
  "session_id": "c13aec62-17f6-481a-9afc-c11c39d40fb4",
  "tokens_used": { "input": 4927, "output": 533 },
  "tool_calls": ["search_products", "check_product_availability", "get_shipping_estimate"],
  "latency_ms": 18333,
  "judgment_score": 5,
  "error": null
}
```

**Why each field matters:**

| Field | What it tells you |
|---|---|
| `session_id` | Which conversation — link to the full history in the DB |
| `tokens_used` | How much it cost — input + output across all LLM calls |
| `tool_calls` | What the agent did — which tools fired and in what order |
| `latency_ms` | How long the user waited — useful for spotting slow queries |
| `judgment_score` | Quality score — if this drops, something changed for the worse |
| `error` | What went wrong — `null` means success |

These logs appear in Vercel's function logs. From there you can pipe them to any monitoring tool (Datadog, Grafana, a simple database) to answer questions like:
- "Which sessions have low judgment scores?"
- "Which tool calls are slowest?"
- "How much are we spending per session?"
- "Did the last prompt change improve or hurt quality?"

---

## 13. Unit & Integration Tests — The Safety Net

**Analogy:** Imagine a trapeze artist. They can fly through the air with confidence *because there's a net below*. The net doesn't make them perform — it just means a mistake doesn't end the show. Tests are that net: they don't write your features, but they catch regressions before they reach users.

We use **Vitest** — a fast test runner designed for modern TypeScript projects.

### Three test files

| File | Type | What it tests |
|---|---|---|
| `tools.test.ts` | Unit | All 5 tool functions with controlled inputs |
| `prompts.test.ts` | Unit | Prompt versioning, active version, context injection |
| `agent.test.ts` | Integration | The full agentic loop — tool calls, errors, iteration limit |

### Unit tests — Testing one thing at a time

**Analogy:** A car mechanic doesn't test-drive the car to check if the windshield wipers work. They hook up the switch directly and watch the wipers move. Unit tests do the same — test one function in isolation, with fake inputs.

For `checkOrderStatus`, we pass a known order ID and assert on the exact response:
```ts
const result = await executeTool('check_order_status', { order_id: 'ORD-1001' })
expect(JSON.parse(result).status).toBe('shipped')
```

No database. No API. Just the function and its logic.

### Integration tests — Testing how pieces work together

**Analogy:** After testing each part separately, you put them all in the car and take it for a short test drive. Integration tests check that the parts *talk to each other correctly*.

The agent integration tests verify the full loop: LLM call → tool use → result back to LLM → final answer. We mock the Anthropic API to return scripted responses, then confirm the agent behaves correctly end-to-end:

```
Mock: Claude says "call check_order_status"
→ Agent runs the tool
→ Agent sends result back to Claude
Mock: Claude says "Your order is shipped"
→ Assert: fullText = "Your order is shipped", toolCallsLog = ["check_order_status"]
```

### Mocking — Replacing the real with a controlled fake

**Analogy:** Flight simulators. Pilots train in a fake cockpit that behaves exactly like the real one — without the risk of crashing a real plane. Mocks are the same: they simulate the real dependency (OpenAI, Anthropic, the database) so tests are fast, free, and predictable.

We mock three things:
- `server-only` → replaced with an empty file (it only guards against browser imports)
- `../lib/rag` → `retrieveProducts` returns a hardcoded product list
- `../lib/anthropic` → `getAnthropic().messages.create` returns scripted responses

### Why SDK clients must be lazy

One subtle bug we fixed: both `new OpenAI()` and `new Anthropic()` were created at the *top level of their modules*. This means they run the moment the file is imported — including at build time, when Next.js analyzes every route. With no API keys available during the build, the constructors threw immediately.

The fix: create the client *inside* the function, only when a real request arrives:

```ts
// Before — runs at import time, throws during build
const openai = new OpenAI()

// After — runs only when called at runtime
async function retrieveProducts(query: string) {
  const openai = new OpenAI()  // ← safe now
  ...
}
```

---

## 14. Live Product Data — Replacing the Dummy Catalog

**Analogy:** Imagine training a new employee using a fake product brochure. They learn the process perfectly — but when a real customer asks about a real product, they're lost. Switching to real data is the moment your system stops being a demo and starts being a product.

We replaced the 6 hardcoded products with live data from **Fake Store API** (electronics category):

```
https://fakestoreapi.com/products/category/electronics
```

The API returns items like "WD 2TB External Hard Drive" and "SanDisk 1TB SSD" with real names, prices, and descriptions. We map them to our `Product` type:

```ts
cache = data.map((item) => ({
  id: String(item.id),   // Fake Store uses numbers; we use strings
  name: item.title,
  price: item.price,
  description: item.description,
}))
```

### Caching with revalidation

We don't hit the API on every request. The result is cached in two ways:
- **In-memory**: once fetched per server instance, the products array is stored in a module-level variable
- **Next.js fetch cache**: `next: { revalidate: 3600 }` tells Next.js to refresh the cached fetch response every hour

This means: fast responses, no unnecessary API calls, and automatically fresh data every hour.

The RAG embeddings are built from these live products, so the semantic search works just as well — it just now understands what a "WD hard drive" or a "SanDisk SSD" is.

---

## 15. CI/CD Pipeline — The Assembly Line

**Analogy:** Imagine a car factory in the 1900s versus today. In the 1900s, workers hand-built each car from scratch — slow, inconsistent, prone to mistakes. Today, an assembly line moves the car through automated stations: one station checks safety, another checks paint, another runs the engine. A car that fails any station doesn't leave the factory.

CI/CD is the software equivalent. Every time code is pushed, it moves through an automated pipeline:

```
Developer pushes to main
        │
        ▼
GitHub Actions (CI — Continuous Integration)
        │
        │  1. Checkout code
        │  2. Install dependencies
        │  3. npm test → run all 32 tests
        │
        ├── FAIL → pipeline stops, deploy is blocked
        │
        └── PASS ↓
        
Deploy job (CD — Continuous Delivery)
        │
        │  1. vercel pull → download env vars from Vercel
        │  2. vercel build → build the Next.js app
        │  3. vercel deploy --prebuilt → ship to production
        │
        ▼
Production (live at Vercel)
```

### Two jobs — test and deploy

The pipeline has two jobs. `deploy` has `needs: test`, which means it won't even start unless `test` passes:

```yaml
jobs:
  test:
    steps:
      - run: npm install
      - run: npm test       # ← if this fails, deploy never runs

  deploy:
    needs: test             # ← depends on test passing
    if: push to main only
    steps:
      - run: vercel pull
      - run: vercel build --prod
      - run: vercel deploy --prebuilt --prod
```

### Pull Requests get tested too

The pipeline runs on `pull_request` as well, but the deploy job is skipped (it only runs on pushes to `main`). This means every PR shows a green or red check before you merge — so broken code never reaches `main` in the first place.

### Why we disabled Vercel's GitHub integration

Vercel has its own auto-deploy: push to GitHub → Vercel builds and deploys automatically, without any checks. We disabled this because it bypasses the test gate entirely. Now Vercel only deploys when our pipeline explicitly tells it to — after tests pass.

---

## 16. Chat UX — From Bare HTML to a Real Interface

**Analogy:** A restaurant can serve great food on paper plates. The food is the same — but the experience feels completely different with proper plates, a nice table, and good lighting. UX is the presentation layer.

We rebuilt the chat interface from bare unstyled HTML into a proper chat UI:

- **Chat bubbles** — user messages on the right in indigo, assistant messages on the left in gray
- **Markdown rendering** — Claude's responses use `**bold**`, `## headings`, and bullet lists; we render these properly instead of showing the raw symbols
- **Tool call chips** — while the agent is working, animated chips appear showing which tool is running (`Searching products...`, `Checking stock...`)
- **Suggestion buttons** — the empty state shows starter questions so new users aren't staring at a blank box
- **Auto-resizing textarea** — the input grows as you type; Enter sends, Shift+Enter adds a new line
- **Judgment badge** — the quality score appears as a small `5/5` badge under each response; hover it to read the judge's reasoning

---

## 17. Production Debugging — Reading the Black Box

**Analogy:** When a plane lands safely, nobody reads the flight recorder. But when something goes wrong mid-flight, the black box is the only way to know what actually happened. Production bugs are the same — you can't reproduce them locally, so you rely entirely on what was logged.

We hit three real production bugs after deploying. Each one taught a different lesson.

### Bug 1 — SDK clients throwing at build time

**Symptom:** GitHub Actions build failed with `Missing credentials` for OpenAI, then later `No database connection string` for Neon.

**Cause:** `new OpenAI()`, `new Anthropic()`, and `neon()` were all called at the *top level of their modules*. Next.js imports every route during its build phase to analyze it — with no env vars available. Each constructor threw immediately.

**Fix:** Move client creation inside the function body so it only runs when an actual request arrives, not at import time:

```ts
// Breaks at build time
const openai = new OpenAI()

// Safe — only runs when called
async function retrieveProducts(query: string) {
  const openai = new OpenAI()
  ...
}
```

**Lesson:** Any code at module scope runs during the build. Constructors that read env vars must be lazy.

---

### Bug 2 — Third-party API blocked by Vercel (403)

**Symptom:** The assistant responded with a vague apology about the product search system not working. All HTTP responses were 200 — no obvious error.

**Why 200s are misleading here:** The route handler always returns 200 because the SSE stream starts fine. Tool errors are caught inside the agent loop, passed back to Claude as text, and Claude composes a polite apology. The route never throws — it just delivers bad content.

**How we found it:** We added `console.error('[tool:search_products]', err)` to the tool error handler. The next deploy showed `Fake Store API responded with 403` in the function logs.

**Cause:** Fake Store API blocks requests from Vercel's server IP ranges.

**Fix:** Fetch the data once locally, commit it as `app/lib/data/products.json`, and import it directly. No runtime network call, no third-party dependency, instant access.

**Lesson:** A 200 status code only means the stream started. Always log tool errors explicitly so they show up in function logs — otherwise failures are invisible.

---

### Bug 3 — RAG returning wrong products, agent using wrong tool inputs

**Symptom:** Customer asked about monitors. The agent checked availability for SSDs and hard drives instead, then couldn't find shipping for the monitors.

**Two root causes:**

1. **Missing keyword in product data.** The Acer monitor's name was `"Acer SB220Q bi 21.5 inches Full HD (1920 x 1080) IPS Ultra-Thin"` — no word "monitor" anywhere. The RAG embedding for this product was far from the "monitor" query vector. The product simply didn't exist in the search results.

2. **Agent calling tools with names instead of IDs.** The v4 prompt said "call `check_product_availability` before recommending a product" but didn't say *how*. Claude would sometimes call it with `sku: "monitor"` (a generic name) instead of `sku: "13"` (the product ID from search results). The name lookup is a substring match — it doesn't find "Acer" when given "monitor".

**Fix 1 — Data quality:** Renamed the product to `"Acer SB220Q 21.5-inch Full HD IPS Monitor"` so the embedding includes the word "monitor".

**Fix 2 — Prompt v5:** Added explicit instructions:
- *"Always call `search_products` first. Use the product IDs returned by `search_products` when calling `check_product_availability` or `get_shipping_estimate`."*
- *"Never expose internal tool errors or system failures to the customer."*

**Lesson:** RAG quality depends entirely on how well your data is described. A product with no searchable keywords is invisible to semantic search. And prompts must be explicit about *how* to use tool results — not just *when* to call tools.

---

## 18. Developer Tooling — Making the System Transparent

**Analogy:** Imagine you're maintaining a vending machine. The customer sees buttons and a slot. But you, as the technician, need a service panel: a small hidden door that shows the current inventory, whether the motors are working, and what the last errors were — all without having to physically open the machine. Good developer tooling is that service panel.

We added two tools for exactly this.

### Cache inspection endpoint (`/api/cache`)

The assistant uses two in-memory caches that aren't visible from the outside:
- **Products cache** — the static product catalog loaded from `products.json`
- **RAG cache** — the OpenAI embeddings built the first time `search_products` is called

Without a way to inspect these, you'd have to guess whether the embeddings were warm or cold, or whether the products loaded correctly.

`GET /api/cache` exposes both:

```json
{
  "products": {
    "loaded": true,
    "count": 6,
    "products": [{ "id": "9", "name": "...", ... }]
  },
  "rag": {
    "loaded": false,
    "count": 0,
    "products": []
  }
}
```

`rag.loaded: false` means no search has happened yet and the embeddings haven't been built. After the first conversation involving a product search, `rag.loaded` flips to `true`. This lets you confirm the warm-up happened without digging through logs.

### Interactive API docs (`/api/docs`)

Testing an API usually requires a separate tool — Postman, curl, or a browser extension. **Scalar** eliminates that: it renders an interactive documentation page directly inside the app at `/api/docs`.

```
Spring Boot equivalent: springdoc-openapi (Swagger UI)
```

The setup has two parts:

1. **`app/api/docs/openapi.ts`** — an OpenAPI 3.1 spec written as a TypeScript object. Describes every endpoint: path, method, request body shape, response shape, and example values.

2. **`app/api/docs/route.ts`** — a single Next.js route that imports `ApiReference` from `@scalar/nextjs-api-reference` and serves the full HTML UI:

```ts
export const GET = ApiReference({
  content: openApiSpec,
  pageTitle: 'Electronics Store API',
})
```

Open `/api/docs` in a browser and you get the full interface: expandable endpoint cards, schema explorer, and a "Try it" button that sends real requests and shows the live response — no Postman needed.

---



```
Browser (React)
│
│  User types a message
│  Sends: { message, session_id }
│
▼
Vercel (Next.js Route Handler)  ← server-only, API keys safe here
│
│  1. Load session history from Neon (DB)
│  2. Save user message to Neon
│  3. Agentic loop (app/lib/agent.ts):
│     ┌─────────────────────────────────────────┐
│     │  Send messages + tool definitions        │
│     │  Collect token usage per iteration       │
│     │  Claude responds with tool_use blocks    │
│     │  Execute tools (in parallel if multiple) │
│     │  Add tool results to history             │
│     │  Repeat until end_turn or MAX_ITERATIONS │
│     └─────────────────────────────────────────┘
│  4. Stream text response via SSE
│  5. Save assistant message to Neon
│  6. Run LLM-as-judge → score + token usage
│  7. Send metadata event (judgment, tool log, session_id)
│  8. Emit structured log (tokens, latency, score, error)
│
▼
Browser (React)
│
│  Shows tool calls as they fire
│  Updates text on screen as tokens arrive
│  Stores session_id for next message
│  Shows judgment when metadata event arrives
```

---

## 19. Design Patterns — The Blueprints Behind the Code

Every feature built in this project is an instance of a named, reusable pattern. Recognizing them by name lets you spot the same solutions in other codebases and apply them deliberately in new ones.

The full breakdown — with analogies, code examples, and file references — is in **[PATTERNS.md](./PATTERNS.md)**.

The short version of how they all connect:

```
ProductChat.tsx (UI)
  │  Callback: onText / onToolCall
  ▼
/api/chat  →  Repository (queries.ts)  →  Singleton (getDb)
  ▼
checkGuardrail()  ←  Input Guardrail (Haiku)  →  blocked? return early
  ▼
runAgent()  ←  Agentic Loop
  ├─ executeTool()  ←  Dispatcher
  │    └─ retrieveProducts()  ←  RAG + Three-Tier Cache  ←  Singleton (getOpenAI)
  └─ judgeResponse()  ←  LLM-as-Judge  ←  Singleton (getAnthropic)
```

Agentic Loop + Callbacks is the skeleton. Every other pattern is plugged into it.

---

## 20. Guardrails — The Bouncer at the Door

**Analogy:** A nightclub has a bouncer at the entrance. They don't check every drink or conversation inside — they just make sure the right people get in and the wrong ones don't. The bouncer is fast, makes a simple yes/no decision, and the main event never starts for someone who shouldn't be there.

That's the guardrail pattern: a lightweight filter that runs *before* the expensive operation, not after.

---

### Why guardrails matter

Without a guardrail, every message — no matter how off-topic or malicious — enters the full agent loop:

```
user: "Write me a poem about the ocean."
→ getMessages() called
→ runAgent() called (full Sonnet model)
→ tools potentially called
→ judgeResponse() called
→ cost: ~$0.05, latency: ~3s
```

With a guardrail:

```
user: "Write me a poem about the ocean."
→ checkGuardrail() → blocked in ~200ms, ~$0.0002
→ agent loop never starts
```

---

### The implementation

**File: `app/lib/guardrail.ts`**

A single Haiku call with a tight classification prompt. Returns `{ allowed: boolean, reason: string }`.

```ts
const result = await checkGuardrail(message)

if (!result.allowed) {
  // stream polite decline, log, return early
  // agent loop never starts
}
```

**Why Haiku?** It's the smallest, fastest, cheapest Claude model — ideal for binary yes/no classification where speed and cost matter more than reasoning depth. A guardrail that takes 2 seconds defeats its own purpose.

---

### Fail-open vs fail-closed

This is an important design decision every guardrail must make.

**Fail-closed:** if the guardrail errors, block the message.
- Pro: nothing slips through during an outage
- Con: a guardrail bug blocks all legitimate users

**Fail-open:** if the guardrail errors, allow the message.
- Pro: users are never blocked by a guardrail failure
- Con: a guardrail outage means no filtering

For a customer-facing store assistant, **fail-open is the right choice**. A blocked customer is worse than an occasional off-topic answer. We fail open in two places:

```ts
// If the API throws
} catch {
  return { allowed: true, reason: 'Guardrail unavailable — defaulting to allow.' }
}

// If the JSON is malformed
} catch {
  return { allowed: true, reason: 'Guardrail parse error — defaulting to allow.' }
}
```

---

### What gets blocked

- **Off-topic requests** — "Write me a poem", "Explain quantum physics"
- **Prompt injection** — "Ignore all previous instructions and..."
- **Harmful content** — anything that would violate content policies

### What always passes through

- Product questions, order lookups, shipping, availability
- Ambiguous questions that *could* be store-related

---

### Observability

Blocked requests are logged with two new fields:

```json
{
  "guardrail_blocked": true,
  "guardrail_reason": "Request is unrelated to the electronics store.",
  "tokens_used": { "input": 0, "output": 0 }
}
```

`tokens_used: 0` on a blocked request is itself a signal — it means the agent loop was skipped entirely, saving cost.

---

### Input vs output guardrails

What we built is an **input guardrail** — it filters what goes *in*. An **output guardrail** would filter what comes *out* (checking Claude's response for PII, off-brand content, or hallucinations before it reaches the browser).

This project currently only has the input layer. Output guardrails follow the same pattern but run after `runAgent()` and before `send({ type: 'text', ... })`.

---

## 21. Persistindo Scores de Avaliação — O Histórico de Qualidade

**Analogia:** Imagine um restaurante onde o inspetor de qualidade avalia cada prato e anota a nota num bloco de papel. Se ele jogar fora o bloco depois de cada turno, nunca vai saber se a cozinha está melhorando ou piorando ao longo do tempo. Guardar as notas no banco é o que transforma uma avaliação pontual num sistema de monitoramento real.

---

### O problema anterior

O LLM-as-judge já existia e gerava um score para cada resposta — mas o score só ia para o log da função no Vercel:

```ts
console.log(JSON.stringify({ judgment_score: 4, ... }))
```

Logs da Vercel somem depois de um tempo e não são consultáveis. Não dava para responder: *"o score médio caiu depois que mudamos o prompt?"* ou *"quais sessões tiveram respostas ruins?"*

---

### A solução: tabela `evaluations`

**Arquivo: `app/lib/db/schema.ts`**

```ts
export const evaluations = pgTable('evaluations', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  score: integer('score').notNull(),        // 1–5
  passed: boolean('passed').notNull(),      // score >= 4
  reason: text('reason').notNull(),         // explicação do juiz
  promptVersion: integer('prompt_version').notNull(),
  toolCalls: text('tool_calls').notNull(),  // JSON array
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

Agora cada avaliação é salva permanentemente e pode ser consultada via SQL.

---

### Fluxo atualizado

```
runAgent()          → resposta do agente
judgeResponse()     → { score: 4, passed: true, reason: "..." }
saveEvaluation()    → INSERT na tabela evaluations   ← novo
send(metadata)      → score aparece no badge do chat
console.log(...)    → log estruturado (continua existindo)
```

---

### O que dá pra consultar agora

```sql
-- Score médio por versão de prompt
SELECT prompt_version, ROUND(AVG(score), 2) as avg_score, COUNT(*) as total
FROM evaluations
GROUP BY prompt_version
ORDER BY prompt_version;

-- Sessões com respostas ruins (score <= 2)
SELECT session_id, score, reason, created_at
FROM evaluations
WHERE score <= 2
ORDER BY created_at DESC;

-- Quais combinações de ferramentas têm melhor score
SELECT tool_calls, ROUND(AVG(score), 2) as avg_score, COUNT(*) as total
FROM evaluations
GROUP BY tool_calls
ORDER BY avg_score DESC;

-- Taxa de aprovação ao longo do tempo
SELECT DATE(created_at) as day,
       ROUND(100.0 * SUM(passed::int) / COUNT(*), 1) as pass_rate
FROM evaluations
GROUP BY day
ORDER BY day;
```

---

### Como o Drizzle ORM funciona

**Analogia:** Escrever SQL na mão é como montar um móvel lendo a lista de peças em voz alta. O Drizzle é o manual ilustrado — você descreve o que quer em TypeScript, e ele gera o SQL correto por baixo.

O Drizzle tem três partes neste projeto:

**1. Schema (`app/lib/db/schema.ts`) — definição das tabelas**

Você define as tabelas como objetos TypeScript. Cada coluna tem tipo, constraints e relações:

```ts
export const evaluations = pgTable('evaluations', {
  id: serial('id').primaryKey(),           // auto-incremento
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),        // foreign key
  score: integer('score').notNull(),
  passed: boolean('passed').notNull(),
})
```

O TypeScript infere os tipos automaticamente — se você tentar inserir uma string no campo `score`, o compilador avisa antes de rodar.

**2. Queries (`app/lib/db/queries.ts`) — consultas encadeadas**

Em vez de SQL raw, você usa uma API fluente:

```ts
// SELECT com filtro e ordenação
await getDb()
  .select({ role: messages.role, content: messages.content })
  .from(messages)
  .where(eq(messages.sessionId, sessionId))
  .orderBy(messages.createdAt)

// INSERT
await getDb().insert(evaluations).values({
  sessionId, score, passed, reason, promptVersion,
  toolCalls: JSON.stringify(toolCalls),
})

// INSERT sem falhar se já existir
await getDb()
  .insert(productEmbeddings)
  .values(...)
  .onConflictDoNothing()
```

**3. `drizzle-kit push` — sincronização com o banco**

Quando você adiciona ou modifica uma tabela no schema TypeScript, roda:

```bash
npx drizzle-kit push
```

Ele compara o schema TypeScript com o que existe no Postgres e aplica as mudanças (`CREATE TABLE`, `ALTER TABLE`, etc.) automaticamente — sem precisar escrever SQL de migração na mão.

**Por que o Repository pattern importa aqui:** todo o código Drizzle fica em `queries.ts`. O resto da aplicação só chama funções nomeadas (`saveEvaluation`, `getMessages`). Se você trocar Drizzle por outro ORM amanhã, só muda um arquivo.

---

## What You Learned

| Concept | What It Is | The Analogy |
|---|---|---|
| Claude API | Send a prompt, get a response | Hiring a consultant |
| System prompt | Instructions that shape every answer | The briefing document |
| `server-only` | Build-time guard against client exposure | Security badge |
| Environment variables | Secrets kept outside the codebase | Keys to a safe |
| Prompt versioning | Numbered, switchable prompt templates | Chef's recipe book |
| Embeddings | Sentences as points on a meaning-map | GPS coordinates for meaning |
| RAG | Retrieve context before answering | Open-book exam |
| Tool calling | Claude decides which functions to run | Consultant with a toolbox |
| Agentic loop | Repeated tool → result → tool cycles | Consultant who keeps researching |
| LLM-as-judge | Second LLM call to grade the first | Quality inspector |
| Streaming (SSE) | Send tokens and events as they happen | Chef cooking in front of you |
| Chat history | Conversation loaded from DB each turn | Support agent with memory |
| Server-side persistence | Sessions + messages stored in PostgreSQL | Hotel guest registry |
| Structured logging | JSON log per request with tokens, latency, score | Flight recorder / black box |
| Unit tests | Test one function in isolation with fake inputs | Mechanic testing a single part |
| Integration tests | Test how pieces work together end-to-end | Short test drive after assembly |
| Mocking | Replace real dependencies with controlled fakes | Flight simulator |
| Lazy initialization | Create expensive objects only when first needed | Boiling water only when making tea |
| Live product data | Fetch real products from an external API | Switching from brochure to real inventory |
| CI/CD pipeline | Automated test + deploy on every push | Factory assembly line with QC stations |
| Production debugging | Read logs to find errors invisible in local dev | Opening the flight recorder after an incident |
| Data quality for RAG | Product descriptions must include searchable keywords | A library with books that have no titles |
| Prompt precision | Tell the model *how* to use tools, not just *when* | A recipe that says "add seasoning" vs exact amounts |
| Cache inspection | Endpoint to check in-memory state without reading logs | Vending machine service panel |
| API documentation | Interactive browser UI to explore and test endpoints | Swagger UI for Next.js (via Scalar) |
| Agentic Loop (ReAct) | Model drives the loop, calls tools until it has enough to answer | Detective who keeps gathering clues |
| Tool Use / Dispatcher | Definitions (what model sees) separated from implementations (what runs) | Menu vs. kitchen |
| LLM-as-Judge | Second LLM call evaluates the first one's output | Newspaper editor reviewing the reporter |
| Singleton pattern | Expensive client created once, reused across all requests | One coffee machine for the whole office |
| Callback / Observer | Agent fires events; caller decides what to do with them | Athlete plays, broadcast crew handles the rest |
| Repository pattern | All DB access behind named functions, nothing else queries directly | Library front desk |
| Three-Tier Cache | Memory → DB → API; cheapest source checked first | Memory → notebook → library |
| Input guardrail | Fast Haiku call that blocks off-topic/harmful messages before the agent runs | Bouncer at the door |
| Fail-open design | On guardrail failure, allow the request rather than blocking legitimate users | Default to open gate when the lock breaks |
| Prompt injection | Attack where user tries to override the system prompt via the message field | Fake ID at the door |
| Evaluation persistence | Save LLM-as-judge scores to DB so quality trends are queryable over time | Inspector keeping a logbook instead of a sticky note |
| Drizzle ORM | TypeScript-first ORM — schema as code, fluent query API, `push` to sync with DB | Illustrated furniture manual vs. reading a parts list aloud |
| `drizzle-kit push` | Syncs TypeScript schema to Postgres without writing migration SQL by hand | Auto-updating the blueprint when you add a room |

---

## What's Next

The core system is production-ready: agentic loop, persistence, observability, guardrails, evaluation history, tests, CI/CD, and live data. Some directions to explore from here:

- **Analytics dashboard**: query the `evaluations` table to visualize score trends, pass rate by day, and prompt version comparisons
- **A/B testing prompts**: route traffic between prompt versions and compare average scores directly from the `evaluations` table
- **Output guardrail**: add a second filter after `runAgent()` to catch PII, off-brand responses, or hallucinations before they reach the browser
- **Vector database** (Pinecone, Supabase pgvector): move embeddings out of memory into a persistent store that scales to thousands of products
- **Real e-commerce backend**: replace mock order/stock data with a real database or API (Shopify, WooCommerce, etc.)
- **Test coverage reporting**: add `@vitest/coverage-v8` to measure which lines are covered and track it over time
