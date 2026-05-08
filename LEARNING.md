# What We Built — And Why It Works

This document explains everything we built together in plain language, with analogies to make the concepts stick.

---

## The Big Picture

We built an AI-powered product assistant for an electronics store. A customer can type a question like *"I need something for long flights"* and get a smart, accurate answer — even though we never explicitly programmed what to say about flights.

By the end, the full pipeline looks like this:

```
Customer question
  → Find the most relevant products (RAG)
  → Ask Claude to answer using those products (prompt)
  → Stream the answer word by word to the screen (streaming)
  → Grade the answer automatically (LLM-as-judge)
  → Remember the conversation for follow-up questions (chat history)
```

Each piece of that pipeline is explained below.

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
  'product-qa': 3,  // ← change this to switch versions
}
```

- **v1**: concise and helpful
- **v2**: enthusiastic, redirects off-topic questions
- **v3**: dynamic — accepts product context injected from the RAG step

The API response always includes `promptVersion` so you know exactly which recipe was used for each answer. When something breaks, you know which version to investigate.

---

## 5. RAG — The Open-Book Exam

**Analogy:** Imagine two ways to take an exam:
- **Closed-book**: You memorize everything and answer from memory. Risky — you might misremember or make things up.
- **Open-book**: Before answering, you quickly scan the relevant pages and answer based on what you find. More accurate, and you can't invent things that aren't in the book.

RAG (Retrieval-Augmented Generation) is the open-book exam approach. Instead of hoping Claude knows your products, you *retrieve* the relevant product info first and give it to Claude along with the question.

### How retrieval works: Embeddings and Similarity

**Analogy:** Imagine a map where every word or sentence has a location. Words with similar meanings are placed near each other on the map. "Headphones" and "earbuds" are close together. "Power bank" and "battery" are close together. "Keyboard" is far from "speaker."

An **embedding** is just a list of hundreds of numbers that represents a sentence's position on this map. When you embed "I need something for long flights," you get a point on the map. When you embed each of your products, you get more points.

**Finding the best match** = finding which product points are closest to the question point. This is called **cosine similarity** — it measures the angle between two points. Smaller angle = more similar meaning.

```
"long flights" question  →  [0.2, -0.5, 0.8, ...]  (hundreds of numbers)
Lumina Headphones        →  [0.3, -0.4, 0.7, ...]  (very close → high similarity)
TypeFlow Keyboard        →  [-0.6, 0.2, -0.1, ...]  (far away → low similarity)
```

### The RAG pipeline step by step:

1. **Embed the catalog** (done once, cached in memory): convert all 6 products into number vectors using OpenAI's `text-embedding-3-small`
2. **Embed the question**: convert the user's question into a number vector
3. **Compare**: find the 2 products with the highest similarity score
4. **Inject**: paste those 2 product descriptions into the system prompt
5. **Answer**: Claude answers using only the retrieved products as context

This is why Claude correctly recommends headphones and a power bank for "long flights" — even though the word "flight" never appears in any product description. The *meaning* is similar.

---

## 6. LLM-as-Judge — The Quality Inspector

**Analogy:** Imagine a factory assembly line. A worker builds a product, and then a quality inspector checks it before it ships. The inspector has a checklist: Is it accurate? Does it answer the question? Did it invent any features?

LLM-as-judge is the same idea: after Claude answers, a *second* Claude call evaluates the answer.

```
First call:  Claude answers the customer's question
Second call: Claude (as judge) scores the answer 1–5 and explains why
```

The judge checks:
- **Accuracy** — did it only mention features that are actually in the product catalog?
- **Helpfulness** — did it actually answer what was asked?
- **Grounding** — did it avoid making up details not in the retrieved context?

A score of 4+ = pass. This is valuable when you're iterating on prompts: if you change the system prompt and scores drop, you know the new version is worse.

---

## 7. Streaming — Cooking in Front of You

**Analogy:** Two restaurant experiences:
- **No streaming**: You order, wait 10 minutes in silence, then the full plate arrives.
- **Streaming**: The chef cooks in front of you. You can see the dish being assembled in real time.

Without streaming, the UI waits for Claude to finish generating the entire response, then shows it all at once. With streaming, each word arrives as Claude generates it — the text appears token by token, just like ChatGPT.

Technically, the server sends **Server-Sent Events (SSE)** — a stream of small messages:

```
data: {"type":"text","text":"The"}
data: {"type":"text","text":" Lumina"}
data: {"type":"text","text":" headphones"}
...
data: {"type":"metadata","judgment":{...}}
data: [DONE]
```

The browser reads these one by one and appends each word to the screen. The judgment arrives last, after the full response is complete (because the judge needs the complete text to evaluate it).

---

## 8. Chat History — Short-Term Memory

**Analogy:** Imagine calling customer support. In version A, every time you ask a follow-up question the agent has no memory of what you just said — you have to repeat everything. In version B, the agent remembers the whole conversation.

Before chat history, every question was isolated. Claude had no idea what was said before. Now we pass the entire conversation to the API each time:

```
[
  { role: "user",      content: "I need something for long flights" },
  { role: "assistant", content: "I recommend the Lumina headphones!" },
  { role: "user",      content: "how long is the battery?" }   ← new question
]
```

Claude sees the full context and knows that "the battery" refers to the Lumina headphones from the earlier message. This is how all chat-based AI products work — the "memory" is just the history being re-sent every time.

---

## The Full Stack

Here's how all the pieces fit together:

```
Browser (React)
│
│  User types a question
│  History + new message sent via fetch()
│
▼
Vercel (Next.js Route Handler)  ← server-only code, API keys safe here
│
│  1. Embed question → OpenAI API
│  2. Find top 2 similar products (cosine similarity)
│  3. Build system prompt with retrieved products (prompt v3)
│  4. Send messages array to Claude → stream response
│  5. After streaming, judge the response → Claude API (2nd call)
│  6. Send metadata event (judgment, version, retrieved products)
│
▼
Browser (React)
│
│  Reads SSE stream token by token
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
| LLM-as-judge | Second LLM call to grade the first | Quality inspector |
| Streaming (SSE) | Send tokens as they're generated | Chef cooking in front of you |
| Chat history | Re-send full conversation each turn | Support agent with memory |

---

## What Could Come Next

- **Vector database** (Pinecone, Supabase pgvector): right now embeddings are recomputed on every cold start. A real DB stores them permanently and scales to thousands of products.
- **Logging & analytics**: store every question + judgment score in a database to spot patterns — which questions score low? which prompts win?
- **A/B testing**: route 50% of traffic to prompt v2 and 50% to v3, compare average scores with real data.
