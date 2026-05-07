import 'server-only'
import OpenAI from 'openai'
import { products, type Product } from './products'

const openai = new OpenAI()

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

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: products.map((p) => `${p.name}: ${p.description}`),
  })

  cache = products.map((product, i) => ({
    product,
    embedding: response.data[i].embedding,
  }))

  return cache
}

export async function retrieveProducts(query: string, topK = 2): Promise<Product[]> {
  const [productEmbeddings, queryResponse] = await Promise.all([
    getProductEmbeddings(),
    openai.embeddings.create({ model: 'text-embedding-3-small', input: query }),
  ])

  const queryEmbedding = queryResponse.data[0].embedding

  return productEmbeddings
    .map(({ product, embedding }) => ({
      product,
      score: cosineSimilarity(queryEmbedding, embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ product }) => product)
}
