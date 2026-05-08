# What We Built — And Why It Works

This document explains everything we built together in plain language, with analogies to make the concepts stick.

---

## The Big Picture

We built an AI-powered product assistant for an electronics store. A customer can type a question like *"I need something for long flights"* and get a smart, accurate answer — even though we never explicitly programmed what to say about flights.

The full pipeline now looks like this:

```
Customer question
  → Agent decides which tools to call
  → Tools run (search products, check stock, get shipping, etc.)
  → Claude answers using tool results
  → Stream the answer word by word to the screen
  → Grade the answer automatically (LLM-as-judge)
  → Remember the conversation for follow-up questions
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

In our current architecture, RAG still exists but is now wrapped inside a **tool** called `search_products`. Claude decides when to call it rather than it always running automatically.

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

A score of 4+ = pass. When the agent uses tools, the judge is told which tools were called so it doesn't mistakenly penalize Claude for "making things up" — it trusts that the tool results were accurate.

---

## 7. Tool Calling — Giving the Consultant a Toolbox

**Analogy:** Your consultant is smart, but they don't know everything from memory. So you give them a set of tools they can use during the meeting: a product catalog search, an order tracking system, a stock checker, a shipping calculator, and an escalation button. They decide on their own which tools to use and in what order to fully answer the customer's question.

That's tool calling. You define the tools and Claude decides when and how to use them.

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
- **MAX_ITERATIONS = 10**: if Claude keeps calling tools without finishing, we stop after 10 rounds and return a friendly error. This prevents infinite loops.
- **Per-tool error handling**: if one tool fails, the error is passed back to Claude as a result. The loop never hangs — Claude can decide what to do with the error.
- **Parallel tool execution**: if Claude requests multiple tools at once, they all run at the same time instead of one by one.

The UI shows tools firing in real time: `calling: search_products → check_product_availability...`

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

**Analogy:** Imagine calling customer support. In version A, every time you ask a follow-up question the agent has no memory of what you just said — you have to repeat everything. In version B, the agent remembers the whole conversation.

We pass the entire conversation to the API each time:

```
[
  { role: "user",      content: "I need headphones for flights" },
  { role: "assistant", content: "The Lumina headphones are great..." },
  { role: "user",      content: "are they in stock?" }   ← new question
]
```

Claude sees the full context and knows "they" refers to the Lumina headphones. The "memory" is just the history being re-sent every turn.

---

## The Full Stack

```
Browser (React)
│
│  User types a question
│  History + new message sent via fetch()
│
▼
Vercel (Next.js Route Handler)  ← server-only, API keys safe here
│
│  Agentic loop (app/lib/agent.ts):
│  ┌─────────────────────────────────────────┐
│  │  Send messages + tool definitions        │
│  │  Claude responds with tool_use blocks    │
│  │  Execute tools (in parallel if multiple) │
│  │  Add tool results to history             │
│  │  Repeat until stop_reason = end_turn     │
│  │  or MAX_ITERATIONS reached               │
│  └─────────────────────────────────────────┘
│
│  Stream text response back via SSE
│  Run LLM-as-judge on completed response
│  Send metadata event (judgment, tool log, prompt version)
│
▼
Browser (React)
│
│  Shows tool calls as they fire
│  Updates text on screen as tokens arrive
│  Shows judgment when metadata event arrives
│  Adds completed message to conversation history
```

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
| Chat history | Re-send full conversation each turn | Support agent with memory |

---

## What's Next

- **Goal #2 — Server-side persistence**: move chat history from React state to a database (Drizzle + SQLite). Each conversation gets a session ID so history survives page refreshes.
- **Goal #3 — Structured logging/observability**: every request logs a JSON object with session ID, tokens used, tool calls, latency, and judgment score — so you can monitor the system in production.
