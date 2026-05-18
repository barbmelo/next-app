import 'server-only'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb } from './index'
import { sessions, messages, productEmbeddings, evaluations } from './schema'

export async function createSession(): Promise<string> {
  const id = randomUUID()
  await getDb().insert(sessions).values({ id })
  return id
}

export async function getOrCreateSession(sessionId?: string): Promise<string> {
  if (sessionId) {
    const existing = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
    if (existing.length > 0) return sessionId
  }
  return createSession()
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await getDb().insert(messages).values({ sessionId, role, content })
}

export async function getMessages(
  sessionId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await getDb()
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt)

  return rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }))
}

export async function getStoredEmbeddings(): Promise<Map<string, number[]>> {
  const rows = await getDb()
    .select({ productId: productEmbeddings.productId, embedding: productEmbeddings.embedding })
    .from(productEmbeddings)
  return new Map(rows.map((r) => [r.productId, JSON.parse(r.embedding) as number[]]))
}

export async function saveEmbeddings(
  entries: { productId: string; embedding: number[] }[]
): Promise<void> {
  await getDb()
    .insert(productEmbeddings)
    .values(entries.map((e) => ({ productId: e.productId, embedding: JSON.stringify(e.embedding) })))
    .onConflictDoNothing()
}

export async function saveEvaluation(params: {
  sessionId: string
  score: number
  passed: boolean
  reason: string
  promptVersion: number
  toolCalls: string[]
}): Promise<void> {
  await getDb().insert(evaluations).values({
    sessionId: params.sessionId,
    score: params.score,
    passed: params.passed,
    reason: params.reason,
    promptVersion: params.promptVersion,
    toolCalls: JSON.stringify(params.toolCalls),
  })
}
