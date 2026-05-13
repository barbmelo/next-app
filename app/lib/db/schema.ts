import { pgTable, text, serial, timestamp } from 'drizzle-orm/pg-core'

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const productEmbeddings = pgTable('product_embeddings', {
  productId: text('product_id').primaryKey(),
  embedding: text('embedding').notNull(), // JSON-serialized number[]
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
