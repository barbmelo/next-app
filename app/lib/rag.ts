import 'server-only'
import OpenAI from 'openai'
import { getProducts, type Product } from './products'
import { getStoredEmbeddings, saveEmbeddings } from './db/queries'

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

type ProductWithEmbedding = {
  product: Product
  embedding: number[]
}

let cache: ProductWithEmbedding[] | null = null

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}

async function getProductEmbeddings(): Promise<ProductWithEmbedding[]> {
  if (cache) return cache

  const products = await getProducts()
  const stored = await getStoredEmbeddings()

  const missing = products.filter((p) => !stored.has(p.id))

  if (missing.length > 0) {
    const response = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: missing.map((p) => `${p.name}: ${p.description}`),
    })

    const newEntries = missing.map((product, i) => ({
      productId: product.id,
      embedding: response.data[i].embedding,
    }))

    await saveEmbeddings(newEntries)

    for (const { productId, embedding } of newEntries) {
      stored.set(productId, embedding)
    }
  }

  cache = products.map((product) => ({
    product,
    embedding: stored.get(product.id)!,
  }))

  return cache
}

export function getRagCache() {
  return cache
    ? { loaded: true, count: cache.length, products: cache.map((e) => e.product.name) }
    : { loaded: false, count: 0, products: [] }
}

export async function retrieveProducts(query: string, topK = 2): Promise<Product[]> {
  const [embeddings, queryResponse] = await Promise.all([
    getProductEmbeddings(),
    getOpenAI().embeddings.create({ model: 'text-embedding-3-small', input: query }),
  ])

  const queryEmbedding = queryResponse.data[0].embedding

  return embeddings
    .map(({ product, embedding }) => ({
      product,
      score: cosineSimilarity(queryEmbedding, embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ product }) => product)
}
