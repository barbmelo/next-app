import 'server-only'

export type Product = {
  id: string
  name: string
  price: number
  description: string
}

type FakeStoreProduct = {
  id: number
  title: string
  price: number
  description: string
}

let cache: Product[] | null = null

export async function getProducts(): Promise<Product[]> {
  if (cache) return cache
  const res = await fetch('https://fakestoreapi.com/products/category/electronics', {
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`Fake Store API responded with ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Fake Store API returned unexpected shape: ${JSON.stringify(data).slice(0, 120)}`)
  cache = (data as FakeStoreProduct[]).map((item) => ({
    id: String(item.id),
    name: item.title,
    price: item.price,
    description: item.description,
  }))
  return cache
}
