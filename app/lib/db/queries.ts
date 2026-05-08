import 'server-only'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from './index'
import { sessions, messages } from './schema'

export async function createSession(): Promise<string> {
  const id = randomUUID()
  await db.insert(sessions).values({ id })
  return id
}

export async function getOrCreateSession(sessionId?: string): Promise<string> {
  if (sessionId) {
    const existing = await db
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
  await db.insert(messages).values({ sessionId, role, content })
}

export async function getMessages(
  sessionId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt)

  return rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }))
}
